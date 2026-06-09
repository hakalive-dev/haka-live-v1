import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';

const CS_ROLE = 'cs';

export async function listCs(params: { region?: string; managerId?: string } = {}) {
  const where: Record<string, unknown> = { role: CS_ROLE };
  if (params.region) where.region = params.region;
  if (params.managerId) where.managerId = params.managerId;

  const members = await prisma.adminUser.findMany({ where, orderBy: { createdAt: 'desc' } });
  return {
    items: members.map(m => ({
      id: m.id, displayName: m.displayName, email: m.email,
      region: m.region, managerId: m.managerId, hakaId: m.hakaId,
      isActive: m.isActive, createdAt: m.createdAt,
    })),
    total: members.length,
  };
}

export async function getCsDetail(csId: string) {
  const m = await prisma.adminUser.findUnique({ where: { id: csId } });
  if (!m || m.role !== CS_ROLE) throw new AppError('CS member not found', 404);
  return {
    id: m.id, displayName: m.displayName, email: m.email,
    region: m.region, managerId: m.managerId, hakaId: m.hakaId,
    isActive: m.isActive, createdAt: m.createdAt, updatedAt: m.updatedAt,
  };
}

export async function setCsActive(csId: string, isActive: boolean) {
  const m = await prisma.adminUser.findUnique({ where: { id: csId } });
  if (!m || m.role !== CS_ROLE) throw new AppError('CS member not found', 404);
  await prisma.adminUser.update({ where: { id: csId }, data: { isActive } });
}
