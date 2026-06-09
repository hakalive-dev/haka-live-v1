import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { redis } from '../../../config/redis';
import { getIO } from '../../../sockets';
import { createTemporaryRoomKickBan } from '../../rooms/rooms.service';

export interface ListRoomsParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  category?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export async function listRooms(params: ListRoomsParams) {
  const { page, limit, search, status, category, sort = 'createdAt', order = 'desc' } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.RoomWhereInput = {};
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { host: { displayName: { contains: search, mode: 'insensitive' } } },
      { host: { hakaId: { contains: search, mode: 'insensitive' } } },
      { host: { activeSpecialId: { contains: search, mode: 'insensitive' } } },
    ];
  }
  if (status) where.status = status;
  if (category) where.category = category;

  const SORTABLE_FIELDS = new Set(['createdAt', 'startedAt', 'endedAt', 'title', 'viewerCount', 'status', 'category']);
  const safeSort = SORTABLE_FIELDS.has(sort) ? sort : 'createdAt';

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where, skip, take: limit,
      orderBy: { [safeSort]: order },
      include: { host: { select: { id: true, displayName: true, avatar: true, hakaId: true } } },
    }),
    prisma.room.count({ where }),
  ]);

  return {
    rooms,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getRoomDetail(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      host: { select: { id: true, displayName: true, avatar: true, hakaId: true } },
      seats: {
        orderBy: { position: 'asc' },
        include: { user: { select: { id: true, displayName: true, avatar: true } } },
      },
      _count: { select: { messages: true } },
    },
  });
  if (!room) throw new AppError('Room not found', 404);
  return room;
}

export interface UpdateRoomInput {
  title?: string;
  description?: string;
  coverImage?: string;
  category?: string;
}

export async function updateRoom(
  adminId: string,
  roomId: string,
  data: UpdateRoomInput,
  ipAddress?: string,
) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);

  const updated = await prisma.room.update({
    where: { id: roomId },
    data,
    include: {
      host: { select: { id: true, displayName: true, avatar: true, hakaId: true } },
      seats: {
        orderBy: { position: 'asc' },
        include: { user: { select: { id: true, displayName: true, avatar: true } } },
      },
      _count: { select: { messages: true } },
    },
  });

  await logAdminAction(
    adminId,
    'room.update',
    'Room',
    roomId,
    { before: { title: room.title, category: room.category, coverImage: room.coverImage }, after: data },
    ipAddress,
  );
  return updated;
}

export async function resetRoomCover(adminId: string, roomId: string, ipAddress?: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  const updated = await prisma.room.update({ where: { id: roomId }, data: { coverImage: '' } });
  await logAdminAction(adminId, 'room.reset_cover', 'Room', roomId, {}, ipAddress);
  return { id: updated.id, coverImage: updated.coverImage };
}

export async function resetRoomAnnouncement(adminId: string, roomId: string, ipAddress?: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  const updated = await prisma.room.update({ where: { id: roomId }, data: { description: '' } });
  await logAdminAction(adminId, 'room.reset_announcement', 'Room', roomId, {}, ipAddress);
  return { id: updated.id, description: updated.description };
}

/**
 * Internal helper that performs the full close-and-teardown sequence for a
 * room: ends mic sessions, marks status='ended', clears seats, drops Redis
 * applicants, and sets the Agora revoke watermark. Returns the closed room's
 * title (or null if it was already ended / missing).
 *
 * Retained for tests and rare operational scripts — product API no longer
 * exposes admin force-close; prefer {@link vacateUserFromRoomSeats} to remove
 * a user from seats without ending the room.
 */
export async function tearDownRoom(roomId: string): Promise<string | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, title: true, status: true },
  });
  if (!room || room.status === 'ended') return null;

  try {
    const openSessions = await prisma.hostMicSession.findMany({
      where: { roomId, endedAt: null },
      select: { userId: true },
    });
    const { endMicSession } = await import('../../hosts/hosts.service');
    await Promise.all(openSessions.map((s) => endMicSession(s.userId, roomId).catch(() => null)));
  } catch { /* non-fatal */ }

  await prisma.$transaction([
    prisma.room.update({
      where: { id: roomId },
      data: { status: 'ended', endedAt: new Date() },
    }),
    prisma.roomSeat.updateMany({
      where: { roomId },
      data: { userId: null },
    }),
  ]);

  try { await redis.del(`room:${roomId}:applicants`); } catch {}
  try { await redis.set(`agora:revoked:${roomId}`, Date.now().toString(), 'EX', 3600); } catch {}

  return room.title;
}

