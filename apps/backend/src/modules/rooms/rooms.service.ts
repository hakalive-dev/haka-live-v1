import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { userSummarySelect, serializeUserSummary, emptyEquippedCosmetics } from '../users/user-summary';
import { roomMessageSelect, serializeRoomMessage } from '../chat/chat.service';
import { redis } from '../../config/redis';
import { getIO } from '../../sockets';
import { getUserActiveRoomId } from './user-active-room';
import {
  getConnectedUserIdsInRoom,
  hydrateOccupiedSeatCounts,
  hydrateViewerCountsFromRedis,
} from './room-presence';
import {
  batchRegionalEarnerRanksByUserId,
  buildRegionKeyFromUserCountryCity,
  displayCountryName,
} from '../leaderboard/leaderboard.service';
import { getMappedUid, getRtcUidMap } from './agora.service';

// ── Constants ──────────────────────────────────────────────────────────────────

export const VALID_MIC_CONFIGS = [5, 10, 15, 20, 25, 30] as const;
export const VALID_CATEGORIES = ['general', 'music', 'talk', 'gaming', 'dating', 'education'] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateRoomInput {
  title: string;
  description?: string;
  coverImage?: string;
  category?: string;
  type?: string;
  micConfig?: number;
  password?: string;
  roomMode?: 'chat' | 'live';
}

export interface UpdateRoomInput {
  title?: string;
  description?: string;
  coverImage?: string;
  category?: string;
  type?: string;
  micConfig?: number;
  password?: string | null;
  applyForMic?: boolean;
  chatLocked?: boolean;
  gameType?: string;
  fanBadge?: string;
  roomMode?: 'chat' | 'live';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build the seat array for a room config (position 1 = host). */
function buildSeats(micConfig: number) {
  return Array.from({ length: micConfig }, (_, i) => ({ position: i + 1 }));
}

/**
 * Add/remove seat rows when micConfig changes (same rules as updateRoom).
 */
async function adjustRoomMicSeats(
  db: Pick<Prisma.TransactionClient, 'roomSeat'>,
  roomId: string,
  oldMicConfig: number,
  newMicConfig: number,
): Promise<void> {
  if (newMicConfig === oldMicConfig) return;
  if (newMicConfig < oldMicConfig) {
    const occupied = await db.roomSeat.findFirst({
      where: { roomId, position: { gt: newMicConfig }, userId: { not: null } },
    });
    if (occupied) throw new AppError('Cannot shrink mic config while upper seats are occupied', 400);
    await db.roomSeat.deleteMany({ where: { roomId, position: { gt: newMicConfig } } });
  } else {
    const extra = Array.from({ length: newMicConfig - oldMicConfig }, (_, i) => ({
      roomId,
      position: oldMicConfig + i + 1,
    }));
    await db.roomSeat.createMany({ data: extra, skipDuplicates: true });
  }
}

async function generateUniqueRoomCode(): Promise<string> {
  for (let i = 0; i < 15; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await prisma.room.findUnique({ where: { roomCode: code } });
    if (!existing) return code;
  }
  throw new AppError('Failed to generate unique room code', 500);
}

function assertHost(room: { hostId: string }, userId: string) {
  if (room.hostId !== userId) throw new AppError('Only the room host can do this', 403);
}

async function assertHostOrAdmin(room: { id: string; hostId: string }, userId: string) {
  if (room.hostId === userId) return;
  const admin = await prisma.roomAdmin.findUnique({
    where: { roomId_userId: { roomId: room.id, userId } },
  });
  if (!admin) throw new AppError('Only the room host or admin can do this', 403);
}

function assertLive(room: { status: string }) {
  if (room.status !== 'live') throw new AppError('Room is not live', 400);
}

type ThemeForRoom = {
  id: string;
  name: string;
  gradientFrom: string;
  gradientTo: string;
  backgroundImageUrl: string | null;
  svgaUrl: string | null;
  accentColor: string;
  chatBubbleColor: string;
  storeItemId: string | null;
};

function serializeThemePayload(theme: Omit<ThemeForRoom, 'storeItemId'>) {
  return {
    id: theme.id,
    name: theme.name,
    gradientFrom: theme.gradientFrom,
    gradientTo: theme.gradientTo,
    backgroundImageUrl: theme.backgroundImageUrl,
    svgaUrl: theme.svgaUrl,
    accentColor: theme.accentColor,
    chatBubbleColor: theme.chatBubbleColor,
  };
}

export async function ensureRoomThemeValid(
  roomId: string,
  hostId: string,
  theme: ThemeForRoom | null,
): Promise<{ activeTheme: ReturnType<typeof serializeThemePayload> | null; didReset: boolean }> {
  if (!theme) return { activeTheme: null, didReset: false };
  if (!theme.storeItemId) return { activeTheme: serializeThemePayload(theme), didReset: false };

  const now = new Date();
  const entitlement = await prisma.userStoreItem.findFirst({
    where: {
      userId: hostId,
      itemId: theme.storeItemId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  });

  if (entitlement) {
    return { activeTheme: serializeThemePayload(theme), didReset: false };
  }

  await prisma.room.update({ where: { id: roomId }, data: { themeId: null } });
  try {
    getIO().to(roomId).emit('room:theme_changed', { themeId: null, theme: null });
  } catch { /* socket layer may be unavailable in tests */ }
  return { activeTheme: null, didReset: true };
}

// ── Room CRUD ─────────────────────────────────────────────────────────────────

export async function createRoom(hostId: string, input: CreateRoomInput) {
  const micConfig = (input.micConfig ?? 5) as number;
  if (!VALID_MIC_CONFIGS.includes(micConfig as (typeof VALID_MIC_CONFIGS)[number])) {
    throw new AppError('micConfig must be 5, 10, 15, 20, 25, or 30', 400);
  }

  // Block host-banned users from creating new rooms.
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: { isHostBanned: true },
  });
  if (host?.isHostBanned) {
    throw new AppError('You are not allowed to host rooms.', 403);
  }

  // Check host doesn't already have an active room
  const existing = await prisma.room.findFirst({
    where: { hostId, status: { in: ['idle', 'live'] } },
  });
  if (existing) throw new AppError('You already have an active room', 409);

  const latestEnded = await prisma.room.findFirst({
    where: { hostId, status: 'ended' },
    orderBy: [{ endedAt: 'desc' }, { updatedAt: 'desc' }],
  });

