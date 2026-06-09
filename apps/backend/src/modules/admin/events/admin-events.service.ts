import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { syncEventSliderBanner } from './admin-event-slider.service';

export interface EventInput {
  name: string;
  type: string;
  startDate: Date;
  endDate: Date;
  bannerUrl?: string;
  description?: string;
  entryRequirement?: string;
  entryCost?: number;
  participationType?: string;
  scoringSystem?: string;
  rankingPeriod?: string;
  visibility?: Record<string, boolean>;
  rewards?: { rank: number; rewardType: string; rewardLabel: string; rewardAmount: number }[];
}

function deriveStatus(startDate: Date, endDate: Date): string {
  const now = new Date();
  if (now < startDate) return 'upcoming';
  if (now > endDate) return 'expired';
  return 'active';
}

export async function listEvents(status?: string) {
  const where = status ? { status } : {};
  return prisma.event.findMany({
    where,
    include: { rewards: { orderBy: { rank: 'asc' } } },
    orderBy: { startDate: 'desc' },
  });
}

export async function getEvent(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { rewards: { orderBy: { rank: 'asc' } } },
  });
  if (!event) throw new AppError('Event not found', 404);
  return event;
}

export async function createEvent(data: EventInput, adminId: string, ip: string) {
  const status = deriveStatus(data.startDate, data.endDate);
  const { rewards, visibility, ...rest } = data;

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        ...rest,
        status,
        visibility: visibility ?? { homePage: true, bannerSlider: false, pushNotification: false },
        createdBy: adminId,
        rewards: rewards
          ? { create: rewards.map(r => ({ ...r, rewardAmount: r.rewardAmount })) }
          : undefined,
      },
      include: { rewards: { orderBy: { rank: 'asc' } } },
    });

    await syncEventSliderBanner(created, adminId, ip, tx);
    return created;
  });

  await logAdminAction(adminId, 'event.create', 'Event', event.id, { name: event.name }, ip);
  return event;
}

export async function updateEvent(id: string, data: Partial<EventInput>, adminId: string, ip: string) {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new AppError('Event not found', 404);

  const { rewards, ...rest } = data;
  const status = rest.startDate && rest.endDate
    ? deriveStatus(rest.startDate, rest.endDate)
    : existing.status;

  const event = await prisma.$transaction(async (tx) => {
    if (rewards) {
      await tx.eventReward.deleteMany({ where: { eventId: id } });
      await tx.eventReward.createMany({
        data: rewards.map(r => ({ ...r, eventId: id, rewardAmount: r.rewardAmount })),
      });
    }
    const updated = await tx.event.update({
      where: { id },
      data: { ...rest, status },
      include: { rewards: { orderBy: { rank: 'asc' } } },
    });

    await syncEventSliderBanner(updated, adminId, ip, tx);
    return updated;
  });

  await logAdminAction(adminId, 'event.update', 'Event', id, { name: event.name }, ip);
  return event;
}

export async function deleteEvent(id: string, adminId: string, ip: string) {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new AppError('Event not found', 404);
  await prisma.event.delete({ where: { id } });
  await logAdminAction(adminId, 'event.delete', 'Event', id, { name: existing.name }, ip);
}

// Sync status of all events based on current time
export async function syncEventStatuses() {
  const now = new Date();
  await prisma.event.updateMany({
    where: { startDate: { gt: now } },
    data: { status: 'upcoming' },
  });
  await prisma.event.updateMany({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    data: { status: 'active' },
  });
  await prisma.event.updateMany({
    where: { endDate: { lt: now } },
    data: { status: 'expired' },
  });
}
