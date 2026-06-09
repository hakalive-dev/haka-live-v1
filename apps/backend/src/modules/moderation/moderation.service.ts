import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { forceLogout } from './revocation.service';
import { createAdminNotification } from '../admin/notifications/admin-notifications.service';

/**
 * Create a report.
 */
export async function report(
  reporterId: string,
  targetType: string,
  targetId: string,
  reason: string,
  description: string,
) {
  if (targetType === 'user' && targetId === reporterId) {
    throw new AppError('You cannot report yourself', 400);
  }

  const created = await prisma.report.create({
    data: {
      reporterId,
      targetType,
      targetId,
      reason,
      description,
    },
    include: {
      reporter: { select: { id: true, displayName: true, avatar: true } },
    },
  });

  await createAdminNotification({
    type: 'report_submitted',
    title: 'New user report',
    body: `${reason} (${targetType}) · ${description.slice(0, 120)}${description.length > 120 ? '…' : ''}`,
    linkPath: '/moderation',
    entityType: 'Report',
    entityId: created.id,
  });

  return created;
}

/**
 * Admin: get paginated reports with optional status filter.
 */
export async function getReports(page: number, limit: number, status?: string) {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        reporter: { select: { id: true, displayName: true, avatar: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/**
 * Admin: update a report's status.
 */
export async function reviewReport(reportId: string, status: 'reviewed' | 'dismissed') {
  const existing = await prisma.report.findUnique({ where: { id: reportId } });
  if (!existing) throw new AppError('Report not found', 404);

  return prisma.report.update({
    where: { id: reportId },
    data: {
      status,
      reviewedAt: new Date(),
    },
  });
}

/**
 * Admin: ban a user.
 */
export async function banUser(
  adminId: string,
  userId: string,
  reason: string,
  banType: 'permanent' | 'temporary',
  expiresAt?: Date,
) {
  if (banType === 'temporary' && !expiresAt) {
    throw new AppError('expiresAt is required for temporary bans', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const [ban] = await prisma.$transaction([
    prisma.ban.create({
      data: {
        userId,
        adminId,
        bannedBy: adminId,
        type: 'platform',
        reason,
        banType,
        expiresAt: expiresAt ?? null,
        isActive: true,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    }),
    // Revoke all refresh tokens so the user is logged out immediately
    prisma.refreshToken.deleteMany({
      where: { userId },
    }),
  ]);

  // Kill live sessions and access JWTs
  await forceLogout(userId, 'banned');

  return ban;
}

/**
 * Admin: ban a user from a single room (not platform-wide).
 * Does not revoke tokens — user stays logged in, just can't join the room.
 */
export async function banUserFromRoom(
  adminId: string,
  userId: string,
  roomId: string,
  reason: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const existing = await prisma.ban.findFirst({
    where: { userId, roomId, type: 'room', isActive: true },
  });
  if (existing) throw new AppError('User is already banned from this room', 409);

  return prisma.ban.create({
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
}

/**
 * Admin: lift a room ban.
 */
export async function unbanUserFromRoom(userId: string, roomId: string) {
  const result = await prisma.ban.updateMany({
    where: { userId, roomId, type: 'room', isActive: true },
    data: { isActive: false },
  });
  if (result.count === 0) throw new AppError('No active room ban found', 404);
  return { userId, roomId, unbanned: true };
}

/**
 * Check whether a user is banned from a specific room.
 * Auto-deactivates expired temporary bans.
 */
export async function isUserBannedFromRoom(userId: string, roomId: string): Promise<boolean> {
  const details = await getActiveRoomBanDetails(userId, roomId);
  return details !== null;
}

/** Active room ban (kick cooldown or admin ban) with expiry for client messaging. */
export async function getActiveRoomBanDetails(
  userId: string,
  roomId: string,
): Promise<{ expiresAt: string; cooldownMinutes: number } | null> {
  const { hasSuperAdminPower } = await import('./super-admin-power');
  if (await hasSuperAdminPower(userId)) return null;

  const now = new Date();
  const ban = await prisma.ban.findFirst({
    where: {
      userId,
      roomId,
      type: 'room',
      isActive: true,
      OR: [
        { banType: 'permanent', expiresAt: null },
        { banType: 'temporary', expiresAt: { gt: now } },
        { expiresAt: null },
      ],
    },
    select: { expiresAt: true, banType: true },
  });
  if (!ban) return null;

  if (ban.banType === 'permanent' || !ban.expiresAt) {
    return { expiresAt: '', cooldownMinutes: 0 };
  }

  const msLeft = ban.expiresAt.getTime() - now.getTime();
  return {
    expiresAt: ban.expiresAt.toISOString(),
    cooldownMinutes: Math.max(1, Math.ceil(msLeft / 60_000)),
  };
}

/**
 * Admin: unban a user.
 */
export async function unbanUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  await prisma.$transaction([
    prisma.ban.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    }),
  ]);

  return { userId, unbanned: true };
}

/**
 * Admin: list active bans.
 */
export async function getBans(page: number, limit: number) {
  const where = { isActive: true };
  const [items, total] = await Promise.all([
    prisma.ban.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, displayName: true, avatar: true } },
      },
    }),
    prisma.ban.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/**
 * Check if a user is currently banned.
 */
export async function isUserBanned(userId: string): Promise<boolean> {
  const now = new Date();
  // Read-only: expiresAt > now already excludes expired bans without a write.
  // Stale cleanup is handled by the background expiry job, not on hot request paths.
  const ban = await prisma.ban.findFirst({
    where: {
      userId,
      type: 'platform',
      isActive: true,
      OR: [
        { banType: 'permanent' },
        { banType: 'temporary', expiresAt: { gt: now } },
      ],
    },
  });
  return ban !== null;
}

// ── Device Bans ──────────────────────────────────────────────────────────────

/**
 * Check if a device is currently banned.
 */
export async function isDeviceBanned(deviceId: string): Promise<boolean> {
  const now = new Date();
  const ban = await prisma.deviceBan.findFirst({
    where: {
      deviceId,
      isActive: true,
      OR: [
        { banType: 'permanent' },
        { banType: 'temporary', expiresAt: { gt: now } },
      ],
    },
  });
  return ban !== null;
}

/**
 * Admin: ban a device.
 */
export async function banDevice(
  adminId: string,
  deviceId: string,
  reason: string,
  banType: 'permanent' | 'temporary',
  expiresAt?: Date,
) {
  if (banType === 'temporary' && !expiresAt) {
    throw new AppError('expiresAt is required for temporary bans', 400);
  }

  // Check if device is already banned
  const existing = await prisma.deviceBan.findFirst({
    where: { deviceId, isActive: true },
  });
  if (existing) throw new AppError('Device is already banned', 409);

  const ban = await prisma.deviceBan.create({
    data: {
      deviceId,
      adminId,
      reason,
      banType,
      expiresAt: expiresAt ?? null,
      isActive: true,
    },
  });

  // Revoke all refresh tokens for every user linked to this device
  const deviceLinks = await prisma.userDevice.findMany({
    where: { deviceId },
    select: { userId: true },
  });
  if (deviceLinks.length > 0) {
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: deviceLinks.map((d) => d.userId) } },
    });
  }

  return ban;
}

/**
 * Admin: unban a device.
 */
export async function unbanDevice(deviceId: string) {
  const result = await prisma.deviceBan.updateMany({
    where: { deviceId, isActive: true },
    data: { isActive: false },
  });
  if (result.count === 0) throw new AppError('No active ban found for this device', 404);
  return { deviceId, unbanned: true };
}

/**
 * Admin: list active device bans.
 */
export async function getDeviceBans(page: number, limit: number) {
  const where = { isActive: true };
  const [items, total] = await Promise.all([
    prisma.deviceBan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deviceBan.count({ where }),
  ]);

  return { items, total, page, limit, hasMore: page * limit < total };
}