  if (latestEnded) {
    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;

    const reopened = await prisma.$transaction(async (tx) => {
      await adjustRoomMicSeats(tx, latestEnded.id, latestEnded.micConfig, micConfig);

      const updated = await tx.room.update({
        where: { id: latestEnded.id },
        data: {
          status: 'idle',
          endedAt: null,
          startedAt: null,
          viewerCount: 0,
          title: input.title,
          description: input.description ?? '',
          coverImage: input.coverImage ?? '',
          category: input.category ?? 'general',
          type: input.type ?? 'public',
          roomMode: input.roomMode ?? 'chat',
          micConfig,
          applyForMic: false,
          password: passwordHash,
          isLocked: !!input.password,
        },
        include: { seats: { orderBy: { position: 'asc' } }, host: true },
      });

      await tx.roomSeat.updateMany({
        where: { roomId: latestEnded.id, userId: hostId },
        data: { userId: null, isMuted: false },
      });
      await tx.roomSeat.update({
        where: { roomId_position: { roomId: latestEnded.id, position: 1 } },
        data: { userId: hostId },
      });

      return updated;
    });

    try {
      await redis.del(`room:${latestEnded.id}:applicants`);
      await redis.del(`room:${latestEnded.id}:viewers`);
      await redis.del(`agora:revoked:${latestEnded.id}`);
    } catch { /* non-fatal */ }

    return reopened;
  }

  const roomCode = await generateUniqueRoomCode();
  // Pre-generate the room ID so agoraChannel can be set in a single atomic write.
  const roomId = crypto.randomUUID();
  const updated = await prisma.room.create({
    data: {
      id: roomId,
      hostId,
      roomCode,
      title: input.title,
      description: input.description ?? '',
      coverImage: input.coverImage ?? '',
      category: input.category ?? 'general',
      type: input.type ?? 'public',
      roomMode: input.roomMode ?? 'chat',
      micConfig,
      applyForMic: false,
      password: input.password ? await bcrypt.hash(input.password, 10) : null,
      isLocked: !!input.password,
      agoraChannel: roomId,
      seats: { create: buildSeats(micConfig) },
    },
    include: { seats: { orderBy: { position: 'asc' } }, host: true },
  });
  const room = updated;

  // Host takes seat 1 automatically
  await prisma.roomSeat.update({
    where: { roomId_position: { roomId: room.id, position: 1 } },
    data: { userId: hostId },
  });

  return updated;
}

export async function getRoomById(roomId: string, actorUserId?: string) {
  if (actorUserId) {
    const roomMeta = await prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (roomMeta?.hostId === actorUserId) {
      await dedupeUserSeatOccupancy(roomId, actorUserId, 1);
      await ensureHostSeatedAtPositionOne(roomId, actorUserId);
    }
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      host: { select: userSummarySelect() },
      seats: {
        orderBy: { position: 'asc' },
        include: {
          user: { select: userSummarySelect() },
        },
      },
      theme: {
        select: {
          id: true, name: true, gradientFrom: true, gradientTo: true,
          backgroundImageUrl: true, svgaUrl: true, accentColor: true, chatBubbleColor: true,
          storeItemId: true,
        },
      },
    },
  });
  if (!room) throw new AppError('Room not found', 404);
  const { theme, ...rest } = room;
  const seatedUserIds = [
    room.hostId,
    ...room.seats.map((s) => s.userId).filter((id): id is string => Boolean(id)),
  ];
  // Theme validation, music URL and the RTC uid map are independent of each
  // other — run them concurrently instead of awaiting one round-trip at a time.
  const [themeResult, bgMusicUrl, rtcUidMap] = await Promise.all([
    ensureRoomThemeValid(room.id, room.hostId, theme as ThemeForRoom | null),
    resolveCurrentMusicUrl(roomId),
    getRtcUidMap(room.agoraChannel, seatedUserIds),
  ]);
  const hostRtcUid = rtcUidMap[room.hostId] ?? (await getMappedUid(room.hostId, room.agoraChannel));
  return {
    ...rest,
    bgMusicUrl,
    hostRtcUid,
    host: serializeUserSummary(room.host),
    seats: room.seats.map((s) => ({
      ...s,
      user: s.user
        ? {
            ...serializeUserSummary(s.user),
            rtcUid: s.userId ? (rtcUidMap[s.userId] ?? null) : null,
          }
        : null,
    })),
    activeTheme: themeResult.activeTheme,
  };
}

export async function getMyActiveRoom(hostId: string) {
  return prisma.room.findFirst({
    where: { hostId, status: { in: ['idle', 'live'] } },
    select: { id: true, title: true, status: true, roomCode: true },
  });
}

export interface ListRoomsOptions {
  page?: number;
  limit?: number;
  category?: string;
  following?: boolean;
  nearby?: boolean;
  newest?: boolean;
  roomMode?: 'chat' | 'live';
  userId?: string;
}

export async function listLiveRooms(opts: ListRoomsOptions = {}) {
  const { page = 1, limit = 20, category, following, nearby, newest, roomMode, userId } = opts;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    status: 'live',
    type: 'public',
    ...(category ? { category } : {}),
    ...(roomMode ? { roomMode } : {}),
  };

  // Follow tab: only rooms hosted by users the caller follows
  if (following) {
    if (!userId) return { items: [], total: 0, page, limit, hasMore: false };
    const follows = await prisma.follow.findMany({
      where: { actorId: userId },
      select: { targetId: true },
    });
    const followedIds = follows.map((f) => f.targetId);
    where.hostId = { in: followedIds };
  }

  // Nearby tab: requires authentication
  if (nearby && !userId) {
    return { items: [], total: 0, page, limit, hasMore: false };
  }

  // Determine sort order: newest first for "New" tab, otherwise by viewers
  const orderBy = newest
    ? { startedAt: 'desc' as const }
    : { viewerCount: 'desc' as const };

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        host: {
          select: {
            ...userSummarySelect(),
            country: true,
            city: true,
            settings: { select: { mysteryManRank: true } },
          },
        },
        _count: { select: { seats: true } },
      },
    }),
    prisma.room.count({ where }),
  ]);

  const hiddenHostIds = new Set(
    rooms.filter((r) => r.host.settings?.mysteryManRank === true).map((r) => r.hostId),
  );

  const seenForRank = new Set<string>();
  const rankPairs: Array<{ userId: string; regionKey: string }> = [];
  for (const r of rooms) {
    if (hiddenHostIds.has(r.hostId)) continue;
    const rk = buildRegionKeyFromUserCountryCity(r.host.country ?? '', r.host.city ?? '');
    if (!rk || seenForRank.has(r.hostId)) continue;
    seenForRank.add(r.hostId);
    rankPairs.push({ userId: r.hostId, regionKey: rk });
  }

  // Rank, viewer-count, and seat-count hydration all depend only on the rooms
  // already fetched above — fire them concurrently so the request makes one
  // network round-trip here instead of two sequential ones.
  const roomIds = rooms.map((r) => r.id);
  const [rankMap, liveViewerCounts, seatCounts] = await Promise.all([
    batchRegionalEarnerRanksByUserId(rankPairs, 'daily'),
    hydrateViewerCountsFromRedis(roomIds),
    hydrateOccupiedSeatCounts(roomIds),
  ]);

  let socketCounts = new Map<string, number>();
  try {
    const io = getIO();
    socketCounts = new Map(
      roomIds.map((id) => [id, getConnectedUserIdsInRoom(io, id).length]),
    );
  } catch {
    // Socket.io not initialized (unit tests / scripts)
  }

  const items = rooms.map((r) => {
    const host = serializeUserSummary(r.host);
    let hostRegionalEarnerBadge: { label: string; rank: number; period: 'daily' } | null = null;
    if (!hiddenHostIds.has(r.hostId)) {
      const cityTrim = (r.host.city ?? '').trim();
      const countryLabel = displayCountryName(r.host.country ?? '');
      const rk = buildRegionKeyFromUserCountryCity(r.host.country ?? '', r.host.city ?? '');
      if (rk && cityTrim && countryLabel) {
        const rank = rankMap.get(r.hostId);
        if (rank != null) {
          hostRegionalEarnerBadge = { label: countryLabel, rank, period: 'daily' };
        }
      }
    }
    const viewerCount = Math.max(
      liveViewerCounts.get(r.id) ?? 0,
      seatCounts.get(r.id) ?? 0,
      socketCounts.get(r.id) ?? 0,
      r.viewerCount,
    );
    return { ...r, host, hostRegionalEarnerBadge, viewerCount };
  });

  return { items, total, page, limit, hasMore: skip + rooms.length < total };
}

