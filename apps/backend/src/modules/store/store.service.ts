import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware';
import { assertNoRiskBlock } from '../../utils/risk-control';
import { resolveUserId } from '../users/users.service';

const CATEGORY_LABELS: Record<string, string> = {
  entry: 'Entry',
  frame: 'Frame',
  chat_bubble: 'Chat Bubble',
  theme: 'Theme',
  special_id: 'Special ID',
  profile_card: 'Profile Card',
  mic_voice_wave: 'Mic Voice Wave',
  dynamic_profile: 'Dynamic Profile',
  ring: 'Ring',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

/** Wearable categories auto-equipped immediately after purchase (themes use applyTheme instead). */
const AUTO_EQUIP_ON_PURCHASE_CATEGORIES = new Set([
  'frame',
  'ring',
  'entry',
  'chat_bubble',
  'mic_voice_wave',
  'profile_card',
  'dynamic_profile',
]);

function shouldAutoEquipOnPurchase(category: string): boolean {
  return AUTO_EQUIP_ON_PURCHASE_CATEGORIES.has(category);
}

async function unequipCategoryItems(
  tx: Prisma.TransactionClient,
  userId: string,
  category: string,
) {
  await tx.userStoreItem.updateMany({
    where: { userId, item: { category }, isEquipped: true },
    data: { isEquipped: false },
  });
}

function formatItem(item: {
  id: string;
  name: string;
  description: string;
  image: string | null;
  previewImage: string | null;
  category: string;
  level: string;
  coinCost: number;
  durationDays: number;
  sortOrder: number;
  isForSale: boolean;
}) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image: item.image,
    preview_image: item.previewImage,
    category: item.category,
    category_label: CATEGORY_LABELS[item.category] ?? item.category,
    level: item.level,
    coin_cost: item.coinCost,
    duration_days: item.durationDays,
    duration_label: item.durationDays === 0 ? 'Permanent' : `${item.durationDays} days`,
    sort_order: item.sortOrder,
    is_for_sale: item.isForSale,
  };
}

function formatUserItem(ui: {
  id: string;
  isEquipped: boolean;
  expiresAt: Date | null;
  purchasedAt: Date;
  customHakaId: string | null;
  item: Parameters<typeof formatItem>[0];
}) {
  const now = new Date();
  return {
    id: ui.id,
    item: formatItem(ui.item),
    is_equipped: ui.isEquipped,
    custom_haka_id: ui.customHakaId,
    expires_at: ui.expiresAt?.toISOString() ?? null,
    is_expired: ui.expiresAt ? ui.expiresAt < now : false,
    purchased_at: ui.purchasedAt.toISOString(),
  };
}

