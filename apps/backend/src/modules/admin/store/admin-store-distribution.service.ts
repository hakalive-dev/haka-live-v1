import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { createNotification } from '../../notifications/notifications.service';
import { insertServerDirectMessage } from '../../chat/chat.service';
import { getHakaTeamUserId } from '../../../constants/haka-team';
import { getSystemQueue, SystemJobNames } from '../../../queues/system-queue';

export type DistributionChannel = 'single' | 'bulk' | 'emergency';
export type AudienceType = 'user_ids' | 'agency' | 'host_level' | 'country' | 'all';

export interface GrantStoreItemParams {
  adminId: string;
  userId: string;
  itemId: string;
  quantity: number;
  reason: string;
  durationDays?: number | null;
  channel: DistributionChannel;
  audienceType: AudienceType;
  audienceMeta?: Record<string, unknown>;
  bulkJobId?: string;
  ip?: string;
  skipNotification?: boolean;
}

function resolveExpiresAt(durationDays: number | null | undefined, itemDurationDays: number): Date | null {
  const days = durationDays != null ? durationDays : itemDurationDays;
  if (days > 0) return new Date(Date.now() + days * 86400 * 1000);
  return null;
}

export async function grantStoreItemToUserInternal(params: GrantStoreItemParams) {
  const {
    adminId,
    userId,
    itemId,
    quantity,
    reason,
    durationDays,
    channel,
    audienceType,
    audienceMeta,
    bulkJobId,
    ip,
    skipNotification,
  } = params;

  if (quantity < 1 || quantity > 100) {
    throw new AppError('quantity must be between 1 and 100', 400);
  }

  const [user, item] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } }),
    prisma.storeItem.findUnique({ where: { id: itemId } }),
  ]);
  if (!user) throw new AppError('User not found', 404);
  if (!item) throw new AppError('Store item not found', 404);

  const expiresAt = resolveExpiresAt(durationDays, item.durationDays);
  const coinValueSnapshot = item.coinCost * quantity;

  const userItems = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (let i = 0; i < quantity; i++) {
      const row = await tx.userStoreItem.create({
        data: { userId, itemId, expiresAt, isEquipped: false },
        include: { item: true },
      });
      rows.push(row);
    }

    await tx.storeItemDistribution.create({
      data: {
        itemId,
        recipientUserId: userId,
        quantity,
        reason,
        adminId,
        channel,
        audienceType,
        audienceMeta: audienceMeta as Prisma.InputJsonValue | undefined,
        coinValueSnapshot,
        bulkJobId: bulkJobId ?? '',
      },
    });

    return rows;
  });

  await logAdminAction(
    adminId,
    'store.distribute',
    'User',
    userId,
    { itemId, itemName: item.name, quantity, reason, channel, audienceType },
    ip,
  );

  if (!skipNotification) {
    void createNotification(
      userId,
      'store_gift',
      'You received a gift from Haka Live.',
      `You received "${item.name}"${quantity > 1 ? ` (×${quantity})` : ''}.`,
      { itemId, itemName: item.name, quantity },
    ).catch(() => {});

    void insertServerDirectMessage({
      senderId: getHakaTeamUserId(),
      recipientId: userId,
      content: `You received a gift from Haka Live: "${item.name}"${quantity > 1 ? ` (×${quantity})` : ''}.`,
      messageType: 'store_gift',
      skipRecipientNotify: true,
    }).catch(() => {});
  }

  return { userItems, item };
}