export async function updateRoom(roomId: string, userId: string, input: UpdateRoomInput) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== userId) {
    await assertHostOrAdmin(room, userId);
    const adminAllowedFields = new Set<keyof UpdateRoomInput>(['micConfig', 'applyForMic']);
    const hasHostOnlyField = (Object.keys(input) as Array<keyof UpdateRoomInput>)
      .some((field) => !adminAllowedFields.has(field));
    if (hasHostOnlyField) throw new AppError('Only the room host can update these room settings', 403);
  }
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  if (input.micConfig !== undefined) {
    const newCount = input.micConfig;
    if (!VALID_MIC_CONFIGS.includes(newCount as (typeof VALID_MIC_CONFIGS)[number])) {
      throw new AppError('micConfig must be 5, 10, 15, 20, 25, or 30', 400);
    }
    if (newCount !== room.micConfig) {
      await adjustRoomMicSeats(prisma, roomId, room.micConfig, newCount);
    }
  }

  const data: Record<string, unknown> = { ...input };
  if (input.password === '' || input.password === null) {
    data.password = null;
    data.isLocked = false;
  } else if (input.password !== undefined) {
    data.password = await bcrypt.hash(input.password, 10);
    data.isLocked = true;
  }

  return prisma.room.update({
    where: { id: roomId },
    data,
    include: {
      seats: {
        orderBy: { position: 'asc' },
        include: { user: { select: userSummarySelect() } },
      },
    },
  });
}

export async function toggleChatLock(roomId: string, userId: string, locked: boolean) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  assertHost(room, userId);
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  const content = locked ? 'Public message is disabled' : 'Public message is enabled';

  const [updatedRoom, rawMessage] = await prisma.$transaction([
    prisma.room.update({
      where: { id: roomId },
      data: { chatLocked: locked },
      include: {
        seats: { orderBy: { position: 'asc' }, include: { user: { select: userSummarySelect() } } },
      },
    }),
    prisma.roomMessage.create({
      data: { roomId, senderId: userId, content, type: 'system' },
      select: roomMessageSelect(),
    }),
  ]);

  return { room: updatedRoom, systemMessage: serializeRoomMessage(rawMessage) };
}

export async function togglePublicMsg(roomId: string, requesterId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== requesterId) {
    const isAdmin = await prisma.roomAdmin.findFirst({ where: { roomId, userId: requesterId } });
    if (!isAdmin) throw new AppError('Only the host or admin can change this setting', 403);
  }
  return prisma.room.update({
    where: { id: roomId },
    data: { publicMsgEnabled: !room.publicMsgEnabled },
  });
}

export async function clearRoomChat(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  assertHost(room, userId);
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  const clearedAt = new Date();
  await prisma.room.update({ where: { id: roomId }, data: { chatClearedAt: clearedAt } });
  return { chatClearedAt: clearedAt.toISOString() };
}

// ── Room Admins ───────────────────────────────────────────────────────────────

export async function listRoomAdmins(roomId: string) {
  const admins = await prisma.roomAdmin.findMany({
    where: { roomId },
    include: {
      user: { select: userSummarySelect() },
    },
    orderBy: { createdAt: 'asc' },
  });
  return admins.map((a) => ({ ...a, user: serializeUserSummary(a.user) }));
}

export async function addRoomAdmin(roomId: string, hostUserId: string, targetUserId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  assertHost(room, hostUserId);
  if (targetUserId === hostUserId) throw new AppError('Host is already admin', 400);
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError('User not found', 404);
  try {
    const admin = await prisma.roomAdmin.create({
      data: { roomId, userId: targetUserId },
      include: { user: { select: userSummarySelect() } },
    });
    return { ...admin, user: serializeUserSummary(admin.user) };
  } catch {
    throw new AppError('User is already an admin', 409);
  }
}

export async function removeRoomAdmin(roomId: string, hostUserId: string, targetUserId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  assertHost(room, hostUserId);
  await prisma.roomAdmin.deleteMany({ where: { roomId, userId: targetUserId } });
}

// ── Room stats (Edit Info overlay) ─────────────────────────────────────────────

