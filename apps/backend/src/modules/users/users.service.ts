import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { getIO } from '../../sockets';
import { computeAge } from '../accounts/accounts.service';
import { resolveUserActiveRoom } from '../rooms/rooms.service';
import { isVisibleOnlineToViewer, shouldHideOnlineFromViewer } from './presence';
import {
  EquippedCosmetics,
  equippedStoreItemsWhere,
  parseEquippedCosmetics,
} from './user-summary';
import { mapSortedUserTags, userTagsOrderedInclude } from '../moderation/tags.service';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PublicUser extends EquippedCosmetics {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string;
  bio: string;
  country: string;
  gender: string;
  age: number | null;
  hakaId: string | null;
  originalHakaId: string | null;
  role: string;
  hostType: string;
  friendCount: number;
  followerCount: number;
  followingCount: number;
  momentsCount: number;
  richLevel: number;
  charmLevel: number;
  monthlySent: number;
  monthlyReceived: number;
  // Viewer-relative fields (null when unauthenticated)
  isFollowing: boolean | null;
  isSpecialAttention: boolean | null;
  createdAt: Date;
  tags: { name: string; displayName: string; color: string; iconUrl: string; sortOrder: number }[];
  activeSpecialId: string | null;
  activeSpecialIdLevel: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function buildPublicUser(
  userId: string,
  viewerId: string | null,
): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { followedBy: true, following: true, moments: true } },
      tags: userTagsOrderedInclude,
      level: { select: { richLevel: true, charmLevel: true } },
      settings: { select: { hideLivestreamLevel: true, invisibleOnline: true } },
      storeItems: {
        where: equippedStoreItemsWhere(),
        select: {
          item: { select: { id: true, name: true, image: true, previewImage: true, category: true, level: true } },
        },
      },
    },
  });

  if (!user || !user.isActive) throw new AppError('User not found', 404);
  if (user.profileHidden) throw new AppError('User not found', 404);

  const cosmetics = parseEquippedCosmetics(user.storeItems);

  // Active special ID comes from the User model now
  const now = new Date();
  const specialIdValid = user.activeSpecialId &&
    (!user.activeSpecialIdExpiresAt || user.activeSpecialIdExpiresAt > now);
  const activeSpecialId = specialIdValid ? user.activeSpecialId : null;

  const hideLevel = !!user.settings?.hideLivestreamLevel && viewerId !== userId;

  // Monthly sent/received coin/bean stats — past 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [sentAgg, receivedAgg, friendCount] = await Promise.all([
    prisma.giftTransaction.aggregate({
      where: { senderId: userId, createdAt: { gte: since } },
      _sum: { coinCost: true },
    }),
    prisma.giftTransaction.aggregate({
      where: { recipientId: userId, createdAt: { gte: since } },
      _sum: { beanValue: true },
    }),
    prisma.follow.count({
      where: {
        actorId: userId,
        target: {
          isActive: true,
          profileHidden: false,
          following: { some: { targetId: userId } },
        },
      },
    }),
  ]);

  let isFollowing: boolean | null = null;
  let isSpecialAttention: boolean | null = null;

  if (viewerId && viewerId !== userId) {
    const [follow, sa] = await Promise.all([
      prisma.follow.findUnique({
        where: { actorId_targetId: { actorId: viewerId, targetId: userId } },
      }),
      prisma.specialAttention.findUnique({
        where: { actorId_targetId: { actorId: viewerId, targetId: userId } },
      }),
    ]);
    isFollowing = !!follow;
    isSpecialAttention = !!sa;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    bio: user.bio,
    country: user.country,
    gender: user.gender,
    age: computeAge(user.dateOfBirth),
    hakaId: activeSpecialId ?? user.hakaId,
    originalHakaId: user.hakaId,
    role: user.role,
    hostType: user.hostType,
    friendCount,
    followerCount: user._count.followedBy,
    followingCount: user._count.following,
    momentsCount: user._count.moments,
    isFollowing,
    isSpecialAttention,
    createdAt: user.createdAt,
    richLevel: hideLevel ? 0 : (user.level?.richLevel ?? 1),
    charmLevel: hideLevel ? 0 : (user.level?.charmLevel ?? 1),
    monthlySent: sentAgg._sum.coinCost ?? 0,
    monthlyReceived: receivedAgg._sum.beanValue ?? 0,
    tags: mapSortedUserTags(user.tags),
    ...cosmetics,
    activeSpecialId,
    activeSpecialIdLevel: activeSpecialId ? user.activeSpecialIdLevel : null,
  };
}

// ── Service methods ────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an internal UUID, `User.hakaId`, or an active public Special ID (`User.activeSpecialId`
 * with null or future `activeSpecialIdExpiresAt`) to an internal User id.
 */
