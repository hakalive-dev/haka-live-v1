import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { getIO } from '../../sockets';
import { WS_EVENTS } from '../../shared-types';
import { AppError } from '../../middleware/error.middleware';
import { serializeUserSummary, userSummarySelect } from '../users/user-summary';

/** Result of a committed lucky draw, as returned inside the sendGift result. */
export interface LuckyDrawOutcome {
  drawId: string;
  isWin: boolean;
  /** Multiplier drawn for this send (0 on lose). */
  winMultiplier: number;
  rewardCoins: number;
  coinCost: number;
  /** Sender coin balance after debit + (possible) reward credit. */
  senderCoinBalance: number;
}

const winnersStreamKey = (roomId: string) => `room:{${roomId}}:lucky_events`;

/**
 * Post-commit socket + winners-feed side effects for a lucky draw.
 * Sender always gets the result (win AND lose — drives the result popup);
 * the room only hears about wins. Fire-and-forget, never throws.
 */
export function broadcastLuckyDraw(params: {
  senderId: string;
  senderName: string;
  roomId: string | null;
  giftId: string;
  giftName: string;
  giftIcon: string;
  outcome: LuckyDrawOutcome;
}): void {
  const { senderId, senderName, roomId, giftId, giftName, giftIcon, outcome } = params;
  const payload = {
    drawId: outcome.drawId,
    isWin: outcome.isWin,
    winMultiplier: outcome.winMultiplier,
    rewardCoins: outcome.rewardCoins,
    coinCost: outcome.coinCost,
    giftId,
    giftName,
    giftIcon,
    senderId,
    senderName,
    roomId,
    createdAt: new Date().toISOString(),
  };

  try {
    const io = getIO();
    // NOTE: deliberately not `wallet:coins_received` — that event triggers the
    // purchase-success modal on mobile. Client refreshes balance on this event.
    io.to(`user:${senderId}`).emit(WS_EVENTS.LUCKY_REWARD, payload);
    if (roomId && outcome.isWin) {
      io.to(roomId).emit(WS_EVENTS.LUCKY_REWARD, payload);
    }
  } catch {
    /* Socket.io not initialized (e.g. some tests) */
  }

  if (roomId && outcome.isWin) {
    void (async () => {
      try {
        const streamKey = winnersStreamKey(roomId);
        await redis.xadd(streamKey, '*', 'payload', JSON.stringify(payload));
        await redis.xtrim(streamKey, 'MAXLEN', '~', 100);
        await redis.expire(streamKey, 60 * 60 * 6);
      } catch {
        /* non-critical winners feed */
      }
    })();
  }
}

async function assertRoomExists(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) throw new AppError('Room not found', 404);
}

/** All-time lucky win totals per sender in a room, highest first. */
export async function getRoomLuckyRankings(roomId: string, limit = 50) {
  await assertRoomExists(roomId);

  const grouped = await prisma.luckyGiftDraw.groupBy({
    by: ['userId'],
    where: { roomId, isWin: true },
    _sum: { rewardCoins: true },
  });

  const ranked = grouped
    .map((g) => ({ userId: g.userId, score: g._sum.rewardCoins ?? 0 }))
    .filter((g) => g.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.length === 0) {
    return { items: [] as Array<{ rank: number; score: number; user: ReturnType<typeof serializeUserSummary> }> };
  }

  const userIds = ranked.map((r) => r.userId);
  const [users, hiddenSettings] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: userSummarySelect(),
    }),
    prisma.userSettings.findMany({
      where: { userId: { in: userIds }, mysteryManRank: true },
      select: { userId: true },
    }),
  ]);

  const hiddenIds = new Set(hiddenSettings.map((s) => s.userId));
  const userMap = new Map(users.map((u) => [u.id, serializeUserSummary(u)]));

  const items = ranked.map((entry, idx) => {
    const u = userMap.get(entry.userId) ?? {
      id: entry.userId,
      username: null,
      displayName: '',
      avatar: '',
      hakaId: null,
      originalHakaId: null,
      activeSpecialId: null,
      activeSpecialIdLevel: null,
      equippedFrame: null,
      equippedRing: null,
      equippedChatBubble: null,
      equippedMicVoiceWave: null,
      equippedProfileCard: null,
      equippedDynamicProfile: null,
      richLevel: 1,
      charmLevel: 1,
    };
    const masked = hiddenIds.has(entry.userId)
      ? {
          ...u,
          username: null,
          displayName: 'Mystery',
          avatar: '',
          hakaId: null,
          activeSpecialId: null,
          activeSpecialIdLevel: null,
          equippedFrame: null,
          equippedRing: null,
          equippedChatBubble: null,
          equippedMicVoiceWave: null,
          equippedProfileCard: null,
          equippedDynamicProfile: null,
        }
      : u;
    return { rank: idx + 1, score: entry.score, user: masked };
  });

  return { items };
}