export async function getRoomStats(roomId: string, viewerUserId: string | undefined, dateStr: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);

  // Parse YYYY-MM-DD as a UTC day window.
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new AppError('Invalid date', 400);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  // Live duration: overlap of [startedAt, endedAt ?? now] with [start, end] in minutes.
  let liveDurationMins = 0;
  if (room.startedAt) {
    const lo = Math.max(room.startedAt.getTime(), start.getTime());
    const hi = Math.min((room.endedAt ?? new Date()).getTime(), end.getTime());
    if (hi > lo) liveDurationMins = Math.round((hi - lo) / 60000);
  }

  // Mic duration for the viewer in this room on this day — sum the overlap of each
  // HostMicSession (userId, roomId) with [start, end). Still-open sessions use `now` as end.
  let micDurationMins = 0;
  if (viewerUserId) {
    const sessions = await prisma.hostMicSession.findMany({
      where: {
        userId: viewerUserId,
        roomId,
        startedAt: { lt: end },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
      select: { startedAt: true, endedAt: true },
    });
    const now = new Date();
    for (const s of sessions) {
      const lo = Math.max(s.startedAt.getTime(), start.getTime());
      const hi = Math.min((s.endedAt ?? now).getTime(), end.getTime());
      if (hi > lo) micDurationMins += Math.floor((hi - lo) / 60000);
    }
  }

  const [roomGifts, myselfGifts, myselfMsgs] = await Promise.all([
    prisma.giftTransaction.aggregate({
      where: { roomId, createdAt: { gte: start, lt: end } },
      _sum: { coinCost: true },
    }),
    viewerUserId
      ? prisma.giftTransaction.aggregate({
          where: { roomId, senderId: viewerUserId, createdAt: { gte: start, lt: end } },
          _sum: { coinCost: true },
        })
      : Promise.resolve({ _sum: { coinCost: 0 } } as { _sum: { coinCost: number | null } }),
    viewerUserId
      ? prisma.roomMessage.count({
          where: { roomId, senderId: viewerUserId, createdAt: { gte: start, lt: end } },
        })
      : Promise.resolve(0),
  ]);

  return {
    date: dateStr,
    liveDurationMins,
    liveRoomMyselfCoins: myselfGifts._sum.coinCost ?? 0,
    pkTimes: 0, // PK feature not tracked yet
    micDurationMins,
    chatRoomGiftCoins: roomGifts._sum.coinCost ?? 0,
    chatRoomMyselfMessages: myselfMsgs,
  };
}

// ── Room lifecycle ─────────────────────────────────────────────────────────────

/**
 * A user must occupy at most one mic seat per room. Clears duplicate rows and returns
 * positions that were released (for socket broadcasts).
 */
export async function dedupeUserSeatOccupancy(
  roomId: string,
  userId: string,
  keepPosition?: number,
): Promise<Array<{ position: number; isLocked: boolean }>> {
  const occupied = await prisma.roomSeat.findMany({
    where: { roomId, userId },
    orderBy: { position: 'asc' },
    select: { position: true, isLocked: true },
  });
  if (occupied.length <= 1) return [];

  const keep =
    keepPosition != null && occupied.some((s) => s.position === keepPosition)
      ? keepPosition
      : occupied[0]!.position;

  const released: Array<{ position: number; isLocked: boolean }> = [];
  for (const seat of occupied) {
    if (seat.position === keep) continue;
    await prisma.roomSeat.update({
      where: { roomId_position: { roomId, position: seat.position } },
      data: { userId: null, isMuted: false },
    });
    released.push({ position: seat.position, isLocked: seat.isLocked });
  }
  return released;
}

/**
 * If the room host has no mic seat, assign the lowest empty unlocked seat.
 * Called on WebSocket `room:join` and on `GET /rooms/:id` when the requester is the host.
 * Does nothing if the host already holds any seat, or if no empty unlocked seat exists.
 */
export async function ensureHostSeatedAtPositionOne(
  roomId: string,
  actorUserId: string,
): Promise<{
  position: number;
  userId: string | null;
  user: ReturnType<typeof serializeUserSummary> | null;
  isLocked: boolean;
  isMuted: boolean;
} | null> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { hostId: true, status: true },
  });
  if (!room || room.status === 'ended') return null;
  if (room.hostId !== actorUserId) return null;

  await dedupeUserSeatOccupancy(roomId, actorUserId, 1);

  const onAnySeat = await prisma.roomSeat.findFirst({
    where: { roomId, userId: actorUserId },
    select: { position: true },
  });
  if (onAnySeat) return null;

  const availableSeat = await prisma.roomSeat.findFirst({
    where: { roomId, userId: null, isLocked: false },
    orderBy: { position: 'asc' },
    select: { position: true },
  });
  if (!availableSeat) return null;

  const updated = await prisma.roomSeat.update({
    where: { roomId_position: { roomId, position: availableSeat.position } },
    data: { userId: actorUserId },
    include: { user: { select: userSummarySelect() } },
  });

  return {
    position: updated.position,
    userId: updated.userId,
    user: updated.user ? serializeUserSummary(updated.user) : null,
    isLocked: updated.isLocked,
    isMuted: updated.isMuted,
  };
}

export async function startRoom(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  assertHost(room, userId);
  if (room.status === 'live') throw new AppError('Room is already live', 400);
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'live', startedAt: new Date() },
  });

  await prisma.user.update({ where: { id: userId }, data: { lastLiveAt: new Date() } });

  await ensureHostSeatedAtPositionOne(roomId, userId);

  // Track the host's own broadcast as a mic session so the live-duration level task
  // accrues. Seat handlers only call startMicSession on takeSeat; a host broadcasting
  // from their auto-assigned seat would otherwise never be recorded → live task stuck
  // at 0. startMicSession closes any dangling session first, so this won't double-count
  // if the host later re-takes a seat. endRoom closes the session on go-offline.
  try {
    const hostSeat = await prisma.roomSeat.findFirst({
      where: { roomId, userId },
      select: { position: true },
    });
    const { startMicSession } = await import('../hosts/hosts.service');
    await startMicSession(userId, roomId, hostSeat?.position ?? 1);
  } catch { /* non-fatal: never block go-live on task tracking */ }

  const out = await prisma.room.findUnique({
    where: { id: roomId },
    include: { seats: { orderBy: { position: 'asc' } } },
  });
  if (!out) throw new AppError('Room not found', 404);
  return out;
}

export async function endRoom(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  assertHost(room, userId);
  if (room.status === 'ended') throw new AppError('Room has already ended', 400);

  // Close any open mic sessions for this room before clearing seats
  try {
    const openSessions = await prisma.hostMicSession.findMany({
      where: { roomId, endedAt: null },
      select: { userId: true },
    });
    const { endMicSession } = await import('../hosts/hosts.service');
    await Promise.all(openSessions.map((s) => endMicSession(s.userId, roomId).catch(() => null)));
  } catch { /* non-fatal */ }

  // Clear all non-host seats
  await prisma.roomSeat.updateMany({
    where: { roomId, position: { gt: 1 } },
    data: { userId: null, isMuted: false },
  });

  await Promise.all([
    redis.del(`room:${roomId}:applicants`),
    redis.del(`room:${roomId}:viewers`),
    redis.del(`room:${roomId}:music:index`),
    redis.del(`room:${roomId}:music:loop`),
  ]);

  return prisma.room.update({
    where: { id: roomId },
    data: { status: 'ended', endedAt: new Date(), viewerCount: 0 },
  });
}

// ── Seat management ────────────────────────────────────────────────────────────

