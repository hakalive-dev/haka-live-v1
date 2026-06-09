import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

export async function listSettings() {
  return prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
}

export async function getSetting(key: string) {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting) throw new AppError('Setting not found', 404);
  return setting;
}

export async function upsertSetting(adminId: string, key: string, value: unknown, ipAddress?: string) {
  const setting = await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as any, updatedBy: adminId },
    update: { value: value as any, updatedBy: adminId },
  });

  await logAdminAction(adminId, 'setting.update', 'SystemSetting', key, { value }, ipAddress);
  return setting;
}

export async function deleteSetting(adminId: string, key: string, ipAddress?: string) {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting) throw new AppError('Setting not found', 404);

  await prisma.systemSetting.delete({ where: { key } });
  await logAdminAction(adminId, 'setting.delete', 'SystemSetting', key, undefined, ipAddress);
}
