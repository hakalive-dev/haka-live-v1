import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListStoreItemsParams {
  page: number;
  limit: number;
  category?: string;
  isActive?: boolean;
  isForSale?: boolean;
  search?: string;
}

const SPECIAL_ID_LEVELS = new Set(['SSS', 'SS', 'S', 'A', 'B']);

export interface CreateStoreItemData {
  name: string;
  description?: string;
  image?: string;
  previewImage?: string;
  category: string;
  level?: string;
  coinCost: number;
  durationDays: number;
  sortOrder?: number;
}

/** Tier label for special_id items only; cleared for all other categories. */
export function normalizeStoreItemLevel(category: string, level: string | undefined): string {
  if (category !== 'special_id') return '';
  const raw = (level ?? '').trim();
  if (!raw) return '';
  if (!SPECIAL_ID_LEVELS.has(raw)) {
    throw new AppError(`Invalid special ID level "${raw}". Use one of: SSS, SS, S, A, B.`, 400);
  }
  return raw;
}

export type UpdateStoreItemData = Partial<CreateStoreItemData>;

/**
 * A theme store item is only usable in-app if a matching `Theme` row points back
 * to it (the mobile app applies themes via the Theme table, not the StoreItem).
 * Keep that row in lockstep with any theme-category store item so themes created
 * from the Store page (or bulk import) work the same as ones made in Theme Management.
 *
 * Colors fall back to the Theme model's schema defaults; the background/SVGA come
 * from the store item's uploaded assets (`previewImage` = PNG, `image` = SVGA).
 */
async function syncThemeForStoreItem(item: {
  id: string;
  name: string;
  image: string | null;
  previewImage: string | null;
}) {
  const svgaUrl = item.image && item.image.toLowerCase().endsWith('.svga') ? item.image : null;
  const backgroundImageUrl = item.previewImage || null;

  const existing = await prisma.theme.findUnique({ where: { storeItemId: item.id } });
  if (existing) {
    await prisma.theme.update({
      where: { id: existing.id },
      data: {
        name: item.name,
        // Only overwrite asset URLs when the store item actually carries one,
        // so re-saving colors/price doesn't wipe an existing background/SVGA.
        ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
        ...(svgaUrl ? { svgaUrl } : {}),
      },
    });
  } else {
    await prisma.theme.create({
      data: { name: item.name, storeItemId: item.id, backgroundImageUrl, svgaUrl },
    });
  }
}

// ── Service ────────────────────────────────────────────────────────────────────

export async function listStoreItems(params: ListStoreItemsParams) {
  const { page, limit, category, isActive, isForSale, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.StoreItemWhereInput = {};
  if (category) where.category = category;
  if (isActive !== undefined) where.isActive = isActive;
  if (isForSale !== undefined) where.isForSale = isForSale;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.storeItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.storeItem.count({ where }),
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function createStoreItem(
  data: CreateStoreItemData,
  adminId: string,
  ip: string,
) {
  const level = normalizeStoreItemLevel(data.category, data.level);
  const item = await prisma.storeItem.create({
    data: { ...data, level },
  });
  if (item.category === 'theme') await syncThemeForStoreItem(item);
  await logAdminAction(adminId, 'store.create', 'StoreItem', item.id, { name: item.name }, ip);
  return item;
}

export async function updateStoreItem(
  id: string,
  data: UpdateStoreItemData,
  adminId: string,
  ip: string,
) {
  const existing = await prisma.storeItem.findUnique({ where: { id } });
  if (!existing) throw new AppError('Store item not found', 404);

  const nextCategory = data.category ?? existing.category;
  const nextLevelRaw = data.level !== undefined ? data.level : existing.level;
  const level = normalizeStoreItemLevel(nextCategory, nextLevelRaw);

  const item = await prisma.storeItem.update({
    where: { id },
    data: { ...data, level },
  });
  if (item.category === 'theme') await syncThemeForStoreItem(item);
  await logAdminAction(adminId, 'store.update', 'StoreItem', id, data, ip);
  return item;
}

export async function toggleStoreItem(id: string, isActive: boolean, adminId: string, ip: string) {
  const existing = await prisma.storeItem.findUnique({ where: { id } });
  if (!existing) throw new AppError('Store item not found', 404);
  const item = await prisma.storeItem.update({ where: { id }, data: { isActive } });
  await logAdminAction(
    adminId,
    isActive ? 'store.activate' : 'store.deactivate',
    'StoreItem',
    id,
    { name: existing.name },
    ip,
  );
  return item;
}

export async function deleteStoreItem(id: string, adminId: string, ip: string) {
  const existing = await prisma.storeItem.findUnique({ where: { id } });
  if (!existing) throw new AppError('Store item not found', 404);
  // The Theme FK is onDelete: SetNull — left alone, a deleted theme store item
  // would orphan its Theme row with a null storeItemId, which the app then serves
  // as a *free* theme to everyone. Remove the linked Theme instead.
  if (existing.category === 'theme') {
    await prisma.theme.deleteMany({ where: { storeItemId: id } });
  }
  await prisma.storeItem.delete({ where: { id } });
  await logAdminAction(adminId, 'store.delete', 'StoreItem', id, { name: existing.name }, ip);
}
