import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

export type SaleStatusSource = 'manual' | 'bulk' | 'schedule';

async function writeSaleStatusLog(params: {
  itemId: string;
  previousForSale: boolean;
  newForSale: boolean;
  adminId: string;
  reason: string;
  source: SaleStatusSource;
  scheduleId?: string;
}) {
  await prisma.storeItemSaleStatusLog.create({
    data: {
      itemId: params.itemId,
      previousForSale: params.previousForSale,
      newForSale: params.newForSale,
      adminId: params.adminId,
      reason: params.reason,
      source: params.source,
      scheduleId: params.scheduleId ?? null,
    },
  });
}

export async function setItemSaleStatus(
  itemId: string,
  isForSale: boolean,
  adminId: string,
  ip: string,
  opts?: { reason?: string; source?: SaleStatusSource; scheduleId?: string; skipAudit?: boolean },
) {
  const existing = await prisma.storeItem.findUnique({ where: { id: itemId } });
  if (!existing) throw new AppError('Store item not found', 404);
  if (existing.isForSale === isForSale) return existing;

  const item = await prisma.storeItem.update({
    where: { id: itemId },
    data: { isForSale },
  });

  await writeSaleStatusLog({
    itemId,
    previousForSale: existing.isForSale,
    newForSale: isForSale,
    adminId,
    reason: opts?.reason ?? '',
    source: opts?.source ?? 'manual',
    scheduleId: opts?.scheduleId,
  });

  if (!opts?.skipAudit) {
    await logAdminAction(
      adminId,
      'store.sale_status',
      'StoreItem',
      itemId,
      { isForSale, previousForSale: existing.isForSale, reason: opts?.reason ?? '' },
      ip,
    );
  }

  return item;
}

export async function bulkSetSaleStatus(
  itemIds: string[],
  isForSale: boolean,
  adminId: string,
  ip: string,
  reason?: string,
) {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length === 0) throw new AppError('At least one item is required', 400);

  const items = await prisma.storeItem.findMany({ where: { id: { in: uniqueIds } } });
  if (items.length !== uniqueIds.length) {
    throw new AppError('One or more store items were not found', 404);
  }

  const updated: string[] = [];
  for (const item of items) {
    if (item.isForSale === isForSale) continue;
    await setItemSaleStatus(item.id, isForSale, adminId, ip, {
      reason: reason ?? '',
      source: 'bulk',
      skipAudit: true,
    });
    updated.push(item.id);
  }

  if (updated.length > 0) {
    await logAdminAction(
      adminId,
      'store.sale_status_bulk',
      'StoreItem',
      updated[0]!,
      { itemIds: updated, isForSale, reason: reason ?? '' },
      ip,
    );
  }

  return { updatedCount: updated.length, itemIds: updated };
}

export async function getSaleStatusHistory(
  itemId: string,
  params: { page: number; limit: number },
) {
  const item = await prisma.storeItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw new AppError('Store item not found', 404);

  const { page, limit } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.StoreItemSaleStatusLogWhereInput = { itemId };

  const [logs, total] = await Promise.all([
    prisma.storeItemSaleStatusLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.storeItemSaleStatusLog.count({ where }),
  ]);

  return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function createSaleSchedule(
  adminId: string,
  ip: string,
  data: {
    itemIds: string[];
    targetForSale: boolean;
    effectiveAt: Date;
    reason?: string;
  },
) {
  const uniqueIds = [...new Set(data.itemIds)];
  if (uniqueIds.length === 0) throw new AppError('At least one item is required', 400);
  if (data.effectiveAt.getTime() <= Date.now()) {
    throw new AppError('effectiveAt must be in the future', 400);
  }

  const items = await prisma.storeItem.findMany({ where: { id: { in: uniqueIds } } });
  if (items.length !== uniqueIds.length) {
    throw new AppError('One or more store items were not found', 404);
  }

  const schedules = await prisma.$transaction(
    uniqueIds.map((itemId) =>
      prisma.storeItemSaleSchedule.create({
        data: {
          itemId,
          targetForSale: data.targetForSale,
          effectiveAt: data.effectiveAt,
          createdByAdminId: adminId,
          reason: data.reason ?? '',
        },
      }),
    ),
  );

  await logAdminAction(
    adminId,
    'store.sale_schedule_create',
    'StoreItem',
    uniqueIds[0]!,
    {
      itemIds: uniqueIds,
      targetForSale: data.targetForSale,
      effectiveAt: data.effectiveAt.toISOString(),
      scheduleIds: schedules.map((s) => s.id),
    },
    ip,
  );

  return schedules;
}

export async function listSaleSchedules(params: {
  page: number;
  limit: number;
  status?: string;
  itemId?: string;
}) {
  const { page, limit, status, itemId } = params;
  const skip = (page - 1) * limit;
  const where: Prisma.StoreItemSaleScheduleWhereInput = {};
  if (status) where.status = status;
  if (itemId) where.itemId = itemId;

  const [schedules, total] = await Promise.all([
    prisma.storeItemSaleSchedule.findMany({
      where,
      skip,
      take: limit,
      orderBy: { effectiveAt: 'asc' },
      include: { item: { select: { id: true, name: true, category: true } } },
    }),
    prisma.storeItemSaleSchedule.count({ where }),
  ]);

  return { schedules, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function cancelSaleSchedule(scheduleId: string, adminId: string, ip: string) {
  const schedule = await prisma.storeItemSaleSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new AppError('Schedule not found', 404);
  if (schedule.status !== 'pending') {
    throw new AppError('Only pending schedules can be cancelled', 400);
  }

  const updated = await prisma.storeItemSaleSchedule.update({
    where: { id: scheduleId },
    data: { status: 'cancelled' },
  });

  await logAdminAction(adminId, 'store.sale_schedule_cancel', 'StoreItem', schedule.itemId, { scheduleId }, ip);
  return updated;
}

/** Apply all due pending schedules (cron / worker). */
export async function applyDueSaleSchedules(): Promise<number> {
  const now = new Date();
  const due = await prisma.storeItemSaleSchedule.findMany({
    where: { status: 'pending', effectiveAt: { lte: now } },
    take: 100,
    orderBy: { effectiveAt: 'asc' },
  });

  let applied = 0;
  for (const schedule of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const locked = await tx.storeItemSaleSchedule.findUnique({ where: { id: schedule.id } });
        if (!locked || locked.status !== 'pending') return;

        const itemBefore = await tx.storeItem.findUnique({ where: { id: schedule.itemId } });
        if (!itemBefore) return;

        await tx.storeItem.update({
          where: { id: schedule.itemId },
          data: { isForSale: schedule.targetForSale },
        });

        if (itemBefore.isForSale !== schedule.targetForSale) {
          await tx.storeItemSaleStatusLog.create({
            data: {
              itemId: schedule.itemId,
              previousForSale: itemBefore.isForSale,
              newForSale: schedule.targetForSale,
              adminId: schedule.createdByAdminId,
              reason: schedule.reason,
              source: 'schedule',
              scheduleId: schedule.id,
            },
          });
        }

        await tx.storeItemSaleSchedule.update({
          where: { id: schedule.id },
          data: { status: 'applied', appliedAt: now },
        });
      });
      applied += 1;
    } catch (err) {
      console.error('[store-sale-schedule] failed to apply', schedule.id, err);
    }
  }

  return applied;
}
