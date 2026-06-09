import { Server } from 'socket.io';
import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import * as pkService from '../modules/pk/pk.service';
import { PK_EVENTS } from '../shared-types';
import { withSchedulerLock } from '../utils/distributed-lock';

const DURATIONS = [300, 600, 1800];
let intervalId: NodeJS.Timeout | null = null;

export function startPkMatchmaker(io: Server): void {
  if (intervalId) return;

  intervalId = setInterval(() => {
    void withSchedulerLock('pk:matchmaker:tick', 15, async () => {
      for (const dur of DURATIONS) {
        try {
          await runMatchmaking(io, dur);
        } catch (err) {
          console.error(`[PK matchmaker] error for duration ${dur}:`, err);
        }
      }
    }).catch((err) => console.error('[PK matchmaker] lock tick failed:', err));
  }, 5_000);

  console.log('⚔️  PK matchmaker started (5s interval)');
}

export function stopPkMatchmaker(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

async function runMatchmaking(io: Server, durationSecs: number): Promise<void> {
  const queueKey = `pk:queue:${durationSecs}`;
  const entries = await redis.zrange(queueKey, 0, 1);
  if (entries.length < 2) return;

  const [userAId, userBId] = entries;

  const [userA, userB] = await Promise.all([
    prisma.room.findFirst({ where: { hostId: userAId, status: 'live' } }),
    prisma.room.findFirst({ where: { hostId: userBId, status: 'live' } }),
  ]);

  if (!userA) { await redis.zrem(queueKey, userAId); return; }
  if (!userB) { await redis.zrem(queueKey, userBId); return; }

  await redis.zrem(queueKey, userAId, userBId);

  const match = await pkService.createRandomMatch(
    userAId, userA.id,
    userBId, userB.id,
    durationSecs,
  );

  await io.in(userA.id).socketsJoin(`pk:${match.id}`);
  await io.in(userB.id).socketsJoin(`pk:${match.id}`);

  const endsAt = new Date(Date.now() + durationSecs * 1000).toISOString();
  io.to(`pk:${match.id}`).emit(PK_EVENTS.STARTED, {
    matchId: match.id,
    hostAId: match.hostAId,
    hostBId: match.hostBId,
    roomAId: match.roomAId,
    roomBId: match.roomBId,
    scoreA: 0,
    scoreB: 0,
    durationSecs,
    endsAt,
  });

  console.log(`[PK] Match ${match.id} started: ${userAId} vs ${userBId} (${durationSecs}s)`);
}
