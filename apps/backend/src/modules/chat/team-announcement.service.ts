import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { getIO } from '../../sockets';
import { sendFcmToTopic } from '../notifications/notifications.service';

export const TEAM_ANNOUNCEMENT_SOCKET_EVENT = 'team_announcement_updated';

function previewBody(body: string, max = 160): string {
  const t = body.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export async function getLatestTeamAnnouncementForUser(userId: string) {
  const latest = await prisma.teamAnnouncement.findFirst({
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  if (!latest) {
    return { announcement: null as null };
  }

  const read = await prisma.teamAnnouncementRead.findUnique({
    where: {
      userId_announcementId: { userId, announcementId: latest.id },
    },
    select: { readAt: true },
  });

  return {
    announcement: {
      id: latest.id,
      title: latest.title,
      body: latest.body,
      preview: previewBody(latest.body),
      publishedAt: latest.publishedAt.toISOString(),
      updatedAt: latest.updatedAt.toISOString(),
      isRead: !!read,
    },
  };
}

export async function markTeamAnnouncementRead(userId: string, announcementId: string) {
  await prisma.teamAnnouncementRead.upsert({
    where: {
      userId_announcementId: { userId, announcementId },
    },
    create: { userId, announcementId },
    update: { readAt: new Date() },
  });
  return { ok: true as const };
}

export async function publishTeamAnnouncement(opts: {
  title: string;
  body: string;
  adminId: string | null;
}) {
  const row = await prisma.teamAnnouncement.create({
    data: {
      title: opts.title.trim(),
      body: opts.body.trim(),
      createdByAdminId: opts.adminId,
    },
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  const payload = {
    announcementId: row.id,
    title: row.title,
    preview: previewBody(row.body),
    publishedAt: row.publishedAt.toISOString(),
  };

  try {
    getIO().emit(TEAM_ANNOUNCEMENT_SOCKET_EVENT, payload);
  } catch {
    /* tests */
  }

  void sendFcmToTopic(env.FCM_TEAM_ANNOUNCEMENTS_TOPIC, {
    title: row.title,
    body: previewBody(row.body, 200),
    data: {
      type: 'team_announcement',
      announcementId: row.id,
    },
  }).catch(() => {});

  return row;
}

export async function listTeamAnnouncements(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.teamAnnouncement.findMany({
      orderBy: { publishedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        createdByAdmin: { select: { id: true, email: true, displayName: true } },
      },
    }),
    prisma.teamAnnouncement.count(),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
  };
}