export const storeService = {
  getCategories() {
    return ALL_CATEGORIES.map((key) => ({ key, label: CATEGORY_LABELS[key] }));
  },

  async getItems(category?: string) {
    const where = category ? { category, isActive: true } : { isActive: true };
    const items = await prisma.storeItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
    return items.map(formatItem);
  },

  async purchase(userId: string, itemId: string) {
    await assertNoRiskBlock(userId, 'freezeCoins');
    const item = await prisma.storeItem.findUnique({ where: { id: itemId, isActive: true } });
    if (!item) throw new AppError('Item not found', 404);
    if (!item.isForSale) throw new AppError('This item is not for sale', 400);

    // Special IDs are purchased through the dedicated Special ID store, not here.
    if (item.category === 'special_id') {
      throw new AppError('Special IDs must be purchased via the Special ID store', 400);
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.coinBalance < item.coinCost) throw new AppError('Insufficient coins', 400);

    const expiresAt =
      item.durationDays > 0
        ? new Date(Date.now() + item.durationDays * 24 * 60 * 60 * 1000)
        : null;

    const autoEquip = shouldAutoEquipOnPurchase(item.category);

    const userItem = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId },
        data: { coinBalance: { decrement: item.coinCost } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: 'debit',
          currency: 'coins',
          amount: item.coinCost,
          balanceAfter: Number(wallet.coinBalance) - item.coinCost,
          reference: 'store_purchase',
          description: `Purchased ${item.name}`,
        },
      });
      if (autoEquip) {
        await unequipCategoryItems(tx, userId, item.category);
      }
      return tx.userStoreItem.create({
        data: {
          userId,
          itemId,
          expiresAt,
          purchasedAt: new Date(),
          isEquipped: autoEquip,
        },
        include: { item: true },
      });
    });

    return formatUserItem(userItem);
  },

  async sendItem(senderId: string, itemId: string, recipientHakaId: string) {
    const item = await prisma.storeItem.findUnique({ where: { id: itemId, isActive: true } });
    if (!item) throw new AppError('Item not found', 404);
    if (!item.isForSale) throw new AppError('This item is not for sale', 400);
    if (item.category === 'special_id') throw new AppError('Use the Special ID send endpoint', 400);

    const recipientId = await resolveUserId(recipientHakaId);
    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) throw new AppError('Recipient not found', 404);
    if (!recipient.isActive) throw new AppError('Recipient account is not active', 400);
    if (recipient.id === senderId) throw new AppError('Cannot send an item to yourself', 400);

    const wallet = await prisma.wallet.findUnique({ where: { userId: senderId } });
    if (!wallet || wallet.coinBalance < item.coinCost) throw new AppError('Insufficient coins', 400);

    const expiresAt = item.durationDays > 0
      ? new Date(Date.now() + item.durationDays * 24 * 60 * 60 * 1000)
      : null;

    const userItem = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId: senderId },
        data: { coinBalance: { decrement: item.coinCost } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: 'debit',
          currency: 'coins',
          amount: item.coinCost,
          balanceAfter: Number(wallet.coinBalance) - item.coinCost,
          reference: 'store_send',
          description: `Sent ${item.name} to ${recipient.displayName}`,
        },
      });
      return tx.userStoreItem.create({
        data: { userId: recipient.id, itemId, expiresAt, purchasedAt: new Date() },
        include: { item: true },
      });
    });

    return formatUserItem(userItem);
  },

  // ── Special ID Store ──────────────────────────────────────────────────────

  /**
   * List all available Special IDs for the store, sorted by level.
   */
  async getSpecialIds(level?: string) {
    const where: any = { status: 'available' };
    if (level) where.level = level;
    const items = await prisma.specialId.findMany({
      where,
      orderBy: [{ level: 'asc' }, { price: 'asc' }],
    });
    return items.map((s) => ({
      id: s.id,
      number: s.number,
      price: s.price,
      durationDays: s.durationDays,
      level: s.level,
    }));
  },

  /**
   * Purchase a Special ID → deduct coins, create inventory entry, mark SpecialId as owned.
   * The ID goes to the user's backpack as "inactive" — must be activated separately.
   */
  async purchaseSpecialId(userId: string, specialIdId: string) {
    await assertNoRiskBlock(userId, 'freezeCoins');
    const specialId = await prisma.specialId.findUnique({ where: { id: specialIdId } });
    if (!specialId) throw new AppError('Special ID not found', 404);
    if (specialId.status !== 'available') throw new AppError('Special ID is no longer available', 409);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.coinBalance < specialId.price) {
      throw new AppError('Insufficient coins', 400);
    }

    const inventory = await prisma.$transaction(async (tx) => {
      // Deduct coins
      await tx.wallet.update({
        where: { userId },
        data: { coinBalance: { decrement: specialId.price } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: 'debit',
          currency: 'coins',
          amount: specialId.price,
          balanceAfter: Number(wallet.coinBalance) - specialId.price,
          reference: 'special_id_purchase',
          description: `Purchased Special ID ${specialId.number}`,
        },
      });
      // Mark SpecialId as owned
      await tx.specialId.update({
        where: { id: specialIdId },
        data: { status: 'owned' },
      });
      // Create inventory entry
      return tx.specialIdInventory.create({
        data: {
          userId,
          specialIdId,
          pricePaid: specialId.price,
          status: 'inactive',
        },
        include: { specialId: true },
      });
    });

    return {
      id: inventory.id,
      specialId: {
        id: inventory.specialId.id,
        number: inventory.specialId.number,
        level: inventory.specialId.level,
        durationDays: inventory.specialId.durationDays,
      },
      pricePaid: inventory.pricePaid,
      status: inventory.status,
      purchasedAt: inventory.purchasedAt.toISOString(),
    };
  },

  /**
   * Get all Special IDs in the user's backpack (purchased inventory).
   */
  async getMySpecialIds(userId: string) {
    const items = await prisma.specialIdInventory.findMany({
      where: { userId },
      include: { specialId: true },
      orderBy: { purchasedAt: 'desc' },
    });
    return items.map((inv) => ({
      id: inv.id,
      specialId: {
        id: inv.specialId.id,
        number: inv.specialId.number,
        level: inv.specialId.level,
        durationDays: inv.specialId.durationDays,
      },
      pricePaid: inv.pricePaid,
      status: inv.status,
      activatedAt: inv.activatedAt?.toISOString() ?? null,
      expiresAt: inv.expiresAt?.toISOString() ?? null,
      purchasedAt: inv.purchasedAt.toISOString(),
    }));
  },

  /**
   * Activate a Special ID from the user's backpack.
   * - Deactivates any currently active Special ID first.
   * - Sets expiresAt based on durationDays from the SpecialId record.
   * - Updates User.activeSpecialId + activeSpecialIdExpiresAt.
   */
  async activateSpecialId(userId: string, inventoryId: string) {
    const inv = await prisma.specialIdInventory.findUnique({
      where: { id: inventoryId },
      include: { specialId: true },
    });
    if (!inv || inv.userId !== userId) throw new AppError('Special ID not found in your backpack', 404);
    if (inv.status === 'active') throw new AppError('This Special ID is already active', 400);
    if (inv.status === 'expired') throw new AppError('This Special ID has expired', 400);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + inv.specialId.durationDays * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // Deactivate any currently active special ID for this user
      const currentActive = await tx.specialIdInventory.findFirst({
        where: { userId, status: 'active' },
      });
      if (currentActive) {
        await tx.specialIdInventory.update({
          where: { id: currentActive.id },
          data: { status: 'inactive' },
        });
      }

      // Activate the new one
      await tx.specialIdInventory.update({
        where: { id: inventoryId },
        data: { status: 'active', activatedAt: now, expiresAt },
      });

      // Update user's active special ID
      await tx.user.update({
        where: { id: userId },
        data: {
          activeSpecialId: inv.specialId.number,
          activeSpecialIdLevel: inv.specialId.level,
          activeSpecialIdExpiresAt: expiresAt,
        },
      });
    });

    return {
      id: inv.id,
      specialId: {
        id: inv.specialId.id,
        number: inv.specialId.number,
        level: inv.specialId.level,
      },
      status: 'active',
      activatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  },

  /**
   * Deactivate the user's currently active Special ID.
   */
  async deactivateSpecialId(userId: string) {
    const active = await prisma.specialIdInventory.findFirst({
      where: { userId, status: 'active' },
      include: { specialId: true },
    });
    if (!active) throw new AppError('No active Special ID to deactivate', 400);

    await prisma.$transaction(async (tx) => {
      await tx.specialIdInventory.update({
        where: { id: active.id },
        data: { status: 'inactive' },
      });
      await tx.user.update({
        where: { id: userId },
        data: { activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null },
      });
    });

    return { message: 'Special ID deactivated' };
  },

  /**
   * Send (gift) a Special ID to another user.
   * Sender pays the coins; recipient receives the inventory entry as inactive.
   */
  async sendSpecialId(senderId: string, specialIdId: string, recipientHakaId: string) {
    const specialId = await prisma.specialId.findUnique({ where: { id: specialIdId } });
    if (!specialId) throw new AppError('Special ID not found', 404);
    if (specialId.status !== 'available') throw new AppError('Special ID is no longer available', 409);

    const recipientId = await resolveUserId(recipientHakaId);
    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) throw new AppError('Recipient not found', 404);
    if (!recipient.isActive) throw new AppError('Recipient account is not active', 400);
    if (recipient.id === senderId) throw new AppError('Cannot send a Special ID to yourself', 400);

    const wallet = await prisma.wallet.findUnique({ where: { userId: senderId } });
    if (!wallet || wallet.coinBalance < specialId.price) {
      throw new AppError('Insufficient coins', 400);
    }

    const inventory = await prisma.$transaction(async (tx) => {
      // Deduct coins from sender
      await tx.wallet.update({
        where: { userId: senderId },
        data: { coinBalance: { decrement: specialId.price } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: 'debit',
          currency: 'coins',
          amount: specialId.price,
          balanceAfter: Number(wallet.coinBalance) - specialId.price,
          reference: 'special_id_send',
          description: `Sent Special ID ${specialId.number} to ${recipient.displayName}`,
        },
      });
      // Mark SpecialId as owned
      await tx.specialId.update({
        where: { id: specialIdId },
        data: { status: 'owned' },
      });
      // Create inventory entry for recipient
      return tx.specialIdInventory.create({
        data: {
          userId: recipient.id,
          specialIdId,
          pricePaid: specialId.price,
          status: 'inactive',
        },
        include: { specialId: true },
      });
    });

    return {
      id: inventory.id,
      recipientId: recipient.id,
      recipientDisplayName: recipient.displayName,
      specialId: {
        id: inventory.specialId.id,
        number: inventory.specialId.number,
        level: inventory.specialId.level,
      },
      pricePaid: inventory.pricePaid,
    };
  },

  async getMyItems(userId: string, category?: string) {
    const items = await prisma.userStoreItem.findMany({
      where: {
        userId,
        ...(category ? { item: { category } } : {}),
      },
      include: { item: true },
      orderBy: { purchasedAt: 'desc' },
    });
    return items.map(formatUserItem);
  },

  async equip(userId: string, userStoreItemId: string) {
    const ui = await prisma.userStoreItem.findUnique({
      where: { id: userStoreItemId },
      include: { item: true },
    });
    if (!ui || ui.userId !== userId) throw new AppError('Item not found', 404);

    // Unequip any other item in same category
    await prisma.userStoreItem.updateMany({
      where: { userId, item: { category: ui.item.category }, isEquipped: true },
      data: { isEquipped: false },
    });

    const updated = await prisma.userStoreItem.update({
      where: { id: userStoreItemId },
      data: { isEquipped: true },
      include: { item: true },
    });
    return formatUserItem(updated);
  },

  async unequip(userId: string, userStoreItemId: string) {
    const ui = await prisma.userStoreItem.findUnique({
      where: { id: userStoreItemId },
      include: { item: true },
    });
    if (!ui || ui.userId !== userId) throw new AppError('Item not found', 404);

    const updated = await prisma.userStoreItem.update({
      where: { id: userStoreItemId },
      data: { isEquipped: false },
      include: { item: true },
    });
    return formatUserItem(updated);
  },
};