/** Paginated individual lucky wins in a room (newest first). */
export async function getRoomLuckyHistory(roomId: string, page = 1, limit = 30) {
  await assertRoomExists(roomId);

  const skip = (page - 1) * limit;
  const where = { roomId, isWin: true };

  const [rows, total] = await Promise.all([
    prisma.luckyGiftDraw.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        gift: { select: { id: true, name: true, icon: true, image: true } },
        giftTransaction: { select: { qty: true } },
      },
    }),
    prisma.luckyGiftDraw.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [users, hiddenSettings] = userIds.length
    ? await Promise.all([
        prisma.user.findMany({
          where: { id: { in: userIds } },
          select: userSummarySelect(),
        }),
        prisma.userSettings.findMany({
          where: { userId: { in: userIds }, mysteryManRank: true },
          select: { userId: true },
        }),
      ])
    : [[], []];

  const hiddenIds = new Set(hiddenSettings.map((s) => s.userId));
  const userMap = new Map(users.map((u) => [u.id, serializeUserSummary(u)]));

  const items = rows.map((r) => {
    const u = userMap.get(r.userId);
    const masked = hiddenIds.has(r.userId)
      ? {
          id: r.userId,
          username: null,
          displayName: 'Mystery',
          avatar: '',
          hakaId: null,
          originalHakaId: null,
          activeSpecialId: null,
          activeSpecialIdLevel: null,
          equippedFrame: null,
          equippedRing: null,
          equippedChatBubble: null,
          equippedMicVoiceWave: null,
          equippedProfileCard: null,
          equippedDynamicProfile: null,
          richLevel: 1,
          charmLevel: 1,
        }
      : u ?? {
          id: r.userId,
          username: null,
          displayName: '',
          avatar: '',
          hakaId: null,
          originalHakaId: null,
          activeSpecialId: null,
          activeSpecialIdLevel: null,
          equippedFrame: null,
          equippedRing: null,
          equippedChatBubble: null,
          equippedMicVoiceWave: null,
          equippedProfileCard: null,
          equippedDynamicProfile: null,
          richLevel: 1,
          charmLevel: 1,
        };

    return {
      id: r.id,
      rewardCoins: r.rewardCoins,
      coinCost: r.coinCost,
      receiverBeans: r.receiverBeans,
      qty: r.giftTransaction.qty,
      createdAt: r.createdAt.toISOString(),
      gift: r.gift,
      user: masked,
    };
  });

  return { items, total, page, limit };
}

/** Recent lucky winners in a room (newest first) from the capped Redis stream. */
export async function getRoomLuckyWinners(roomId: string, limit = 30) {
  const entries = await redis.xrevrange(winnersStreamKey(roomId), '+', '-', 'COUNT', limit);
  return entries.flatMap(([, fields]) => {
    const idx = fields.indexOf('payload');
    if (idx === -1) return [];
    try {
      return [JSON.parse(fields[idx + 1]) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

/** Sender's lucky-draw history (gift, cost, win/lose, reward, date), paginated. */
export async function getLuckyHistory(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.luckyGiftDraw.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { gift: { select: { id: true, name: true, icon: true, image: true } } },
    }),
    prisma.luckyGiftDraw.count({ where: { userId } }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      gift: r.gift,
      roomId: r.roomId,
      coinCost: r.coinCost,
      isWin: r.isWin,
      rewardCoins: r.rewardCoins,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  };
}

/** Paginated sent-gift history (covers normal + lucky gifts). */
export async function getSentGiftHistory(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.giftTransaction.findMany({
      where: { senderId: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        qty: true,
        coinCost: true,
        roomId: true,
        createdAt: true,
        gift: { select: { id: true, name: true, icon: true, image: true, category: true } },
        recipient: { select: { id: true, displayName: true, avatar: true } },
        luckyDraw: { select: { isWin: true, rewardCoins: true } },
      },
    }),
    prisma.giftTransaction.count({ where: { senderId: userId } }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      gift: r.gift,
      recipient: r.recipient,
      qty: r.qty,
      coinCost: r.coinCost,
      roomId: r.roomId,
      luckyDraw: r.luckyDraw,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  };
}
