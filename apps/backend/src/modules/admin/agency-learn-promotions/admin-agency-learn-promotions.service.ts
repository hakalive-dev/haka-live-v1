import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

export interface AgencyLearnPromotionInput {
  imageUrl: string;
  title: string;
  description?: string;
  linkUrl?: string;
  viewCount?: number;
  likeCount?: number;
  tag?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function listAgencyLearnPromotions(activeOnly = false) {
  const where = activeOnly ? { isActive: true } : {};
  return prisma.agencyLearnPromotion.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getAgencyLearnPromotion(id: string) {
  const row = await prisma.agencyLearnPromotion.findUnique({ where: { id } });
  if (!row) throw new AppError('Learn promotion not found', 404);
  return row;
}

export async function createAgencyLearnPromotion(
  data: AgencyLearnPromotionInput,
  adminId: string,
  ip: string,
) {
  const row = await prisma.agencyLearnPromotion.create({ data });
  await logAdminAction(
    adminId,
    'agency_learn_promotion.create',
    'AgencyLearnPromotion',
    row.id,
    { title: row.title },
    ip,
  );
  return row;
}

export async function updateAgencyLearnPromotion(
  id: string,
  data: Partial<AgencyLearnPromotionInput>,
  adminId: string,
  ip: string,
) {
  const existing = await prisma.agencyLearnPromotion.findUnique({ where: { id } });
  if (!existing) throw new AppError('Learn promotion not found', 404);
  const row = await prisma.agencyLearnPromotion.update({ where: { id }, data });
  await logAdminAction(
    adminId,
    'agency_learn_promotion.update',
    'AgencyLearnPromotion',
    id,
    { title: row.title },
    ip,
  );
  return row;
}

export async function deleteAgencyLearnPromotion(id: string, adminId: string, ip: string) {
  const existing = await prisma.agencyLearnPromotion.findUnique({ where: { id } });
  if (!existing) throw new AppError('Learn promotion not found', 404);
  await prisma.agencyLearnPromotion.delete({ where: { id } });
  await logAdminAction(
    adminId,
    'agency_learn_promotion.delete',
    'AgencyLearnPromotion',
    id,
    { title: existing.title },
    ip,
  );
}

export async function toggleAgencyLearnPromotion(
  id: string,
  isActive: boolean,
  adminId: string,
  ip: string,
) {
  const row = await prisma.agencyLearnPromotion.update({ where: { id }, data: { isActive } });
  await logAdminAction(
    adminId,
    isActive ? 'agency_learn_promotion.activate' : 'agency_learn_promotion.deactivate',
    'AgencyLearnPromotion',
    id,
    {},
    ip,
  );
  return row;
}
