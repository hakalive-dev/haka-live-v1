import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { forceLogout } from '../../moderation/revocation.service';
import { banUser as unifiedBanUser } from '../users/admin-users.service';
import { getIO } from '../../../sockets';

export interface ListParams {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

// Resolves a user by Haka ID or Special ID number — never by internal UUID.
async function resolveUserByIdentifier(identifier: string) {
  const byHakaId = await prisma.user.findUnique({ where: { hakaId: identifier } });
  if (byHakaId) return byHakaId;

  const inventory = await prisma.specialIdInventory.findFirst({
    where: { specialId: { number: identifier } },
    select: { userId: true },
  });
  if (!inventory) return null;

  return prisma.user.findUnique({ where: { id: inventory.userId } });
}

// ── Reports ────────────────────────────────────────────────────────────────────

export async function listReports(params: ListParams & { status?: string; targetType?: string }) {
  const { page, limit, status, targetType, sort = 'createdAt', order = 'desc' } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.ReportWhereInput = {};
  if (status) where.status = status;
  if (targetType) where.targetType = targetType;

  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        reporter: { select: { id: true, displayName: true, hakaId: true, avatar: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function reviewReport(adminId: string, reportId: string, status: 'reviewed' | 'dismissed', ipAddress?: string) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new AppError('Report not found', 404);

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: { status, reviewedAt: new Date() },
  });

  await logAdminAction(adminId, `report.${status}`, 'Report', reportId, { reason: report.reason }, ipAddress);
  return updated;
}

// ── Bans ───────────────────────────────────────────────────────────────────────

export async function listBans(params: ListParams & { isActive?: boolean }) {
  const { page, limit, isActive, sort = 'createdAt', order = 'desc' } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.BanWhereInput = {};
  if (isActive !== undefined) where.isActive = isActive;

  const [items, total] = await Promise.all([
    prisma.ban.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        user: { select: { id: true, displayName: true, hakaId: true, avatar: true } },
      },
    }),
    prisma.ban.count({ where }),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function createBan(
  adminId: string,
  userIdentifier: string,
  reason: string,
  banType: 'permanent' | 'temporary',
  expiresAt?: Date,
  ipAddress?: string,
  proofUrl?: string,
  result?: string,
) {
  const user = await resolveUserByIdentifier(userIdentifier);
  if (!user) throw new AppError('User not found', 404);

  // Route through the unified banUser helper so both admin entry points share
  // the same enforcement (Ban row, User.isActive, refreshToken cleanup,
  // forceLogout + socket disconnect, audit log).
  await unifiedBanUser(adminId, user.id, { reason, banType, expiresAt: expiresAt ?? null, proofUrl, result }, ipAddress);

  const ban = await prisma.ban.findFirst({
    where: { userId: user.id, type: 'platform', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return ban;
}

// ── Room Bans ─────────────────────────────────────────────────────────────────

export async function createRoomBan(
  adminId: string,
  userIdentifier: string,
  roomId: string,
  reason: string,
  ipAddress?: string,
) {
  const user = await resolveUserByIdentifier(userIdentifier);
  if (!user) throw new AppError('User not found', 404);
  const userId = user.id;

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);

  const existing = await prisma.ban.findFirst({
    where: { userId, roomId, type: 'room', isActive: true },
  });
  if (existing) throw new AppError('User is already banned from this room', 409);

  const ban = await prisma.ban.create({
    data: {
      userId,
      adminId,
      bannedBy: adminId,
      type: 'room',
      roomId,
      reason,
      banType: 'permanent',
      isActive: true,
    },
  });

  // Real-time enforcement: vacate any seat the user currently occupies, kick
  // them out of the socket room, and notify their device so the room screen
  // pops back to the room list immediately.
  const occupiedSeats = await prisma.roomSeat.findMany({
    where: { roomId, userId },
    select: { id: true, position: true },
  });
  if (occupiedSeats.length > 0) {
    await prisma.roomSeat.updateMany({
      where: { roomId, userId },
      data: { userId: null, isMuted: false },
    });
  }

  try {
    const io = getIO();
    if (occupiedSeats.length > 0) {
      const refreshed = await prisma.roomSeat.findMany({
        where: { roomId, position: { in: occupiedSeats.map(s => s.position) } },
        include: { user: { select: { id: true, displayName: true, avatar: true } } },
      });
      for (const seat of refreshed) {
        io.to(roomId).emit('seat.updated', seat);
      }
    }
    io.to(`user:${userId}`).emit('room:kicked', { roomId, reason: 'banned_from_room' });
    // Forcibly remove every socket belonging to this user from the room.
    const userRoom = io.sockets.adapter.rooms.get(`user:${userId}`);
    if (userRoom) {
      for (const sid of userRoom) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.leave(roomId);
      }
    }
  } catch { /* socket may be unavailable */ }

  await logAdminAction(adminId, 'room.ban_user', 'Room', roomId, { userId, reason }, ipAddress);
  return ban;
}

export async function liftRoomBan(adminId: string, banId: string, ipAddress?: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban || ban.type !== 'room') throw new AppError('Room ban not found', 404);
  await prisma.ban.update({ where: { id: banId }, data: { isActive: false } });
  await logAdminAction(adminId, 'room.unban_user', 'Room', ban.roomId ?? '', { userId: ban.userId }, ipAddress);
  return { lifted: true };
}

export async function liftBan(adminId: string, banId: string, ipAddress?: string) {
  const ban = await prisma.ban.findUnique({ where: { id: banId }, include: { user: true } });
  if (!ban) throw new AppError('Ban not found', 404);

  await prisma.$transaction([
    prisma.ban.update({ where: { id: banId }, data: { isActive: false } }),
    prisma.user.update({ where: { id: ban.userId }, data: { isActive: true } }),
  ]);

  await logAdminAction(adminId, 'user.unban', 'User', ban.userId, {}, ipAddress);
  return { lifted: true };
}

export async function updateBanResult(
  adminId: string,
  banId: string,
  data: { proofUrl?: string; result?: string },
  ipAddress?: string,
) {
  const ban = await prisma.ban.findUnique({ where: { id: banId } });
  if (!ban) throw new AppError('Ban not found', 404);

  const updated = await prisma.ban.update({
    where: { id: banId },
    data: {
      ...(data.proofUrl !== undefined && { proofUrl: data.proofUrl }),
      ...(data.result !== undefined && { result: data.result }),
    },
  });

  await logAdminAction(adminId, 'ban.update_result', 'Ban', banId, data, ipAddress);
  return updated;
}

// ── KYC / Verify ──────────────────────────────────────────────────────────────

export async function verifyUser(adminId: string, userIdentifier: string, ipAddress?: string) {
  const user = await resolveUserByIdentifier(userIdentifier);
  if (!user) throw new AppError('User not found', 404);
  const userId = user.id;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isVerified: true },
    select: { id: true, displayName: true, hakaId: true, isVerified: true },
  });

  await logAdminAction(adminId, 'user.verify', 'User', userId, {}, ipAddress);
  return updated;
}

