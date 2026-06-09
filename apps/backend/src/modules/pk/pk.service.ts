import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../middleware/error.middleware';

// In-memory match timer registry (survives within a process lifetime)
const matchTimers = new Map<string, NodeJS.Timeout>();

// Callback set by sockets layer to emit pk:ended when a timer fires
let onMatchEnd: ((matchId: string, result: EndMatchResult) => void) | null = null;

export function setMatchEndCallback(fn: (matchId: string, result: EndMatchResult) => void) {
  onMatchEnd = fn;
}

export interface EndMatchResult {
  matchId: string;
  winnerId: string;
  scoreA: number;
  scoreB: number;
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export async function joinQueue(userId: string, durationSecs: number): Promise<void> {
  await redis.zadd(`pk:queue:${durationSecs}`, Date.now(), userId);
}

export async function leaveQueue(userId: string, durationSecs: number): Promise<void> {
  await redis.zrem(`pk:queue:${durationSecs}`, userId);
}

// ── Invite ────────────────────────────────────────────────────────────────────

export interface CreateInviteInput {
  fromRoomId: string;
  toRoomId: string;
  fromHostId: string;
  toHostId: string;
  durationSecs: number;
}

export async function createInvite(input: CreateInviteInput) {
  const expiresAt = new Date(Date.now() + 30_000); // 30s window
  return prisma.pkInvite.create({
    data: {
      fromRoomId: input.fromRoomId,
      toRoomId: input.toRoomId,
      fromHostId: input.fromHostId,
      toHostId: input.toHostId,
      durationSecs: input.durationSecs,
      expiresAt,
    },
  });
}

export async function acceptInvite(inviteId: string) {
  const invite = await prisma.pkInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new AppError('Invite not found', 404);
  if (invite.status !== 'pending') throw new AppError('Invite already resolved', 400);
  if (invite.expiresAt < new Date()) throw new AppError('Invite expired', 400);

  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.pkMatch.create({
      data: {
        roomAId: invite.fromRoomId,
        roomBId: invite.toRoomId,
        hostAId: invite.fromHostId,
        hostBId: invite.toHostId,
        durationSecs: invite.durationSecs,
        status: 'active',
      },
    });
    await tx.pkInvite.update({
      where: { id: inviteId },
      data: { status: 'accepted', matchId: created.id },
    });
    return created;
  });

  const endsAtMs = Date.now() + invite.durationSecs * 1000;
  await redis.set(`pk:${match.id}:endsAt`, endsAtMs);

  scheduleMatchEnd(match.id, match.hostAId, match.hostBId, invite.durationSecs * 1000);
  const { startPkPresenceForMatch } = await import('../hosts/pk-presence.service');
  await startPkPresenceForMatch(match.id, match.hostAId, match.hostBId).catch(() => undefined);
  return { ...match, endsAt: new Date(endsAtMs).toISOString() };
}

export async function declineInvite(inviteId: string) {
  return prisma.pkInvite.update({
    where: { id: inviteId },
    data: { status: 'declined' },
  });
}

// ── Match lifecycle ───────────────────────────────────────────────────────────

export async function createRandomMatch(
  hostAId: string, roomAId: string,
  hostBId: string, roomBId: string,
  durationSecs: number,
) {
  const match = await prisma.pkMatch.create({
    data: { roomAId, roomBId, hostAId, hostBId, durationSecs, status: 'active' },
  });
  await redis.set(`pk:${match.id}:endsAt`, Date.now() + durationSecs * 1000);
  scheduleMatchEnd(match.id, hostAId, hostBId, durationSecs * 1000);
  const { startPkPresenceForMatch } = await import('../hosts/pk-presence.service');
  await startPkPresenceForMatch(match.id, hostAId, hostBId).catch(() => undefined);
  return match;
}

export async function getActiveMatchForRoom(roomId: string) {
  return prisma.pkMatch.findFirst({
    where: {
      status: 'active',
      OR: [{ roomAId: roomId }, { roomBId: roomId }],
    },
  });
}

export interface AddScoreResult {
  matchId: string;
  scoreA: number;
  scoreB: number;
}

export async function addScore(matchId: string, side: 'A' | 'B', points: number): Promise<AddScoreResult> {
  await redis.incrby(`pk:${matchId}:score${side}`, points);
  const [rawA, rawB] = await redis.mget(`pk:${matchId}:scoreA`, `pk:${matchId}:scoreB`);
  return { matchId, scoreA: Number(rawA ?? 0), scoreB: Number(rawB ?? 0) };
}

