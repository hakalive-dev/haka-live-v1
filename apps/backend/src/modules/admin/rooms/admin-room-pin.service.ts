import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

export type PinDuration = '2h' | '1d' | '3d' | '5d' | '7d' | 'permanent';

function expiresAtFromDuration(duration: PinDuration): Date | null {
  if (duration === 'permanent') return null;
  const map: Record<string, number> = {
    '2h': 2 * 60 * 60 * 1000,
    '1d': 86400 * 1000,
    '3d': 3 * 86400 * 1000,
    '5d': 5 * 86400 * 1000,
    '7d': 7 * 86400 * 1000,
  };
  return new Date(Date.now() + map[duration]);
}

export async function pinRoom(
  adminId: string,
  roomId: string,
  duration: PinDuration,
  reason: string,
  ipAddress?: string,
) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, title: true } });
  if (!room) throw new AppError('Room not found', 404);

  const expiresAt = expiresAtFromDuration(duration);

  const pin = await prisma.roomPin.upsert({
    where: { roomId },
    create: { roomId, pinnedBy: adminId, reason, expiresAt },
    update: { pinnedBy: adminId, reason, expiresAt },
  });

  await logAdminAction(adminId, 'room.pin', 'Room', roomId, { duration, reason, expiresAt }, ipAddress);
  return pin;
}

export async function unpinRoom(adminId: string, roomId: string, ipAddress?: string) {
  const existing = await prisma.roomPin.findUnique({ where: { roomId } });
  if (!existing) throw new AppError('Room is not pinned', 404);

  await prisma.roomPin.delete({ where: { roomId } });
  await logAdminAction(adminId, 'room.unpin', 'Room', roomId, {}, ipAddress);
  return { roomId, unpinned: true };
}

export async function listPinnedRooms() {
  const now = new Date();
  // Clean up expired pins
  await prisma.roomPin.deleteMany({ where: { expiresAt: { lt: now } } });

  return prisma.roomPin.findMany({
    include: {
      room: {
        select: {
          id: true,
          title: true,
          coverImage: true,
          status: true,
          category: true,
          viewerCount: true,
          host: { select: { id: true, displayName: true, hakaId: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getRoomPinStatus(roomId: string) {
  const now = new Date();
  const pin = await prisma.roomPin.findUnique({ where: { roomId } });
  if (!pin) return { isPinned: false };
  if (pin.expiresAt && pin.expiresAt < now) {
    await prisma.roomPin.delete({ where: { roomId } });
    return { isPinned: false };
  }
  return { isPinned: true, pin };
}