export async function resolveUserId(idOrHakaId: string): Promise<string> {
  const trimmed = idOrHakaId.trim();
  if (UUID_RE.test(trimmed)) {
    const u = await prisma.user.findUnique({ where: { id: trimmed }, select: { id: true } });
    if (!u) throw new AppError('User not found', 404);
    return u.id;
  }

  const now = new Date();
  const [byId, byHaka, bySpecial] = await Promise.all([
    prisma.user.findUnique({ where: { id: trimmed }, select: { id: true } }),
    prisma.user.findUnique({ where: { hakaId: trimmed }, select: { id: true } }),
    prisma.user.findFirst({
      where: {
        activeSpecialId: trimmed,
        OR: [{ activeSpecialIdExpiresAt: null }, { activeSpecialIdExpiresAt: { gt: now } }],
      },
      select: { id: true },
    }),
  ]);

  const user = byId ?? byHaka ?? bySpecial;
  if (!user) throw new AppError('User not found', 404);
  return user.id;
}

/** GET /api/v1/users/:id (accepts UUID, hakaId, or active Special ID) */
export async function getProfile(idOrHakaId: string, viewerId: string | null) {
  const userId = await resolveUserId(idOrHakaId);
  return buildPublicUser(userId, viewerId);
}

/** POST /api/v1/profile/location */
export async function updateLocation(userId: string, lat: number, lng: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { locationLat: lat, locationLng: lng, locationUpdatedAt: new Date() },
  });
}

/**
 * GET /api/v1/users/nearby?lat=&lng=
 * Haversine distance via raw SQL; returns closest users within radiusKm.
 */
export async function getNearbyUsers(
  viewerId: string | null,
  lat: number,
  lng: number,
  radiusKm = 50,
  limit = 20,
): Promise<PublicUser[]> {
  const excludeSelf = viewerId
    ? Prisma.sql`AND id <> ${viewerId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM users
    WHERE "locationLat" IS NOT NULL
      AND "locationLng" IS NOT NULL
      AND "isActive" = true
      AND "profileHidden" = false
      ${excludeSelf}
      AND (
        6371 * acos(
          cos(radians(${lat})) * cos(radians("locationLat")) *
          cos(radians("locationLng") - radians(${lng})) +
          sin(radians(${lat})) * sin(radians("locationLat"))
        )
      ) <= ${radiusKm}
    ORDER BY (
      6371 * acos(
        cos(radians(${lat})) * cos(radians("locationLat")) *
        cos(radians("locationLng") - radians(${lng})) +
        sin(radians(${lat})) * sin(radians("locationLat"))
      )
    ) ASC
    LIMIT ${limit}
  `;
  return Promise.all(rows.map((r) => buildPublicUser(r.id, viewerId)));
}

/** GET /api/v1/users/search?q= */
export async function searchUsers(
  q: string,
  viewerId: string | null,
  page = 1,
  limit = 20,
): Promise<PaginatedResult<PublicUser>> {
  const skip = (page - 1) * limit;
  const qt = q.trim();
  const or: Prisma.UserWhereInput[] = [
    { username: { contains: q, mode: 'insensitive' as const } },
    { displayName: { contains: q, mode: 'insensitive' as const } },
    { hakaId: { contains: q, mode: 'insensitive' as const } },
    {
      activeSpecialId: { contains: q, mode: 'insensitive' as const },
      activeSpecialIdExpiresAt: { gt: new Date() },
    },
  ];
  if (UUID_RE.test(qt)) {
    or.push({ id: qt });
  }
  const where = {
    isActive: true,
    onboardingComplete: true,
    profileHidden: false,
    OR: or,
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  const items = await Promise.all(users.map((u) => buildPublicUser(u.id, viewerId)));

  return { items, total, page, limit, hasMore: skip + users.length < total };
}

/** POST /api/v1/users/:id/follow */
export async function followUser(actorId: string, targetId: string) {
  if (actorId === targetId) throw new AppError('Cannot follow yourself', 400);

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive) throw new AppError('User not found', 404);
  if (target.profileHidden) throw new AppError('User not found', 404);

  await prisma.follow.upsert({
    where: { actorId_targetId: { actorId, targetId } },
    create: { actorId, targetId },
    update: {},
  });
}

/** DELETE /api/v1/users/:id/follow */
export async function unfollowUser(actorId: string, targetId: string) {
  await prisma.follow.deleteMany({ where: { actorId, targetId } });
}

/** GET /api/v1/users/:id/followers */
export async function getFollowers(
  userId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResult<PublicUser>> {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { targetId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { actorId: true },
    }),
    prisma.follow.count({ where: { targetId: userId } }),
  ]);

  const items = await Promise.all(rows.map((r) => buildPublicUser(r.actorId, userId)));
  return { items, total, page, limit, hasMore: skip + rows.length < total };
}

