import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../middleware/error.middleware';

const ALLOWED_DURATIONS = new Set([60, 120, 300, 600, 1800]);

export type BattleMode = 'coins' | 'votes';

export interface BattleEndResult {
  battleId: string;
  winnerId: string | null;
  scoreA: number;
  scoreB: number;
}

type EndCallback = (battleId: string, result: BattleEndResult) => void;

let endCallback: EndCallback = () => {};
const battleTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function setBattleEndCallback(fn: EndCallback): void {
  endCallback = fn;
}

function scheduleTimer(
  battleId: string,
  participantAId: string,
  participantBId: string,
  ms: number,
): void {
  const existing = battleTimers.get(battleId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    battleTimers.delete(battleId);
    try {
      const result = await endBattle(battleId, participantAId, participantBId);
      endCallback(battleId, result);
    } catch {}
  }, ms);

  battleTimers.set(battleId, timer);
}

export async function startBattle(input: {
  roomId: string;
  hostId: string;
  participantAId: string;
  participantBId: string;
  mode: BattleMode;
  durationSecs: number;
}) {
  if (!ALLOWED_DURATIONS.has(input.durationSecs)) {
    throw new AppError(
      `durationSecs must be one of: ${[...ALLOWED_DURATIONS].join(', ')}`,
      400,
    );
  }

  const existing = await prisma.normalBattle.findFirst({
    where: { roomId: input.roomId, status: 'active' },
  });
  if (existing) throw new AppError('There is already an active battle in this room', 409);

  const battle = await prisma.normalBattle.create({
    data: {
      roomId: input.roomId,
      hostId: input.hostId,
      participantAId: input.participantAId,
      participantBId: input.participantBId,
      mode: input.mode,
      durationSecs: input.durationSecs,
    },
  });

  const endsAt = Date.now() + input.durationSecs * 1000;
  await redis.set(`battle:${battle.id}:endsAt`, String(endsAt));

  scheduleTimer(battle.id, input.participantAId, input.participantBId, input.durationSecs * 1000);

  return battle;
}

export async function getActiveBattle(roomId: string) {
  return prisma.normalBattle.findFirst({ where: { roomId, status: 'active' } });
}

export async function addScore(battleId: string, side: 'A' | 'B', points: number) {
  await redis.incrby(`battle:${battleId}:score${side}`, points);
  const [rawA, rawB] = await redis.mget(
    `battle:${battleId}:scoreA`,
    `battle:${battleId}:scoreB`,
  );
  return { scoreA: Number(rawA ?? 0), scoreB: Number(rawB ?? 0) };
}

export async function endBattle(
  battleId: string,
  participantAId: string,
  participantBId: string,
): Promise<BattleEndResult> {
  const [rawA, rawB] = await redis.mget(
    `battle:${battleId}:scoreA`,
    `battle:${battleId}:scoreB`,
  );
  const scoreA = Number(rawA ?? 0);
  const scoreB = Number(rawB ?? 0);

  let winnerId: string | null = null;
  if (scoreA > scoreB) winnerId = participantAId;
  else if (scoreB > scoreA) winnerId = participantBId;

  await prisma.normalBattle.update({
    where: { id: battleId },
    data: { status: 'ended', winnerId, scoreA, scoreB, endedAt: new Date() },
  });

  await redis.del(
    `battle:${battleId}:scoreA`,
    `battle:${battleId}:scoreB`,
    `battle:${battleId}:endsAt`,
  );

  return { battleId, winnerId, scoreA, scoreB };
}

export async function cancelBattle(battleId: string) {
  const existing = battleTimers.get(battleId);
  if (existing) {
    clearTimeout(existing);
    battleTimers.delete(battleId);
  }

  await prisma.normalBattle.update({
    where: { id: battleId },
    data: { status: 'cancelled', endedAt: new Date() },
  });

  await redis.del(
    `battle:${battleId}:scoreA`,
    `battle:${battleId}:scoreB`,
    `battle:${battleId}:endsAt`,
  );
}

export async function recoverActiveBattles(): Promise<void> {
  const active = await prisma.normalBattle.findMany({ where: { status: 'active' } });
  for (const battle of active) {
    const endsAtRaw = await redis.get(`battle:${battle.id}:endsAt`);
    if (!endsAtRaw) {
      await endBattle(battle.id, battle.participantAId, battle.participantBId).catch(() => {});
      continue;
    }
    const remaining = Number(endsAtRaw) - Date.now();
    if (remaining <= 0) {
      await endBattle(battle.id, battle.participantAId, battle.participantBId).catch(() => {});
    } else {
      scheduleTimer(battle.id, battle.participantAId, battle.participantBId, remaining);
    }
  }
}
