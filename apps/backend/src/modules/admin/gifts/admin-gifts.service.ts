import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { GIFT_CATEGORIES, normalizeGiftCategory } from '../../../shared-types/gifts';
import { logAdminAction } from '../../../utils/audit';

export interface ListGiftTransactionsParams {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  senderId?: string;
  recipientId?: string;
  roomId?: string;
  minCoinCost?: number;
  isGame?: boolean; // filter to game-room gifts
  sort?: string;
  order?: 'asc' | 'desc';
}

export async function listGifts() {
  return prisma.gift.findMany({ orderBy: { order: 'asc' } });
}

export async function createGift(
  adminId: string,
  data: { name: string; icon?: string; coinCost: number; beanValue: number; category?: string; animationType?: string; soundKey?: string; order?: number; image?: string; svgaAsset?: string },
  ipAddress?: string,
) {
  const gift = await prisma.gift.create({
    data: {
      name: data.name,
      icon: data.icon ?? '',
      coinCost: data.coinCost,
      beanValue: data.beanValue,
      category: normalizeGiftCategory(data.category, GIFT_CATEGORIES.BAG),
      animationType: data.animationType || '',
      soundKey: data.soundKey || '',
      order: data.order || 0,
      image: data.image || null,
      svgaAsset: data.svgaAsset || null,
    },
  });

  await logAdminAction(adminId, 'gift.create', 'Gift', gift.id, { name: gift.name }, ipAddress);
  return gift;
}

export async function updateGift(
  adminId: string,
  giftId: string,
  data: Partial<{ name: string; icon: string; coinCost: number; beanValue: number; category: string; animationType: string; soundKey: string; order: number; isActive: boolean; image: string; svgaAsset: string }>,
  ipAddress?: string,
) {
  const gift = await prisma.gift.findUnique({ where: { id: giftId } });
  if (!gift) throw new AppError('Gift not found', 404);

  const updateData = { ...data };
  if (updateData.category !== undefined) {
    updateData.category = normalizeGiftCategory(updateData.category, GIFT_CATEGORIES.BAG);
  }

  const updated = await prisma.gift.update({ where: { id: giftId }, data: updateData });
  await logAdminAction(adminId, 'gift.update', 'Gift', giftId, data, ipAddress);
  return updated;
}

export async function listGiftTransactions(params: ListGiftTransactionsParams) {
  const { page, limit, search, senderId, recipientId, roomId, minCoinCost, isGame, sort = 'createdAt', order = 'desc' } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.GiftTransactionWhereInput = {};
  if (search) {
    where.OR = [
      { sender: { displayName: { contains: search, mode: 'insensitive' } } },
      { sender: { hakaId: { contains: search, mode: 'insensitive' } } },
      { sender: { activeSpecialId: { contains: search, mode: 'insensitive' } } },
      { recipient: { displayName: { contains: search, mode: 'insensitive' } } },
      { recipient: { hakaId: { contains: search, mode: 'insensitive' } } },
      { recipient: { activeSpecialId: { contains: search, mode: 'insensitive' } } },
      { gift: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  if (senderId) where.senderId = senderId;
  if (recipientId) where.recipientId = recipientId;
  if (roomId) where.roomId = roomId;
  if (minCoinCost != null) where.coinCost = { gte: minCoinCost };
  if (isGame) {
    // Filter to gifts sent in game rooms (roomId present and room.gameType != '')
    const gameRooms = await prisma.room.findMany({
      where: { gameType: { not: '' } },
      select: { id: true },
      take: 1000,
    });
    const gameRoomIds = gameRooms.map(r => r.id);
    where.roomId = { in: gameRoomIds };
  }

  const [transactions, total] = await Promise.all([
    prisma.giftTransaction.findMany({
      where, skip, take: limit,
      orderBy: { [sort]: order },
      include: {
        sender: { select: { id: true, displayName: true, hakaId: true } },
        recipient: { select: { id: true, displayName: true, hakaId: true } },
        gift: { select: { name: true, icon: true, image: true, coinCost: true } },
      },
    }),
    prisma.giftTransaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
