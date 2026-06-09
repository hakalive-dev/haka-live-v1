import { prisma } from '../../config/prisma';

export async function getAvailableThemes(userId: string) {
  const now = new Date();
  const [freeThemes, ownedItems] = await Promise.all([
    prisma.theme.findMany({ where: { storeItemId: null } }),
    prisma.userStoreItem.findMany({
      where: {
        userId,
        item: { category: 'theme' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { itemId: true },
    }),
  ]);

  const ownedItemIds = new Set(ownedItems.map((i) => i.itemId));

  const paidThemes = ownedItemIds.size > 0
    ? await prisma.theme.findMany({
        where: { storeItemId: { in: [...ownedItemIds] } },
      })
    : [];

  return [...freeThemes, ...paidThemes];
}
