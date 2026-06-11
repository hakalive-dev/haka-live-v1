import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { getIO } from '../../sockets';
import { WS_EVENTS } from '../../shared-types';

/** Result of a committed lucky draw, as returned inside the sendGift result. */
export interface LuckyDrawOutcome {
  drawId: string;
  isWin: boolean;
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
