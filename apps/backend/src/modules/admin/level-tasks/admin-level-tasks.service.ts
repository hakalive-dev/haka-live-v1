import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

export async function getSettings() {
  return prisma.hostLevelTaskSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
}

export async function updateSettings(
  data: Partial<{
    ordinaryMaxSevenDayEarnings: bigint;
    newHostProtectionDays: number;
    newHostHourlyBeans: number;
    newHostHoursPerDay: number;
    newHostTotalCapBeans: number;
    ordinaryLiveHourlyBeans: number;
    ordinaryLiveHoursPerDay: number;
    ordinaryIncomeHourlyBeans: number;
    ordinaryIncomeHoursPerDay: number;
    ordinaryHourlyMaxBeans: number;
    ordinaryDailyMaxBeans: number;
    incomeTaskThresholdBeans: number;
    liveClaimChunkMinutes: number;
    countLiveMicTime: boolean;
  }>,
  adminId: string,
  ipAddress?: string,
) {
  const updated = await prisma.hostLevelTaskSettings.update({
    where: { id: 'singleton' },
    data,
  });
  await logAdminAction(adminId, 'level_task.settings.update', 'HostLevelTaskSettings', 'singleton', data, ipAddress);
  return updated;
}

export async function listTiers() {
  return prisma.hostLevelTaskTier.findMany({ orderBy: { sortOrder: 'asc' } });
}

export async function createTier(
  data: {
    levelCode: string;
    minSevenDayEarnings: bigint;
    dailyTaskRewardBeans: number;
    incomeTaskHourlyBeans?: number;
    incomeTaskMaxHoursPerDay?: number;
    hourlyMaxBeans: number;
    sortOrder?: number;
  },
  adminId: string,
  ipAddress?: string,
) {
  const tier = await prisma.hostLevelTaskTier.create({ data });
  await logAdminAction(adminId, 'level_task.tier.create', 'HostLevelTaskTier', tier.id, { levelCode: tier.levelCode }, ipAddress);
  return tier;
}

export async function updateTier(
  id: string,
  data: Prisma.HostLevelTaskTierUpdateInput,
  adminId: string,
  ipAddress?: string,
) {
  const existing = await prisma.hostLevelTaskTier.findUnique({ where: { id } });
  if (!existing) throw new AppError('Tier not found', 404);
  const updated = await prisma.hostLevelTaskTier.update({ where: { id }, data });
  await logAdminAction(adminId, 'level_task.tier.update', 'HostLevelTaskTier', id, { fields: Object.keys(data) }, ipAddress);
  return updated;
}

export async function deleteTier(id: string, adminId: string, ipAddress?: string) {
  const existing = await prisma.hostLevelTaskTier.findUnique({ where: { id } });
  if (!existing) throw new AppError('Tier not found', 404);
  await prisma.hostLevelTaskTier.delete({ where: { id } });
  await logAdminAction(adminId, 'level_task.tier.delete', 'HostLevelTaskTier', id, { levelCode: existing.levelCode }, ipAddress);
  return { deleted: true };
}

export { listDailyClaims } from '../../hosts/level-task.service';