export async function endMatch(matchId: string, hostAId: string, hostBId: string): Promise<EndMatchResult | null> {
  const existing = await prisma.pkMatch.findFirst({ where: { id: matchId, status: 'active' } });
  if (!existing) return null; // already ended or not found
  // Throw explicitly on Redis failure — silent 0 scores would silently record a wrong winner
  const [rawA, rawB] = await redis.mget(`pk:${matchId}:scoreA`, `pk:${matchId}:scoreB`);
  const scoreA = Number(rawA ?? 0);
  const scoreB = Number(rawB ?? 0);
  const winnerId = scoreA >= scoreB ? hostAId : hostBId;

  await Promise.all([
    prisma.pkMatch.update({
      where: { id: matchId },
      data: { status: 'ended', scoreA, scoreB, winnerId, endedAt: new Date() },
    }),
    redis.del(`pk:${matchId}:scoreA`, `pk:${matchId}:scoreB`, `pk:${matchId}:endsAt`),
  ]);

  cancelMatchTimer(matchId);
  const { endPkPresenceForMatch } = await import('../hosts/pk-presence.service');
  await endPkPresenceForMatch(matchId).catch(() => undefined);
  return { matchId, winnerId, scoreA, scoreB };
}

export async function forfeit(matchId: string, forfeitingHostId: string) {
  const match = await prisma.pkMatch.findFirst({ where: { id: matchId, status: 'active' } });
  if (!match) throw new AppError('No active match found', 404);
  const winnerId = match.hostAId === forfeitingHostId ? match.hostBId : match.hostAId;

  const [rawA, rawB] = await redis.mget(`pk:${matchId}:scoreA`, `pk:${matchId}:scoreB`);
  const scoreA = Number(rawA ?? 0);
  const scoreB = Number(rawB ?? 0);

  await Promise.all([
    prisma.pkMatch.update({
      where: { id: matchId },
      data: { status: 'ended', scoreA, scoreB, winnerId, endedAt: new Date() },
    }),
    redis.del(`pk:${matchId}:scoreA`, `pk:${matchId}:scoreB`, `pk:${matchId}:endsAt`),
  ]);

  cancelMatchTimer(matchId);
  const { endPkPresenceForMatch } = await import('../hosts/pk-presence.service');
  await endPkPresenceForMatch(matchId).catch(() => undefined);
  return { matchId, winnerId, scoreA, scoreB };
}

// ── Live rooms (for invite browse) ────────────────────────────────────────────

export async function getLiveRoomsForPk(excludeRoomId: string) {
  return prisma.room.findMany({
    where: { status: 'live', id: { not: excludeRoomId } },
    select: {
      id: true,
      title: true,
      viewerCount: true,
      host: { select: { id: true, displayName: true, avatar: true } },
    },
    orderBy: { viewerCount: 'desc' },
    take: 50,
  });
}

// ── Startup recovery ──────────────────────────────────────────────────────────

export async function recoverActiveMatches() {
  const active = await prisma.pkMatch.findMany({ where: { status: 'active' } });
  for (const m of active) {
    const endsAtRaw = await redis.get(`pk:${m.id}:endsAt`);
    const endsAt = endsAtRaw ? Number(endsAtRaw) : m.startedAt.getTime() + m.durationSecs * 1000;
    const remaining = endsAt - Date.now();
    if (remaining <= 0) {
      const result = await endMatch(m.id, m.hostAId, m.hostBId);
      if (result) onMatchEnd?.(m.id, result);
    } else {
      scheduleMatchEnd(m.id, m.hostAId, m.hostBId, remaining);
    }
  }
}

// ── Internal timer helpers ────────────────────────────────────────────────────

function scheduleMatchEnd(matchId: string, hostAId: string, hostBId: string, delayMs: number) {
  cancelMatchTimer(matchId);
  const timer = setTimeout(async () => {
    try {
      const result = await endMatch(matchId, hostAId, hostBId);
      if (result) onMatchEnd?.(matchId, result);
    } catch { /* match may have been ended already */ }
  }, delayMs);
  matchTimers.set(matchId, timer);
}

function cancelMatchTimer(matchId: string) {
  const t = matchTimers.get(matchId);
  if (t) { clearTimeout(t); matchTimers.delete(matchId); }
}
