import { prisma } from '../../config/prisma';
import { createAdminNotification } from '../admin/notifications/admin-notifications.service';
import {
  MAX_SUPPORT_SCREENSHOTS,
  primaryScreenshotUrl,
  ticketScreenshotUrls,
} from './support-screenshots';

/**
 * User: create a support ticket.
 */
export async function createTicket(
  userId: string,
  description: string,
  screenshotUrls: string[],
) {
  const urls = screenshotUrls.map((u) => u.trim()).filter(Boolean).slice(0, MAX_SUPPORT_SCREENSHOTS);

  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      description,
      screenshotUrls: urls,
      screenshotUrl: primaryScreenshotUrl(urls),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, hakaId: true },
  });

  const descPreview =
    description.length > 120 ? `${description.slice(0, 120)}…` : description;
  const attachmentNote =
    urls.length > 0 ? ` · ${urls.length} attachment${urls.length > 1 ? 's' : ''}` : '';

  await createAdminNotification({
    type: 'support_ticket_created',
    title: 'New support ticket',
    body: `${user?.displayName ?? 'User'} (${user?.hakaId ?? '—'}): ${descPreview}${attachmentNote}`,
    linkPath: '/support-tickets',
    entityType: 'SupportTicket',
    entityId: ticket.id,
  });

  return ticket;
}

/**
 * User: list own support tickets.
 */
export async function getMyTickets(userId: string, page: number, limit: number) {
  const where = { userId };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return {
    items: items.map((t) => ({
      ...t,
      screenshotUrls: ticketScreenshotUrls(t),
    })),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}