export async function getSeats(roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);

  const seats = await prisma.roomSeat.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    include: {
      user: { select: userSummarySelect() },
    },
  });
  return seats.map((s) => ({ ...s, user: s.user ? serializeUserSummary(s.user) : null }));
}

export async function takeSeat(roomId: string, position: number, userId: string) {
  const { seat, releasedPositions } = await prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError('Room not found', 404);
    assertLive(room);

    if (position < 1 || position > room.micConfig) {
      throw new AppError(`Position must be between 1 and ${room.micConfig}`, 400);
    }

    // Row-lock the target seat to serialize concurrent takers
    const locked = await tx.$queryRaw<Array<{ id: string; user_id: string | null; is_locked: boolean }>>`
      SELECT id, "userId" AS user_id, "isLocked" AS is_locked
      FROM room_seats
      WHERE "roomId" = ${roomId} AND position = ${position}
      FOR UPDATE
    `;
    const locktarget = locked[0];

    // Re-verify room is still live after acquiring the seat lock — guards against concurrent endRoom
    const freshRoom = await tx.room.findUnique({ where: { id: roomId }, select: { status: true } });
    if (!freshRoom || freshRoom.status !== 'live') throw new AppError('Room is not live', 400);
    if (!locktarget) throw new AppError('Seat not found', 404);
    if (locktarget.is_locked) throw new AppError('This seat is locked', 400);
    if (locktarget.user_id === userId) {
      // Already seated here — return the current seat without changes
      const current = await tx.roomSeat.findUnique({
        where: { roomId_position: { roomId, position } },
        include: { user: { select: userSummarySelect() } },
      });
      return { seat: current!, releasedPositions: [] as number[] };
    }
    if (locktarget.user_id) throw new AppError('This seat is already taken', 409);

    // Release every other seat this user holds (including seat 1 when the host moves to another mic)
    const prevSeats = await tx.roomSeat.findMany({
      where: { roomId, userId, position: { not: position } },
      select: { position: true, isLocked: true },
      orderBy: { position: 'asc' },
    });
    const releasedPositions: number[] = [];
    for (const p of prevSeats) {
      await tx.roomSeat.update({
        where: { roomId_position: { roomId, position: p.position } },
        data: { userId: null, isMuted: false },
      });
      releasedPositions.push(p.position);
    }

    const updated = await tx.roomSeat.update({
      where: { roomId_position: { roomId, position } },
      data: { userId },
      include: { user: { select: userSummarySelect() } },
    });
    return { seat: updated, releasedPositions };
  });

  try {
    const { startMicSession } = await import('../hosts/hosts.service');
    await startMicSession(userId, roomId, position);
  } catch (e) { /* non-fatal mic tracking */ }

  return {
    seat: { ...seat, user: seat.user ? serializeUserSummary(seat.user) : null },
    releasedPositions,
  };
}

export async function leaveSeat(roomId: string, position: number, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError('Room not found', 404);

    const locked = await tx.$queryRaw<Array<{ user_id: string | null }>>`
      SELECT "userId" AS user_id FROM room_seats
      WHERE "roomId" = ${roomId} AND position = ${position}
      FOR UPDATE
    `;
    const seat = locked[0];
    if (!seat) throw new AppError('Seat not found', 404);
    if (seat.user_id !== userId) throw new AppError('You are not in this seat', 400);

    return tx.roomSeat.update({
      where: { roomId_position: { roomId, position } },
      data: { userId: null, isMuted: false },
    });
  });

  try {
    const { endMicSession } = await import('../hosts/hosts.service');
    await endMicSession(userId, roomId);
  } catch (e) { /* non-fatal */ }

  return result;
}

export async function lockSeat(roomId: string, position: number, userId: string, lock: boolean) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError('Room not found', 404);
    if (room.hostId !== userId) {
      const admin = await tx.roomAdmin.findUnique({
        where: { roomId_userId: { roomId: room.id, userId } },
      });
      if (!admin) throw new AppError('Only the room host or admin can do this', 403);
    }
    if (position === 1) throw new AppError('Cannot lock the host seat', 400);

    await tx.$queryRaw`
      SELECT id FROM room_seats
      WHERE "roomId" = ${roomId} AND position = ${position}
      FOR UPDATE
    `;

    return tx.roomSeat.update({
      where: { roomId_position: { roomId, position } },
      data: { isLocked: lock, ...(lock ? { userId: null } : {}) },
    });
  });
}

export async function muteSeat(roomId: string, position: number, userId: string, mute: boolean) {
  const updated = await prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError('Room not found', 404);
    if (room.hostId !== userId) {
      const actorPower = await import('../moderation/super-admin-power').then((m) => m.hasSuperAdminPower(userId));
      if (!actorPower) {
        const actor = await tx.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        if (actor?.role !== 'super_admin') {
          const admin = await tx.roomAdmin.findUnique({
            where: { roomId_userId: { roomId: room.id, userId } },
          });
          if (!admin) throw new AppError('Only the room host or admin can do this', 403);
        }
      }
    }
    if (position === 1) throw new AppError('Cannot mute the host seat', 400);
    assertLive(room);

    await tx.$queryRaw`
      SELECT id FROM room_seats
      WHERE "roomId" = ${roomId} AND position = ${position}
      FOR UPDATE
    `;

    const seatBefore = await tx.roomSeat.findUnique({
      where: { roomId_position: { roomId, position } },
      select: { userId: true },
    });
    if (seatBefore?.userId) {
      const { assertCanModerateTarget } = await import('../moderation/super-admin-power');
      await assertCanModerateTarget(userId, seatBefore.userId);
    }

    return tx.roomSeat.update({
      where: { roomId_position: { roomId, position } },
      data: { isMuted: mute },
      include: { user: { select: userSummarySelect() } },
    });
  });

  return {
    ...updated,
    user: updated.user ? serializeUserSummary(updated.user) : null,
  };
}