/** GET /api/v1/users/:id/friends */
export async function getFriends(
  userId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResult<PublicUser>> {
  const skip = (page - 1) * limit;
  const where = {
    actorId: userId,
    target: {
      isActive: true,
      profileHidden: false,
      following: { some: { targetId: userId } },
    },
  };

  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { targetId: true },
    }),
    prisma.follow.count({ where }),
  ]);

  const items = await Promise.all(rows.map((r) => buildPublicUser(r.targetId, userId)));
  return { items, total, page, limit, hasMore: skip + rows.length < total };
}

/** GET /api/v1/users/:id/following */
export async function getFollowing(
  userId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResult<PublicUser>> {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { actorId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { targetId: true },
    }),
    prisma.follow.count({ where: { actorId: userId } }),
  ]);

  const items = await Promise.all(rows.map((r) => buildPublicUser(r.targetId, userId)));
  return { items, total, page, limit, hasMore: skip + rows.length < total };
}

/** POST /api/v1/users/:id/special-attention */
export async function addSpecialAttention(actorId: string, targetId: string) {
  if (actorId === targetId) throw new AppError('Cannot add yourself', 400);

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive) throw new AppError('User not found', 404);

  // Must be following the user first
  const follow = await prisma.follow.findUnique({
    where: { actorId_targetId: { actorId, targetId } },
  });
  if (!follow) throw new AppError('You must follow this user first', 400);

  // Cap at 50
  const count = await prisma.specialAttention.count({ where: { actorId } });
  if (count >= 50) throw new AppError('Special attention list is full (max 50)', 400);

  await prisma.specialAttention.upsert({
    where: { actorId_targetId: { actorId, targetId } },
    create: { actorId, targetId },
    update: {},
  });
}

/** DELETE /api/v1/users/:id/special-attention */
export async function removeSpecialAttention(actorId: string, targetId: string) {
  await prisma.specialAttention.deleteMany({ where: { actorId, targetId } });
}

/** GET /api/v1/users/me/special-attention */
export async function getSpecialAttentionList(
  actorId: string,
  page = 1,
  limit = 50,
): Promise<PaginatedResult<PublicUser>> {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.specialAttention.findMany({
      where: { actorId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { targetId: true },
    }),
    prisma.specialAttention.count({ where: { actorId } }),
  ]);

  const items = await Promise.all(rows.map((r) => buildPublicUser(r.targetId, actorId)));
  return { items, total, page, limit, hasMore: skip + rows.length < total };
}

/** POST /api/v1/users/:id/visit — log or refresh a profile visit */
export async function logVisit(actorId: string, targetId: string) {
  if (actorId === targetId) return; // don't record self-visits

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive) throw new AppError('User not found', 404);

  // Honour invisible_visitor privilege — skip recording the visit entirely.
  const actorSettings = await prisma.userSettings.findUnique({
    where: { userId: actorId },
    select: { invisibleVisitor: true },
  });
  if (actorSettings?.invisibleVisitor) return;

  await prisma.profileVisit.upsert({
    where: { actorId_targetId: { actorId, targetId } },
    create: { actorId, targetId },
    update: { updatedAt: new Date() },
  });

  try {
    const visitor = await buildPublicUser(actorId, targetId);
    getIO().to(`user:${targetId}`).emit('profile:new_visitor', {
      user: visitor,
      visitedAt: new Date().toISOString(),
    });
  } catch {}
}

/** GET /api/v1/users/me/visitors */
export async function getMyVisitors(
  userId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResult<{ user: PublicUser; visitedAt: string }>> {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.profileVisit.findMany({
      where: { targetId: userId },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: { actorId: true, updatedAt: true },
    }),
    prisma.profileVisit.count({ where: { targetId: userId } }),
  ]);

  const users = await Promise.all(rows.map((r) => buildPublicUser(r.actorId, userId)));
  const items = users.map((user, i) => ({ user, visitedAt: rows[i].updatedAt.toISOString() }));
  return { items, total, page, limit, hasMore: skip + rows.length < total };
}

// ── Presence ────────────────────────────────────────────────────────────────

export async function getPresence(userId: string, viewerId: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      lastSeenAt: true,
      settings: { select: { invisibleOnline: true } },
    },
  });
  if (!user) throw new AppError('User not found', 404);

  const invisibleOnline = !!user.settings?.invisibleOnline;
  if (shouldHideOnlineFromViewer(invisibleOnline, userId, viewerId)) {
    return { isOnline: false, lastSeenAt: null, activeRoom: null };
  }

  const isOnline = isVisibleOnlineToViewer(userId, viewerId, invisibleOnline);
  const activeRoom = await resolveUserActiveRoom(userId);
  return { isOnline, lastSeenAt: user.lastSeenAt, activeRoom };
}
