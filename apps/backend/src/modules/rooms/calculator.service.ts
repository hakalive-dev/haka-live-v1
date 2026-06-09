import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { getIO } from '../../sockets';

type ScoreEntry = {
  userId: string;
  seatPosition: number;
  points: number;
  user: { displayName: string; avatar: string | null };
};

async function fetchScores(sessionId: string): Promise<ScoreEntry[]> {
  const rows = await prisma.calculatorSeatScore.findMany({
    where: { sessionId },
    include: { user: { select: { id: true, displayName: true, avatar: true } } },
    orderBy: { points: 'desc' },
  });
  return rows.map((s) => ({
    userId: s.userId,
    seatPosition: s.seatPosition,
    points: s.points,
    user: { displayName: s.user.displayName, avatar: s.user.avatar },
  }));
}

export async function startSession(
  roomId: string,
  requesterId: string,
  durationSeconds: number | null,
) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== requesterId) throw new AppError('Only the host can start a calculator session', 403);

  const existing = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (existing) throw new AppError('A calculator session is already active', 409);

  const endsAt = durationSeconds ? new Date(Date.now() + durationSeconds * 1000) : null;
  const session = await prisma.calculatorSession.create({
    data: { roomId, durationSeconds, endsAt },
  });

  try {
    getIO().to(roomId).emit('calculator:started', {
      sessionId: session.id,
      durationSeconds,
      startedAt: session.startedAt,
      scores: [],
    });
  } catch (_) { /* Socket.io not initialized (e.g. test env) */ }

  // Fire end precisely when the session expires (cron is backup for restarts)
  if (durationSeconds) {
    setTimeout(() => {
      endSession(session.id).catch(() => {});
    }, durationSeconds * 1000 + 500);
  }

  return session;
}

export async function endSession(sessionId: string) {
  const session = await prisma.calculatorSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError('Session not found', 404);
  if (session.status === 'ended') return { session, scores: await fetchScores(sessionId) };

  const updated = await prisma.calculatorSession.update({
    where: { id: sessionId },
    data: { status: 'ended', endedAt: new Date() },
  });

  const scores = await fetchScores(sessionId);
  try {
    getIO().to(session.roomId).emit('calculator:ended', { sessionId, scores });
  } catch (_) { /* Socket.io not initialized (e.g. test env) */ }

  return { session: updated, scores };
}

export async function endSessionByRoomId(roomId: string, requesterId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== requesterId) throw new AppError('Only the host can end a calculator session', 403);

  const session = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (!session) throw new AppError('No active calculator session', 404);

  return endSession(session.id);
}

/**
 * End the currently active calculator session for a room (if any).
 *
 * This is intended for server-side lifecycle hooks (mic drops / disconnects),
 * so it intentionally does NOT enforce "host only" permissions.
 */
export async function endActiveSessionForRoom(roomId: string) {
  const session = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (!session) return null;
  return endSession(session.id);
}

export async function addPoints(roomId: string, senderId: string, recipientId: string, coinAmount: number) {
  const session = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (!session) return;

  const seat = await prisma.roomSeat.findFirst({ where: { roomId, userId: recipientId } });
  if (!seat) return;

  await Promise.all([
    prisma.calculatorSeatScore.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: recipientId } },
      create: { sessionId: session.id, roomId, userId: recipientId, seatPosition: seat.position, points: coinAmount },
      update: { points: { increment: coinAmount } },
    }),
    prisma.calculatorGiftContribution.upsert({
      where: {
        sessionId_senderId_recipientId: {
          sessionId: session.id,
          senderId,
          recipientId,
        },
      },
      create: {
        sessionId: session.id,
        roomId,
        senderId,
        recipientId,
        points: coinAmount,
      },
      update: { points: { increment: coinAmount } },
    }),
  ]);

  const scores = await fetchScores(session.id);
  try {
    getIO().to(roomId).emit('calculator:score_update', { sessionId: session.id, scores });
  } catch (_) { /* Socket.io not initialized (e.g. test env) */ }
}

export async function getContributors(roomId: string) {
  const session = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (!session) return [];

  const rows = await prisma.calculatorGiftContribution.findMany({
    where: { sessionId: session.id },
    include: { sender: { select: { id: true, displayName: true, avatar: true, hakaId: true } } },
  });

  const bySender = new Map<string, { senderId: string; points: number; user: { displayName: string; avatar: string | null; hakaId: string | null } }>();
  for (const r of rows) {
    const existing = bySender.get(r.senderId);
    if (existing) {
      existing.points += r.points;
    } else {
      bySender.set(r.senderId, {
        senderId: r.senderId,
        points: r.points,
        user: {
          displayName: r.sender.displayName,
          avatar: r.sender.avatar,
          hakaId: r.sender.hakaId,
        },
      });
    }
  }

  return [...bySender.values()].sort((a, b) => b.points - a.points);
}

export async function getRecipientContributors(roomId: string, recipientId: string) {
  const session = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (!session) {
    return { totalReceiving: 0, recipient: null, contributors: [] };
  }

  const [seatScore, rows, recipientUser] = await Promise.all([
    prisma.calculatorSeatScore.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: recipientId } },
    }),
    prisma.calculatorGiftContribution.findMany({
      where: { sessionId: session.id, recipientId },
      include: { sender: { select: { id: true, displayName: true, avatar: true, hakaId: true } } },
      orderBy: { points: 'desc' },
    }),
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, displayName: true, avatar: true, hakaId: true },
    }),
  ]);

  return {
    totalReceiving: seatScore?.points ?? 0,
    recipient: recipientUser,
    contributors: rows.map((r) => ({
      senderId: r.senderId,
      points: r.points,
      user: {
        displayName: r.sender.displayName,
        avatar: r.sender.avatar,
        hakaId: r.sender.hakaId,
      },
    })),
  };
}

export async function resetScore(roomId: string, userId: string) {
  const session = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (!session) return;

  await prisma.calculatorSeatScore.deleteMany({
    where: { sessionId: session.id, userId },
  });

  const scores = await fetchScores(session.id);
  try {
    getIO().to(roomId).emit('calculator:score_update', { sessionId: session.id, scores });
  } catch (_) { /* Socket.io not initialized (e.g. test env) */ }
}

export async function recoverActiveSessions() {
  const active = await prisma.calculatorSession.findMany({
    where: { status: 'active', endsAt: { not: null } },
  });
  for (const session of active) {
    const remaining = session.endsAt!.getTime() - Date.now();
    if (remaining <= 0) {
      await endSession(session.id).catch(() => {});
    } else {
      setTimeout(() => endSession(session.id).catch(() => {}), remaining + 500);
    }
  }
}

export async function getActiveSession(roomId: string) {
  const session = await prisma.calculatorSession.findFirst({
    where: { roomId, status: 'active' },
  });
  if (!session) return { session: null, scores: [] };

  const scores = await fetchScores(session.id);
  return { session, scores };
}