export async function kickFromSeat(roomId: string, position: number, userId: string) {
  if (position === 1) throw new AppError('Cannot kick the host', 400);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);

  const seat = await prisma.roomSeat.findUnique({
    where: { roomId_position: { roomId, position } },
  });
  if (seat?.userId) {
    await assertCanKickUserInRoom(room, userId, seat.userId);
  }

  const { updated, kickedUserId } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM room_seats
      WHERE "roomId" = ${roomId} AND position = ${position}
      FOR UPDATE
    `;

    const updatedSeat = await tx.roomSeat.update({
      where: { roomId_position: { roomId, position } },
      data: { userId: null, isMuted: false },
    });
    return { updated: updatedSeat, kickedUserId: seat?.userId ?? null };
  });

  if (kickedUserId) {
    try {
      const { endMicSession } = await import('../hosts/hosts.service');
      await endMicSession(kickedUserId, roomId);
    } catch { /* non-fatal */ }
  }

  const ban = kickedUserId
    ? await createTemporaryRoomKickBan(roomId, userId, kickedUserId)
    : null;

  return {
    ...updated,
    kickedUserId,
    cooldownMinutes: ban?.cooldownMinutes ?? 0,
    expiresAt: ban?.expiresAt ?? null,
  };
}

export async function inviteToSeat(
  roomId: string,
  fromUserId: string,
  toUserId: string,
  position?: number,
) {
  if (fromUserId === toUserId) throw new AppError('You cannot invite yourself', 400);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      host: { select: { id: true, displayName: true } },
      seats: { orderBy: { position: 'asc' } },
    },
  });
  if (!room) throw new AppError('Room not found', 404);
  await assertHostOrAdmin(room, fromUserId);
  assertLive(room);
  if (toUserId === room.hostId) throw new AppError('Host already occupies seat 1', 400);

  const targetRaw = await prisma.user.findUnique({
    where: { id: toUserId },
    select: userSummarySelect(),
  });
  if (!targetRaw) throw new AppError('User not found', 404);
  const target = serializeUserSummary(targetRaw);

  // Pick seat: the requested one if valid + free, else first empty non-host non-locked seat.
  const availableSeats = room.seats.filter(
    (s) => s.position !== 1 && !s.isLocked && !s.userId,
  );
  let chosen = position
    ? room.seats.find((s) => s.position === position)
    : availableSeats[0];

  if (position) {
    if (!chosen) throw new AppError('Seat not found', 404);
    if (chosen.position === 1) throw new AppError('Cannot invite to the host seat', 400);
    if (chosen.isLocked) throw new AppError('That seat is locked', 400);
    if (chosen.userId) throw new AppError('That seat is already taken', 409);
  } else if (!chosen) {
    throw new AppError('No empty seats available', 400);
  }

  const alreadySeated = room.seats.find((s) => s.userId === toUserId);
  if (alreadySeated) throw new AppError('User is already on a seat', 409);

  const fromUserRaw = await prisma.user.findUnique({
    where: { id: fromUserId },
    select: userSummarySelect(),
  });
  const fromUser = fromUserRaw ? serializeUserSummary(fromUserRaw) : null;

  return { room, target, fromUser, position: chosen!.position };
}

const KICK_BAN_HOURS = 2;

/** Host/room-admin kick permission checks (super-admin-power + staff tags included). */
async function assertCanKickUserInRoom(
  room: { id: string; hostId: string; status: string },
  actorId: string,
  targetUserId: string,
): Promise<void> {
  if (targetUserId === actorId) throw new AppError('You cannot kick yourself', 400);

  const { assertRoomModerationActor, assertCanModerateTarget, hasSuperAdminPower } =
    await import('../moderation/super-admin-power');
  await assertRoomModerationActor(room, actorId);
  await assertCanModerateTarget(actorId, targetUserId);

  const actorPower = await hasSuperAdminPower(actorId);
  if (targetUserId === room.hostId && !actorPower) {
    throw new AppError('Cannot kick the host', 400);
  }
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  if (room.hostId !== actorId) {
    const targetIsRoomAdmin = await prisma.roomAdmin.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: targetUserId } },
    });
    if (targetIsRoomAdmin) {
      throw new AppError('Only the room owner can kick room admins', 403);
    }
  }
}

export async function createTemporaryRoomKickBan(
  roomId: string,
  actorId: string,
  targetUserId: string,
  reason = 'Kicked from room',
) {
  const { hasSuperAdminPower } = await import('../moderation/super-admin-power');
  if (await hasSuperAdminPower(targetUserId)) {
    return null;
  }

  const expiresAt = new Date(Date.now() + KICK_BAN_HOURS * 60 * 60 * 1000);
  const banReason = reason.trim() || 'Kicked from room';

  await prisma.ban.updateMany({
    where: { userId: targetUserId, roomId, type: 'room', isActive: true },
    data: { isActive: false },
  });
  await prisma.ban.create({
    data: {
      userId: targetUserId,
      adminId: actorId,
      bannedBy: actorId,
      type: 'room',
      roomId,
      reason: banReason,
      banType: 'temporary',
      expiresAt,
      isActive: true,
    },
  });

  return { expiresAt, cooldownMinutes: KICK_BAN_HOURS * 60 };
}

export async function kickUserFromRoom(
  roomId: string,
  targetUserId: string,
  actorId: string,
  reason?: string,
) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);

  await assertCanKickUserInRoom(room, actorId, targetUserId);

  const occupiedSeats = await prisma.roomSeat.findMany({
    where: { roomId, userId: targetUserId },
    select: { position: true, isLocked: true },
    orderBy: { position: 'asc' },
  });

  await prisma.roomSeat.updateMany({
    where: { roomId, userId: targetUserId },
    data: { userId: null, isMuted: false },
  });

  if (occupiedSeats.length > 0) {
    try {
      const { endMicSession } = await import('../hosts/hosts.service');
      await endMicSession(targetUserId, roomId);
    } catch { /* non-fatal */ }
  }

  const ban = await createTemporaryRoomKickBan(roomId, actorId, targetUserId, reason);

  return {
    kickedUserId: targetUserId,
    releasedSeats: occupiedSeats,
    ...ban,
  };
}

// ── Room contribution ranking ─────────────────────────────────────────────────

export type ContributionPeriod = 'daily' | 'weekly' | 'monthly' | 'all';

function periodStart(period: ContributionPeriod): Date | null {
  const d = new Date();
  switch (period) {
    case 'daily':   d.setHours(0, 0, 0, 0); return d;
    case 'weekly': {
      d.setHours(0, 0, 0, 0);
      const dow = (d.getDay() + 6) % 7; // days since Monday
      d.setDate(d.getDate() - dow);
      return d;
    }
    case 'monthly': d.setDate(1); d.setHours(0, 0, 0, 0); return d;
    default: return null;
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export async function applyTheme(roomId: string, userId: string, themeId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, hostId: true } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== userId) throw new AppError('Only the room host can do this', 403);

  const theme = await prisma.theme.findUnique({ where: { id: themeId } });
  if (!theme) throw new AppError('Theme not found', 404);

  if (theme.storeItemId) {
    const now = new Date();
    const owned = await prisma.userStoreItem.findFirst({
      where: { userId, itemId: theme.storeItemId },
    });
    if (!owned) throw new AppError('You do not own this theme', 403);
    if (owned.expiresAt && owned.expiresAt <= now) throw new AppError('This theme has expired', 403);
  }

  await prisma.room.update({ where: { id: roomId }, data: { themeId } });
  return theme;
}

export async function resetTheme(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, hostId: true } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== userId) throw new AppError('Only the room host can do this', 403);
  await prisma.room.update({ where: { id: roomId }, data: { themeId: null } });
}

export async function getRoomContributions(roomId: string, period: ContributionPeriod = 'all') {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);

  const since = periodStart(period);
  const where = since ? { roomId, createdAt: { gte: since } } : { roomId };

  const contributions = await prisma.giftTransaction.groupBy({
    by: ['senderId'],
    where,
    _sum: { coinCost: true },
    orderBy: { _sum: { coinCost: 'desc' } },
    take: 50,
  });

  if (contributions.length === 0) return [];

  const userIds = contributions.map((c) => c.senderId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: userSummarySelect(),
  });
  const userMap = new Map(users.map((u) => [u.id, serializeUserSummary(u)]));

  return contributions.map((c, i) => ({
    rank: i + 1,
    score: c._sum.coinCost ?? 0,
    user:
      userMap.get(c.senderId) ?? {
        id: c.senderId,
        username: null,
        displayName: 'Unknown',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        ...emptyEquippedCosmetics(),
      },
  }));
}

// ── Music queue helpers ────────────────────────────────────────────────────────

async function assertHostOrAdminForMusic(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== userId) {
    const isAdmin = await prisma.roomAdmin.findFirst({ where: { roomId, userId } });
    if (!isAdmin) throw new AppError('Only the host or admin can manage music', 403);
  }
  return room;
}

async function getMusicIndexFromRedis(roomId: string, total: number): Promise<number> {
  if (total === 0) return 0;
  const raw = await redis.get(`room:${roomId}:music:index`);
  const idx = raw !== null ? parseInt(raw, 10) : 0;
  return Math.max(0, Math.min(idx, total - 1));
}

async function getLoopFromRedis(roomId: string): Promise<boolean> {
  const raw = await redis.get(`room:${roomId}:music:loop`);
  return raw === '1';
}

export async function getMusicQueue(roomId: string, requesterId: string) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  const tracks = await prisma.roomMusicTrack.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, url: true, position: true },
  });
  const currentIndex = await getMusicIndexFromRedis(roomId, tracks.length);
  const loopQueue = await getLoopFromRedis(roomId);
  return { tracks, currentIndex, loopQueue };
}

export async function addMusicTrack(roomId: string, requesterId: string, url: string, name: string) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  const last = await prisma.roomMusicTrack.findFirst({
    where: { roomId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + 1;
  const track = await prisma.roomMusicTrack.create({
    data: { roomId, url, name, position },
    select: { id: true, name: true, url: true, position: true },
  });
  if (position === 1) {
    await redis.set(`room:${roomId}:music:index`, '0');
  }
  return track;
}

/** Add a track from the user's personal music library to the room queue. */
export async function addMusicFromLibrary(
  roomId: string,
  requesterId: string,
  libraryTrackId: string,
  playNow = false,
) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  const libraryTrack = await prisma.userMusicTrack.findFirst({
    where: { id: libraryTrackId, userId: requesterId },
  });
  if (!libraryTrack) throw new AppError('Library track not found', 404);
  const track = await addMusicTrack(roomId, requesterId, libraryTrack.url, libraryTrack.name);
  const total = await prisma.roomMusicTrack.count({ where: { roomId } });
  const appendedIndex = track.position - 1;
  const wasFirstInQueue = track.position === 1;

  if (playNow) {
    await redis.set(`room:${roomId}:music:index`, String(appendedIndex));
    return { ...track, index: appendedIndex, total, playNow: true };
  }

  if (wasFirstInQueue) {
    await redis.set(`room:${roomId}:music:index`, '0');
    return { ...track, index: 0, total, playNow: false };
  }

  const currentIndex = await getMusicIndexFromRedis(roomId, total);
  return { ...track, index: currentIndex, total, playNow: false, appendedIndex };
}

export async function removeMusicTrack(roomId: string, trackId: string, requesterId: string) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  const track = await prisma.roomMusicTrack.findFirst({ where: { id: trackId, roomId } });
  if (!track) throw new AppError('Track not found', 404);

  await prisma.roomMusicTrack.delete({ where: { id: trackId } });

  const remaining = await prisma.roomMusicTrack.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  await Promise.all(
    remaining.map((t, i) =>
      prisma.roomMusicTrack.update({ where: { id: t.id }, data: { position: i + 1 } }),
    ),
  );

  if (remaining.length === 0) {
    await redis.del(`room:${roomId}:music:index`);
    await redis.del(`room:${roomId}:music:loop`);
    return null;
  }

  const currentIdx = await getMusicIndexFromRedis(roomId, remaining.length + 1);
  const newIdx = Math.min(currentIdx, remaining.length - 1);
  await redis.set(`room:${roomId}:music:index`, String(newIdx));

  return remaining[newIdx]
    ? prisma.roomMusicTrack.findUnique({
        where: { id: remaining[newIdx].id },
        select: { id: true, name: true, url: true, position: true },
      })
    : null;
}

export async function reorderMusicQueue(
  roomId: string,
  requesterId: string,
  positions: Array<{ id: string; position: number }>,
) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  await prisma.$transaction(
    positions.map(({ id, position }) =>
      prisma.roomMusicTrack.update({ where: { id, roomId }, data: { position } }),
    ),
  );
  return prisma.roomMusicTrack.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, url: true, position: true },
  });
}

export async function skipMusicTrack(
  roomId: string,
  requesterId: string,
  direction: 'next' | 'prev',
) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  return advanceMusicTrack(roomId, direction);
}

export async function setMusicLoop(roomId: string, requesterId: string, loop: boolean) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  await redis.set(`room:${roomId}:music:loop`, loop ? '1' : '0');
}

/** Current playback URL derived from the music queue (compat for clients using bgMusicUrl). */
export async function resolveCurrentMusicUrl(roomId: string): Promise<string | null> {
  const tracks = await prisma.roomMusicTrack.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    select: { url: true },
  });
  if (tracks.length === 0) return null;
  const idx = await getMusicIndexFromRedis(roomId, tracks.length);
  return tracks[idx]?.url ?? null;
}

/** Clear the entire room music queue (legacy DELETE /rooms/:id/music). */
export async function clearRoomMusic(roomId: string, requesterId: string) {
  await assertHostOrAdminForMusic(roomId, requesterId);
  await prisma.roomMusicTrack.deleteMany({ where: { roomId } });
  await redis.del(`room:${roomId}:music:index`);
  await redis.del(`room:${roomId}:music:loop`);
}

export async function advanceMusicTrack(roomId: string, direction: 'next' | 'prev' = 'next') {
  const tracks = await prisma.roomMusicTrack.findMany({
    where: { roomId },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, url: true, position: true },
  });
  if (tracks.length === 0) return null;

  const loop = await getLoopFromRedis(roomId);
  const currentIdx = await getMusicIndexFromRedis(roomId, tracks.length);

  let nextIdx: number;
  if (direction === 'next') {
    nextIdx = currentIdx + 1;
    if (nextIdx >= tracks.length) {
      // Always loop the queue when the last track ends or is skipped past.
      nextIdx = 0;
    }
  } else {
    nextIdx = currentIdx - 1;
    if (nextIdx < 0) {
      nextIdx = loop ? tracks.length - 1 : 0;
    }
  }

  await redis.set(`room:${roomId}:music:index`, String(nextIdx));
  const track = tracks[nextIdx];
  return { ...track, index: nextIdx, total: tracks.length };
}

export async function toggleHdMic(roomId: string, requesterId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== requesterId) {
    const isAdmin = await prisma.roomAdmin.findFirst({ where: { roomId, userId: requesterId } });
    if (!isAdmin) throw new AppError('Only the host or admin can change HD mic setting', 403);
  }
  return prisma.room.update({ where: { id: roomId }, data: { hdMicEnabled: !room.hdMicEnabled } });
}

// ── Room members (permanent joins) ────────────────────────────────────────────
//
// RoomSeat rows = mic presence (avatars). Cleared by leaveSeat / socket disconnect
// (see rooms.socket handleLeaveRoom), not by deleting RoomMember.
//
// RoomMember rows = explicit “joined” list via POST/DELETE .../members only.
// WebSocket room:join does not create RoomMember. Membership persists across
// screen exits until DELETE .../members (mobile Join pill or kick handler).

export async function joinRoom(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, status: true, hostId: true },
  });
  if (!room) throw new AppError('Room not found', 404);
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  if (room.hostId !== userId) {
    const { getActiveRoomBanDetails } = await import('../moderation/moderation.service');
    const banDetails = await getActiveRoomBanDetails(userId, roomId);
    if (banDetails) {
      throw new AppError('You have been kicked from this room. Please try again later.', 403);
    }
  }

  await prisma.roomMember.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: {},
  });
}

export async function unjoinRoom(roomId: string, userId: string) {
  await prisma.roomMember.deleteMany({ where: { roomId, userId } });
}

export async function isMember(roomId: string, userId: string) {
  const existing = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { id: true },
  });
  return Boolean(existing);
}

/** Membership + moderator flag for the authenticated viewer (e.g. mobile lock bypass). */
export async function getMembershipForUser(roomId: string, userId: string) {
  const [member, admin] = await Promise.all([
    prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    }),
    prisma.roomAdmin.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true },
    }),
  ]);
  return { isMember: Boolean(member), isRoomAdmin: Boolean(admin) };
}

export async function listMembers(roomId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [members, total] = await Promise.all([
    prisma.roomMember.findMany({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
      skip,
      take: limit,
      include: {
        user: { select: userSummarySelect() },
      },
    }),
    prisma.roomMember.count({ where: { roomId } }),
  ]);
  return {
    members: members.map((m) => {
      const u = serializeUserSummary(m.user);
      return { ...u, joinedAt: m.joinedAt };
    }),
    total,
    page,
    limit,
  };
}

export type UserActiveRoomPresence = {
  id: string;
  roomMode: 'chat' | 'live';
  isLocked: boolean;
  hostId: string;
  title: string;
};

const activeRoomSelect = {
  id: true,
  title: true,
  roomMode: true,
  isLocked: true,
  hostId: true,
  status: true,
} as const;

function serializeActiveRoomPresence(
  room: {
    id: string;
    title: string;
    roomMode: string;
    isLocked: boolean;
    hostId: string;
  },
): UserActiveRoomPresence {
  return {
    id: room.id,
    title: room.title,
    roomMode: room.roomMode === 'live' ? 'live' : 'chat',
    isLocked: room.isLocked,
    hostId: room.hostId,
  };
}

/** Live room the user is currently in (WS session / mic / host), for DM join banner etc. */
export async function resolveUserActiveRoom(userId: string): Promise<UserActiveRoomPresence | null> {
  const roomIdFromRedis = await getUserActiveRoomId(userId);
  if (roomIdFromRedis) {
    const room = await prisma.room.findUnique({
      where: { id: roomIdFromRedis },
      select: activeRoomSelect,
    });
    if (room?.status === 'live') {
      return serializeActiveRoomPresence(room);
    }
  }

  const [asHost, onSeat] = await Promise.all([
    prisma.room.findFirst({
      where: { hostId: userId, status: 'live' },
      select: activeRoomSelect,
      orderBy: { startedAt: 'desc' },
    }),
    prisma.roomSeat.findFirst({
      where: { userId, room: { status: 'live' } },
      select: { room: { select: activeRoomSelect } },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  if (asHost) return serializeActiveRoomPresence(asHost);
  if (onSeat?.room) return serializeActiveRoomPresence(onSeat.room);
  return null;
}

/** Resolve room primary key from UUID id or 6-digit `roomCode` (public id). */
async function resolveRoomIdForSeatQueue(roomIdOrCode: string): Promise<{ id: string; hostId: string } | null> {
  const byId = await prisma.room.findUnique({
    where: { id: roomIdOrCode },
    select: { id: true, hostId: true },
  });
  if (byId) return byId;
  if (/^\d{6}$/.test(roomIdOrCode)) {
    return prisma.room.findFirst({
      where: { roomCode: roomIdOrCode },
      select: { id: true, hostId: true },
    });
  }
  return null;
}

/** Seat-application queue in Redis (apply-for-mic). Host + room admins only. */
export async function listSeatApplicantsForManagers(roomIdOrCode: string, userId: string): Promise<unknown[]> {
  const room = await resolveRoomIdForSeatQueue(roomIdOrCode);
  if (!room) throw new AppError('Room not found', 404);
  if (room.hostId !== userId) {
    const admin = await prisma.roomAdmin.findFirst({
      where: { roomId: room.id, userId },
      select: { id: true },
    });
    if (!admin) {
      throw new AppError('Only the host or room admins can view seat applicants', 403);
    }
  }
  const raw = await redis.hgetall(`room:${room.id}:applicants`);
  if (!raw || Object.keys(raw).length === 0) return [];
  const out: unknown[] = [];
  for (const v of Object.values(raw)) {
    try {
      out.push(JSON.parse(v));
    } catch {
      /* skip corrupt entries */
    }
  }
  return out;
}
