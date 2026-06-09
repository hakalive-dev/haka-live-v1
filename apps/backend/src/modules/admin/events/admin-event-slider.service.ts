import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

type Tx = Prisma.TransactionClient;

type EventForSlider = {
  id: string;
  name: string;
  description: string;
  bannerUrl: string;
  startDate: Date;
  endDate: Date;
  visibility: unknown;
};

function wantsBannerSlider(visibility: unknown): boolean {
  if (!visibility || typeof visibility !== 'object') return false;
  return Boolean((visibility as Record<string, unknown>).bannerSlider);
}

export async function syncEventSliderBanner(
  event: EventForSlider,
  adminId: string,
  ip: string,
  tx?: Tx,
) {
  const db = tx ?? prisma;
  const showInSlider = wantsBannerSlider(event.visibility);
  const existing = await db.banner.findUnique({ where: { eventId: event.id } });

  if (!showInSlider) {
    if (existing?.isActive) {
      await db.banner.update({ where: { id: existing.id }, data: { isActive: false } });
      await logAdminAction(adminId, 'banner.deactivate', 'Banner', existing.id, { source: 'event.slider' }, ip);
    }
    return null;
  }

  if (!event.bannerUrl) {
    throw new AppError('Event banner image is required to show in the banner slider', 400);
  }

  const payload = {
    imageUrl: event.bannerUrl,
    title: event.name,
    subtitle: event.description,
    redirectType: 'event',
    redirectValue: event.id,
    placement: 'home_top',
    priority: 5,
    isActive: true,
    startDate: event.startDate,
    endDate: event.endDate,
    eventId: event.id,
  };

  if (existing) {
    const banner = await db.banner.update({ where: { id: existing.id }, data: payload });
    await logAdminAction(adminId, 'banner.update', 'Banner', banner.id, { source: 'event.slider', eventId: event.id }, ip);
    return banner;
  }

  const banner = await db.banner.create({ data: { ...payload, createdBy: adminId } });
  await logAdminAction(adminId, 'banner.create', 'Banner', banner.id, { source: 'event.slider', eventId: event.id }, ip);
  return banner;
}