export async function lookupUserByHakaId(hakaId: string) {
  const trimmed = hakaId.trim();
  if (!trimmed) throw new AppError('hakaId is required', 400);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { hakaId: { equals: trimmed, mode: 'insensitive' } },
        { id: trimmed },
        { username: { equals: trimmed, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      hakaId: true,
      username: true,
      displayName: true,
      avatar: true,
    },
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

async function resolveUserIdsFromIdentifiers(identifiers: string[]): Promise<string[]> {
  const unique = [...new Set(identifiers.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) throw new AppError('At least one user identifier is required', 400);

  const users = await prisma.user.findMany({
    where: {
      OR: unique.flatMap((id) => [
        { id },
        { hakaId: { equals: id, mode: 'insensitive' } },
        { username: { equals: id, mode: 'insensitive' } },
      ]),
    },
    select: { id: true },
  });

  if (users.length === 0) throw new AppError('No matching users found', 404);
  return users.map((u) => u.id);
}

export async function resolveAudienceUserIds(
  audienceType: AudienceType,
  filters: Record<string, unknown>,
): Promise<{ userIds: string[]; estimatedCount: number }> {
  switch (audienceType) {
    case 'user_ids': {
      const raw = filters.userIds;
      const ids = Array.isArray(raw)
        ? (raw as string[])
        : typeof raw === 'string'
          ? raw.split(/[\s,]+/)
          : [];
      const userIds = await resolveUserIdsFromIdentifiers(ids);
      return { userIds, estimatedCount: userIds.length };
    }
    case 'agency': {
      const agencyId = String(filters.agencyId ?? '');
      if (!agencyId) throw new AppError('agencyId is required', 400);
      const agency = await prisma.agency.findFirst({
        where: { id: agencyId, deletedAt: null },
        select: { ownerId: true },
      });
      if (!agency) throw new AppError('Agency not found', 404);
      const hosts = await prisma.user.findMany({
        where: { agentId: agency.ownerId, isActive: true, profileHidden: false },
        select: { id: true },
      });
      const userIds = hosts.map((h) => h.id);
      return { userIds, estimatedCount: userIds.length };
    }
    case 'host_level': {
      const levelType = filters.levelType === 'charm' ? 'charm' : 'rich';
      const minLevel = Number(filters.minLevel ?? 1);
      const maxLevel = filters.maxLevel != null ? Number(filters.maxLevel) : null;
      if (minLevel < 1) throw new AppError('minLevel must be at least 1', 400);

      const levelWhere =
        levelType === 'charm'
          ? {
              charmLevel: maxLevel != null
                ? { gte: minLevel, lte: maxLevel }
                : { gte: minLevel },
            }
          : {
              richLevel: maxLevel != null
                ? { gte: minLevel, lte: maxLevel }
                : { gte: minLevel },
            };

      const levels = await prisma.userLevel.findMany({
        where: levelWhere,
        select: { userId: true },
      });
      const levelUserIds = levels.map((l) => l.userId);
      if (levelUserIds.length === 0) return { userIds: [], estimatedCount: 0 };

      const users = await prisma.user.findMany({
        where: {
          id: { in: levelUserIds },
          isActive: true,
          profileHidden: false,
          role: 'host',
        },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      return { userIds, estimatedCount: userIds.length };
    }
    case 'country': {
      const country = String(filters.country ?? '').trim();
      if (!country) throw new AppError('country is required', 400);
      const users = await prisma.user.findMany({
        where: {
          country: { equals: country, mode: 'insensitive' },
          isActive: true,
          profileHidden: false,
        },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      return { userIds, estimatedCount: userIds.length };
    }
    case 'all': {
      const count = await prisma.user.count({
        where: { isActive: true, profileHidden: false },
      });
      return { userIds: [], estimatedCount: count };
    }
    default:
      throw new AppError('Invalid audience type', 400);
  }
}

const SYNC_BULK_LIMIT = 500;
const BULK_BATCH_SIZE = 200;

export async function sendItemToUser(
  adminId: string,
  itemId: string,
  data: {
    userId: string;
    quantity: number;
    reason: string;
    durationDays?: number | null;
  },
  ip?: string,
) {
  return grantStoreItemToUserInternal({
    adminId,
    userId: data.userId,
    itemId,
    quantity: data.quantity,
    reason: data.reason,
    durationDays: data.durationDays,
    channel: 'single',
    audienceType: 'user_ids',
    ip,
  });
}

export async function bulkDistributeItem(
  adminId: string,
  itemId: string,
  data: {
    audienceType: AudienceType;
    audienceFilters: Record<string, unknown>;
    quantity: number;
    reason: string;
    durationDays?: number | null;
    channel?: DistributionChannel;
  },
  ip?: string,
): Promise<{ mode: 'sync' | 'async'; jobId?: string; distributedCount: number; estimatedRecipients: number }> {
  const item = await prisma.storeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new AppError('Store item not found', 404);

  const channel = data.channel ?? (data.audienceType === 'all' ? 'emergency' : 'bulk');
  const { userIds, estimatedCount } = await resolveAudienceUserIds(
    data.audienceType,
    data.audienceFilters,
  );

  if (data.audienceType === 'all' || estimatedCount > SYNC_BULK_LIMIT) {
    const jobId = `store-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const queue = getSystemQueue();
    await queue.add(
      SystemJobNames.STORE_BULK_DISTRIBUTE,
      {
        jobId,
        adminId,
        itemId,
        quantity: data.quantity,
        reason: data.reason,
        durationDays: data.durationDays ?? null,
        channel,
        audienceType: data.audienceType,
        audienceFilters: data.audienceFilters,
      },
      { jobId },
    );

    await logAdminAction(
      adminId,
      'store.distribute_bulk_enqueue',
      'StoreItem',
      itemId,
      { jobId, audienceType: data.audienceType, estimatedRecipients: estimatedCount },
      ip,
    );

    return {
      mode: 'async',
      jobId,
      distributedCount: 0,
      estimatedRecipients: estimatedCount,
    };
  }

  let distributedCount = 0;
  for (const userId of userIds) {
    await grantStoreItemToUserInternal({
      adminId,
      userId,
      itemId,
      quantity: data.quantity,
      reason: data.reason,
      durationDays: data.durationDays,
      channel,
      audienceType: data.audienceType,
      audienceMeta: data.audienceFilters,
      ip,
      skipNotification: false,
    });
    distributedCount += 1;
  }

  return { mode: 'sync', distributedCount, estimatedRecipients: userIds.length };
}

export interface StoreBulkDistributeJobData {
  jobId: string;
  adminId: string;
  itemId: string;
  quantity: number;
  reason: string;
  durationDays: number | null;
  channel: DistributionChannel;
  audienceType: AudienceType;
  audienceFilters: Record<string, unknown>;
}

export async function processStoreBulkDistributeJob(data: StoreBulkDistributeJobData): Promise<void> {
  const userIds =
    data.audienceType === 'all'
      ? (await fetchAllActiveUserIdsBatched()).userIds
      : (await resolveAudienceUserIds(data.audienceType, data.audienceFilters)).userIds;

  for (let i = 0; i < userIds.length; i += BULK_BATCH_SIZE) {
    const batch = userIds.slice(i, i + BULK_BATCH_SIZE);
    for (const userId of batch) {
      try {
        await grantStoreItemToUserInternal({
          adminId: data.adminId,
          userId,
          itemId: data.itemId,
          quantity: data.quantity,
          reason: data.reason,
          durationDays: data.durationDays,
          channel: data.channel,
          audienceType: data.audienceType,
          audienceMeta: data.audienceFilters,
          bulkJobId: data.jobId,
          skipNotification: false,
        });
      } catch (err) {
        console.error('[store-bulk-distribute] failed for user', userId, err);
      }
    }
  }
}

async function fetchAllActiveUserIdsBatched(): Promise<{ userIds: string[] }> {
  const userIds: string[] = [];
  let lastId: string | undefined;
  const pageSize = 1000;

  for (;;) {
    const page = await prisma.user.findMany({
      where: {
        isActive: true,
        profileHidden: false,
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      select: { id: true },
      take: pageSize,
      orderBy: { id: 'asc' },
    });
    if (page.length === 0) break;
    userIds.push(...page.map((u) => u.id));
    lastId = page[page.length - 1]!.id;
    if (page.length < pageSize) break;
  }

  return { userIds };
}

export async function listDistributions(params: {
  page: number;
  limit: number;
  itemId?: string;
  adminId?: string;
  recipientUserId?: string;
  from?: Date;
  to?: Date;
}) {
  const { page, limit, itemId, adminId, recipientUserId, from, to } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.StoreItemDistributionWhereInput = {};
  if (itemId) where.itemId = itemId;
  if (adminId) where.adminId = adminId;
  if (recipientUserId) where.recipientUserId = recipientUserId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  const [distributions, total] = await Promise.all([
    prisma.storeItemDistribution.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        item: { select: { id: true, name: true, category: true, coinCost: true } },
        recipient: { select: { id: true, hakaId: true, displayName: true, username: true } },
      },
    }),
    prisma.storeItemDistribution.count({ where }),
  ]);

  return { distributions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getDistributionAnalytics(params: { from?: Date; to?: Date }) {
  const where: Prisma.StoreItemDistributionWhereInput = {};
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = params.from;
    if (params.to) where.createdAt.lte = params.to;
  }

  const [aggregate, topItems, byAdmin] = await Promise.all([
    prisma.storeItemDistribution.aggregate({
      where,
      _count: { id: true },
      _sum: { quantity: true, coinValueSnapshot: true },
    }),
    prisma.storeItemDistribution.groupBy({
      by: ['itemId'],
      where,
      _sum: { quantity: true, coinValueSnapshot: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),
    prisma.storeItemDistribution.groupBy({
      by: ['adminId'],
      where,
      _count: { id: true },
      _sum: { coinValueSnapshot: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    }),
  ]);

  const itemIds = topItems.map((t) => t.itemId);
  const items = itemIds.length
    ? await prisma.storeItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true },
      })
    : [];
  const itemNameById = new Map(items.map((i) => [i.id, i.name]));

  const distributions = await prisma.storeItemDistribution.findMany({
    where,
    select: {
      recipientUserId: true,
      coinValueSnapshot: true,
      audienceType: true,
      audienceMeta: true,
    },
    take: 50000,
  });

  const recipientIds = [...new Set(distributions.map((d) => d.recipientUserId))];
  const recipients = recipientIds.length
    ? await prisma.user.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, country: true, agentId: true },
      })
    : [];
  const recipientMap = new Map(recipients.map((r) => [r.id, r]));

  const agentIds = [...new Set(recipients.map((r) => r.agentId).filter(Boolean) as string[])];
  const agencies = agentIds.length
    ? await prisma.agency.findMany({
        where: { ownerId: { in: agentIds } },
        select: { id: true, name: true, ownerId: true },
      })
    : [];
  const agencyByOwner = new Map(agencies.map((a) => [a.ownerId, a]));

  const byCountryMap = new Map<string, { count: number; coinValue: number }>();
  const byAgencyMap = new Map<string, { agencyId: string; name: string; count: number; coinValue: number }>();

  for (const d of distributions) {
    const r = recipientMap.get(d.recipientUserId);
    const country = r?.country?.trim() || 'Unknown';
    const c = byCountryMap.get(country) ?? { count: 0, coinValue: 0 };
    c.count += 1;
    c.coinValue += d.coinValueSnapshot;
    byCountryMap.set(country, c);

    if (r?.agentId) {
      const agency = agencyByOwner.get(r.agentId);
      const key = agency?.id ?? r.agentId;
      const a = byAgencyMap.get(key) ?? {
        agencyId: agency?.id ?? key,
        name: agency?.name ?? 'Unknown agency',
        count: 0,
        coinValue: 0,
      };
      a.count += 1;
      a.coinValue += d.coinValueSnapshot;
      byAgencyMap.set(key, a);
    }
  }

  return {
    totalDistributions: aggregate._count.id,
    totalQuantity: aggregate._sum.quantity ?? 0,
    totalCoinValue: aggregate._sum.coinValueSnapshot ?? 0,
    topItems: topItems.map((t) => ({
      itemId: t.itemId,
      itemName: itemNameById.get(t.itemId) ?? 'Unknown',
      count: t._count.id,
      quantity: t._sum.quantity ?? 0,
      coinValue: t._sum.coinValueSnapshot ?? 0,
    })),
    byCountry: [...byCountryMap.entries()]
      .map(([country, v]) => ({ country, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    byAgency: [...byAgencyMap.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    byAdmin: byAdmin.map((a) => ({
      adminId: a.adminId,
      count: a._count.id,
      coinValue: a._sum.coinValueSnapshot ?? 0,
    })),
  };
}