/** Remove a user from all mic seats in a room without changing room status. */
export async function vacateUserFromRoomSeats(
  roomId: string,
  userId: string,
): Promise<Array<{ position: number; isLocked: boolean }>> {
  const occupied = await prisma.roomSeat.findMany({
    where: { roomId, userId },
    select: { position: true, isLocked: true },
  });
  if (occupied.length === 0) return [];

  await prisma.roomSeat.updateMany({
    where: { roomId, userId },
    data: { userId: null, isMuted: false },
  });

  try {
    const { endMicSession } = await import('../../hosts/hosts.service');
    await endMicSession(userId, roomId).catch(() => null);
  } catch { /* non-fatal */ }

  try {
    await redis.hdel(`room:${roomId}:applicants`, userId);
  } catch { /* non-fatal */ }

  return occupied.map((s) => ({ position: s.position, isLocked: s.isLocked }));
}

/**
 * Hard-delete a previously-ended room and all its child rows.
 * Only allowed for `status='ended'` rooms.
 */
export async function deleteRoom(adminId: string, roomId: string, ipAddress?: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, title: true, status: true },
  });
  if (!room) throw new AppError('Room not found', 404);
  if (room.status !== 'ended') {
    throw new AppError('Only ended rooms can be deleted. The room must have status "ended" first.', 400);
  }

  await prisma.$transaction([
    prisma.roomMessage.deleteMany({ where: { roomId } }),
    prisma.roomSeat.deleteMany({ where: { roomId } }),
    prisma.roomAdmin.deleteMany({ where: { roomId } }),
    prisma.ban.deleteMany({ where: { roomId, type: 'room' } }),
    prisma.room.delete({ where: { id: roomId } }),
  ]);

  try { await redis.del(`room:${roomId}:applicants`); } catch {}
  try { await redis.del(`room:${roomId}:viewers`); } catch {}
  try { await redis.del(`agora:revoked:${roomId}`); } catch {}

  await logAdminAction(adminId, 'room.delete', 'Room', roomId, { title: room.title }, ipAddress);
  return { message: `Room "${room.title}" deleted` };
}

