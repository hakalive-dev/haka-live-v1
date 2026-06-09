import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

export interface BannerInput {
  imageUrl: string;
  title: string;
  subtitle?: string;
  redirectType: string;
  redirectValue?: string;
  placement?: string;
  priority?: number;
  isActive?: boolean;
  startDate: Date;
  endDate: Date;
}

export async function listBanners(activeOnly = false, placement?: string) {
  const where: any = {};
  if (activeOnly) where.isActive = true;
  if (placement) where.placement = placement;
  return prisma.banner.findMany({ where, orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] });
}

export async function getBanner(id: string) {
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) throw new AppError('Banner not found', 404);
  return banner;
}

export async function createBanner(data: BannerInput, adminId: string, ip: string) {
  const banner = await prisma.banner.create({
    data: { ...data, createdBy: adminId },
  });
  await logAdminAction(adminId, 'banner.create', 'Banner', banner.id, { title: banner.title }, ip);
  return banner;
}

export async function updateBanner(id: string, data: Partial<BannerInput>, adminId: string, ip: string) {
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) throw new AppError('Banner not found', 404);
  const banner = await prisma.banner.update({ where: { id }, data });
  await logAdminAction(adminId, 'banner.update', 'Banner', id, { title: banner.title }, ip);
  return banner;
}

export async function deleteBanner(id: string, adminId: string, ip: string) {
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) throw new AppError('Banner not found', 404);
  await prisma.banner.delete({ where: { id } });
  await logAdminAction(adminId, 'banner.delete', 'Banner', id, { title: existing.title }, ip);
}

export async function toggleBanner(id: string, isActive: boolean, adminId: string, ip: string) {
  const banner = await prisma.banner.update({ where: { id }, data: { isActive } });
  await logAdminAction(adminId, isActive ? 'banner.activate' : 'banner.deactivate', 'Banner', id, {}, ip);
  return banner;
}
