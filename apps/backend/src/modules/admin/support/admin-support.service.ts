import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { insertServerDirectMessage } from '../../chat/chat.service';
import { getHakaTeamUserId } from '../../../constants/haka-team';
import { notifyAccountAlert } from '../../notifications/notifications.service';
import { readAssetBuffer, createSignedAssetUrl } from '../../../utils/storage';
import { emitAdminDataChanged } from '../../../sockets/admin-realtime';
import { getIO } from '../../../sockets';
import { ticketScreenshotUrls } from '../../support/support-screenshots';

function buildSupportReplyDmContent(issueDescription: string, adminReply: string): string {
  const issue = issueDescription.trim();
  const parts = ['Re: Your support request'];
  if (issue) {
    parts.push(issue.length > 200 ? `Issue: ${issue.slice(0, 200)}…` : `Issue: ${issue}`);
  }
  parts.push('', adminReply.trim());
  return parts.join('\n');
}

/**
 * Admin: list support tickets with optional status filter.
 */
export async function listTickets(page: number, limit: number, status?: string) {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatar: true,
            hakaId: true,
            username: true,
          },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  const itemsWithScreenshots = await Promise.all(
    items.map(async (t) => {
      const storedUrls = ticketScreenshotUrls(t);
      const screenshotUrls = await Promise.all(
        storedUrls.map((url) => createSignedAssetUrl(url)),
      );
      return {
        ...t,
        screenshotUrls,
        hasScreenshot: storedUrls.length > 0,
        screenshotCount: storedUrls.length,
        /** @deprecated first image — use screenshotUrls */
        screenshotUrl: screenshotUrls[0] ?? '',
      };
    }),
  );

  return {
    items: itemsWithScreenshots,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin: reply to a support ticket.
 */
export async function replyTicket(ticketId: string, adminReply: string, adminId: string) {
  const existing = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!existing) throw new AppError('Support ticket not found', 404);

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      adminReply,
      status: 'replied',
      repliedAt: new Date(),
      repliedBy: adminId,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatar: true,
          hakaId: true,
        },
      },
    },
  });

  const dmContent = buildSupportReplyDmContent(existing.description, adminReply);

  await insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: existing.userId,
    content: dmContent,
    messageType: 'support_reply',
  });

  const pushPreview = adminReply.trim();
  const pushBody =
    pushPreview.length > 120 ? `${pushPreview.slice(0, 119)}…` : pushPreview;

  void notifyAccountAlert(
    existing.userId,
    'support_reply',
    'Support replied to your request',
    pushBody,
    {
      ticketId,
      senderId: getHakaTeamUserId(),
      messageType: 'support_reply',
      open: 'haka_team_dm',
    },
  ).catch(() => {});

  try {
    getIO().to(`user:${existing.userId}`).emit('support:ticket_replied', {
      ticketId,
      status: 'replied',
      adminReply: adminReply.trim(),
      repliedAt: updated.repliedAt,
    });
  } catch {
    /* Socket.io not initialised */
  }

  emitAdminDataChanged('support_tickets', { ticketId, status: 'replied' });

  return updated;
}

/**
 * Admin: stream ticket screenshot bytes (works for private Supabase buckets + local disk).
 */
export async function getTicketScreenshot(ticketId: string, index: number) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { screenshotUrl: true, screenshotUrls: true },
  });
  if (!ticket) throw new AppError('Support ticket not found', 404);

  const urls = ticketScreenshotUrls(ticket);
  const storedUrl = urls[index];
  if (!storedUrl) {
    throw new AppError('Screenshot not found', 404);
  }

  const asset = await readAssetBuffer(storedUrl);
  if (!asset) throw new AppError('Screenshot file not found', 404);
  return asset;
}

/**
 * Admin: close a support ticket.
 */
export async function closeTicket(ticketId: string) {
  const existing = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!existing) throw new AppError('Support ticket not found', 404);

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'closed' },
  });
}