export async function unverifyUser(adminId: string, userIdentifier: string, ipAddress?: string) {
  const user = await resolveUserByIdentifier(userIdentifier);
  if (!user) throw new AppError('User not found', 404);
  const userId = user.id;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isVerified: false },
    select: { id: true, displayName: true, hakaId: true, isVerified: true },
  });

  await logAdminAction(adminId, 'user.unverify', 'User', userId, {}, ipAddress);
  return updated;
}

// ── Device Bans ──────────────────────────────────────────────────────────────

export async function listDeviceBans(params: ListParams) {
  const { page, limit, sort = 'createdAt', order = 'desc' } = params;
  const skip = (page - 1) * limit;

  // Active = isActive=true AND (no expiry OR expiry in the future). The
  // ban-expiry cron eventually flips `isActive` to false, but we still want
  // the list to be honest in the gap before the next sweep.
  const where: Prisma.DeviceBanWhereInput = {
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };

  const [items, total] = await Promise.all([
    prisma.deviceBan.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
    }),
    prisma.deviceBan.count({ where }),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function createDeviceBan(
  adminId: string,
  deviceId: string,
  reason: string,
  banType: 'permanent' | 'temporary',
  expiresAt?: Date,
  ipAddress?: string,
) {
  if (banType === 'temporary' && !expiresAt) {
    throw new AppError('expiresAt is required for temporary bans', 400);
  }

  const existing = await prisma.deviceBan.findFirst({ where: { deviceId, isActive: true } });
  if (existing) throw new AppError('Device is already banned', 409);

  const ban = await prisma.deviceBan.create({
    data: { deviceId, adminId, reason, banType, expiresAt: expiresAt ?? null, isActive: true },
  });

  // Revoke all refresh tokens for every user linked to this device, and
  // forcibly disconnect their active sockets. Without forceLogout, a user
  // already mid-session on the banned device could keep emitting events
  // until their access token expired.
  const deviceLinks = await prisma.userDevice.findMany({
    where: { deviceId },
    select: { userId: true },
  });
  if (deviceLinks.length > 0) {
    const userIds = Array.from(new Set(deviceLinks.map((d) => d.userId)));
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    for (const uid of userIds) {
      try {
        await forceLogout(uid, 'device_banned');
      } catch (err: any) {
        console.error(`device-ban: forceLogout failed for ${uid}:`, err?.message ?? err);
      }
    }
  }

  await logAdminAction(adminId, 'device.ban', 'Device', deviceId, { reason, banType }, ipAddress);
  return ban;
}

export async function liftDeviceBan(adminId: string, deviceId: string, ipAddress?: string) {
  const result = await prisma.deviceBan.updateMany({
    where: { deviceId, isActive: true },
    data: { isActive: false },
  });
  if (result.count === 0) throw new AppError('No active ban found for this device', 404);

  await logAdminAction(adminId, 'device.unban', 'Device', deviceId, {}, ipAddress);
  return { lifted: true };
}
