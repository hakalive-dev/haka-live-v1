import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { userSummarySelect, serializeUserSummary } from '../users/user-summary';

/**
 * Debounce before clearing presence on socket disconnect.
 * Mobile socket.io uses reconnectionDelayMax=5000ms — must exceed that + handshake buffer.
 */
export const FULL_LEAVE_DEBOUNCE_MS = 8000;

/** Remember mic seats cleared by disconnect-leave so a late reconnect can restore them. */
export const DISCONNECT_SEAT_GRACE_SEC = 120;

export function disconnectSeatGraceKey(roomId: string, userId: string): string {
  return `room:${roomId}:seatGrace:${userId}`;
}

export async function rememberDisconnectSeats(
  roomId: string,
  userId: string,
  positions: number[],
): Promise<void> {
  if (positions.length === 0) return;
  await redis.set(
    disconnectSeatGraceKey(roomId, userId),
    JSON.stringify(positions),
    'EX',
    DISCONNECT_SEAT_GRACE_SEC,
  );
}

export async function clearDisconnectSeatGrace(roomId: string, userId: string): Promise<void> {
  await redis.del(disconnectSeatGraceKey(roomId, userId));
}

export type RestoredSeatSnapshot = {
  position: number;
  userId: string | null;
  user: ReturnType<typeof serializeUserSummary> | null;
  isLocked: boolean;
  isMuted: boolean;
};

/** Re-assign grace seats that are still empty and unlocked. Clears grace key on success. */
export async function restoreSeatsFromDisconnectGrace(
  roomId: string,
  userId: string,
): Promise<RestoredSeatSnapshot[]> {
  const raw = await redis.get(disconnectSeatGraceKey(roomId, userId));
  if (!raw) return [];

  let positions: number[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    positions = parsed.filter((p): p is number => typeof p === 'number' && p > 0);
  } catch {
    return [];
  }
  if (positions.length === 0) return [];

  const restored: RestoredSeatSnapshot[] = [];

  for (const position of positions) {
    const seat = await prisma.roomSeat.findUnique({
      where: { roomId_position: { roomId, position } },
      select: { userId: true, isLocked: true, isMuted: true },
    });
    if (!seat || seat.userId || seat.isLocked) continue;

    const updated = await prisma.roomSeat.update({
      where: { roomId_position: { roomId, position } },
      data: { userId },
      include: { user: { select: userSummarySelect() } },
    });

    restored.push({
      position: updated.position,
      userId: updated.userId,
      user: updated.user ? serializeUserSummary(updated.user) : null,
      isLocked: updated.isLocked,
      isMuted: updated.isMuted,
    });
  }

  if (restored.length > 0) {
    await clearDisconnectSeatGrace(roomId, userId);
  }

  return restored;
}