export async function getRoomMessages(roomId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [messages, total] = await Promise.all([
    prisma.roomMessage.findMany({
      where: { roomId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, displayName: true, hakaId: true } },
      },
    }),
    prisma.roomMessage.count({ where: { roomId } }),
  ]);
  return {
    messages,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function forceEndRoom(adminId: string, roomId: string, ipAddress?: string) {
  const title = await tearDownRoom(roomId);
  if (!title) throw new AppError('Room not found or already ended', 404);

  try {
    getIO().to(roomId).emit('room:ended', { roomId, reason: 'admin_force_end' });
  } catch { /* socket may be unavailable in scripts/tests */ }

  await logAdminAction(adminId, 'room.force_end', 'Room', roomId, { title }, ipAddress);
  return { message: `Room "${title}" ended`, roomId };
}

export async function getRoomViewers(roomId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const key = `room:${roomId}:viewers`;
  const allIds = await redis.smembers(key);
  const total = allIds.length;
  const viewerIds = allIds.slice(skip, skip + limit);

  const users = await prisma.user.findMany({
    where: { id: { in: viewerIds } },
    select: { id: true, displayName: true, avatar: true, hakaId: true, role: true, isActive: true },
  });
  const byId = new Map(users.map(user => [user.id, user]));
  return {
    viewers: viewerIds.map(id => byId.get(id)).filter(Boolean),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function kickUserFromRoom(
  adminId: string,
  roomId: string,
  userId: string,
  reason = 'Kicked by admin',
  ipAddress?: string,
) {
  const { hasSuperAdminPower } = await import('../../moderation/super-admin-power');
  if (await hasSuperAdminPower(userId)) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    if (admin?.role !== 'super_admin') {
      throw new AppError('Cannot kick a user with super admin power', 403);
    }
  }

  const vacated = await vacateUserFromRoomSeats(roomId, userId);
  await redis.srem(`room:${roomId}:viewers`, userId);

  const ban = await createTemporaryRoomKickBan(roomId, adminId, userId, reason);

  try {
    const io = getIO();
    io.to(roomId).emit('room:user-kicked', { roomId, userId, reason });
    io.to(`user:${userId}`).emit('room:kicked', {
      roomId,
      reason,
      cooldownMinutes: ban?.cooldownMinutes,
    });
    const kickedSockets = [...(io.sockets.adapter.rooms.get(roomId) ?? [])]
      .map((sid) => io.sockets.sockets.get(sid))
      .filter((s) => s?.data?.userId === userId);
    for (const socket of kickedSockets) {
      socket?.leave(roomId);
    }
  } catch { /* socket may be unavailable */ }

  await logAdminAction(
    adminId,
    'room.kick_user',
    'Room',
    roomId,
    { userId, reason, vacatedSeats: vacated.map(s => s.position) },
    ipAddress,
  );
  return { message: 'User kicked from room', userId, vacatedSeats: vacated.map(s => s.position) };
}

export async function setSeatLock(
  adminId: string,
  roomId: string,
  position: number,
  isLocked: boolean,
  ipAddress?: string,
) {
  if (position === 1) throw new AppError('Cannot lock the host seat', 400);
  const updated = await prisma.roomSeat.update({
    where: { roomId_position: { roomId, position } },
    data: { isLocked, ...(isLocked ? { userId: null } : {}) },
  });
  await logAdminAction(adminId, 'room.seat_lock', 'Room', roomId, { position, isLocked }, ipAddress);
  try { getIO().to(roomId).emit('seat.updated', updated); } catch {}
  return updated;
}

export async function setSeatMute(
  adminId: string,
  roomId: string,
  position: number,
  isMuted: boolean,
  ipAddress?: string,
) {
  if (position === 1) throw new AppError('Cannot mute the host seat', 400);
  const updated = await prisma.roomSeat.update({
    where: { roomId_position: { roomId, position } },
    data: { isMuted },
    include: { user: { select: { id: true, displayName: true, avatar: true, hakaId: true } } },
  });
  await logAdminAction(adminId, 'room.seat_mute', 'Room', roomId, { position, isMuted }, ipAddress);
  try { getIO().to(roomId).emit('seat.updated', updated); } catch {}
  return updated;
}

export async function kickFromSeat(
  adminId: string,
  roomId: string,
  position: number,
  ipAddress?: string,
) {
  if (position === 1) throw new AppError('Cannot kick the host', 400);
  const seat = await prisma.roomSeat.findUnique({ where: { roomId_position: { roomId, position } } });
  if (!seat) throw new AppError('Seat not found', 404);
  if (seat.userId) {
    const { hasSuperAdminPower } = await import('../../moderation/super-admin-power');
    if (await hasSuperAdminPower(seat.userId)) {
      const admin = await prisma.adminUser.findUnique({
        where: { id: adminId },
        select: { role: true },
      });
      if (admin?.role !== 'super_admin') {
        throw new AppError('Cannot kick a user with super admin power', 403);
      }
    }
  }
  const updated = await prisma.roomSeat.update({
    where: { roomId_position: { roomId, position } },
    data: { userId: null, isMuted: false },
  });

  if (seat.userId) {
    try {
      const { endMicSession } = await import('../../hosts/hosts.service');
      await endMicSession(seat.userId, roomId).catch(() => null);
    } catch {}
  }

  const ban = seat.userId
    ? await createTemporaryRoomKickBan(roomId, adminId, seat.userId, 'Kicked from seat by admin')
    : null;

  await logAdminAction(adminId, 'room.seat_kick', 'Room', roomId, { position, userId: seat.userId }, ipAddress);
  try {
    const io = getIO();
    io.to(roomId).emit('seat.updated', updated);
    if (seat.userId) {
      io.to(`user:${seat.userId}`).emit('room:kicked', {
        roomId,
        reason: 'You have been kicked from this room.',
        cooldownMinutes: ban?.cooldownMinutes,
      });
      const kickedSockets = [...(io.sockets.adapter.rooms.get(roomId) ?? [])]
        .map((sid) => io.sockets.sockets.get(sid))
        .filter((s) => s?.data?.userId === seat.userId);
      for (const socket of kickedSockets) {
        socket?.leave(roomId);
      }
    }
  } catch {}
  return { ...updated, kickedUserId: seat.userId ?? null };
}

export async function listRoomBans(roomId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const where: Prisma.BanWhereInput = { roomId, type: 'room', isActive: true };
  const [bans, total] = await Promise.all([
    prisma.ban.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, displayName: true, hakaId: true } } },
    }),
    prisma.ban.count({ where }),
  ]);
  return { bans, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export interface CreateRoomBanInput {
  userId: string;
  reason?: string;
  durationHours?: number;
}

export async function createRoomBan(
  adminId: string,
  roomId: string,
  input: CreateRoomBanInput,
  ipAddress?: string,
) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, title: true } });
  if (!room) throw new AppError('Room not found', 404);
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, displayName: true } });
  if (!user) throw new AppError('User not found', 404);

  const expiresAt = input.durationHours ? new Date(Date.now() + input.durationHours * 60 * 60 * 1000) : null;
  const ban = await prisma.ban.create({
    data: {
      userId: input.userId,
      adminId,
      bannedBy: adminId,
      type: 'room',
      roomId,
      reason: input.reason?.trim() || 'Room banned by admin',
      banType: expiresAt ? 'temporary' : 'permanent',
      expiresAt,
      isActive: true,
    },
  });

  await kickUserFromRoom(adminId, roomId, input.userId, 'room_banned', ipAddress);
  await logAdminAction(adminId, 'room.ban_create', 'Room', roomId, { userId: input.userId, banId: ban.id }, ipAddress);
  return ban;
}

export async function deleteRoomBan(adminId: string, roomId: string, banId: string, ipAddress?: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban || ban.roomId !== roomId || ban.type !== 'room') throw new AppError('Room ban not found', 404);
  const updated = await prisma.ban.update({ where: { id: banId }, data: { isActive: false } });
  await logAdminAction(adminId, 'room.ban_delete', 'Room', roomId, { userId: ban.userId, banId }, ipAddress);
  return updated;
}
