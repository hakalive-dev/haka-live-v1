import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

export const blocklistService = {
  async list(userId: string) {
    const rows = await prisma.blockedUser.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        target: {
          select: { id: true, displayName: true, avatar: true, hakaId: true },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      blocked_id: r.targetId,
      displayName: r.target.displayName,
      avatar: r.target.avatar || null,
      hakaId: r.target.hakaId ?? '',
      created_at: r.createdAt.toISOString(),
    }));
  },

  async block(actorId: string, targetId: string) {
    if (actorId === targetId) throw new AppError('You cannot block yourself.', 400);
    const { hasSuperAdminPower } = await import('../moderation/super-admin-power');
    if (await hasSuperAdminPower(targetId)) {
      throw new AppError('You cannot block this user.', 403);
    }
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, displayName: true, avatar: true, hakaId: true },
    });
    if (!target) throw new AppError('User not found.', 404);
    const row = await prisma.blockedUser.upsert({
      where: { actorId_targetId: { actorId, targetId } },
      create: { actorId, targetId },
      update: {},
    });
    return {
      id: row.id,
      blocked_id: target.id,
      displayName: target.displayName,
      avatar: target.avatar || null,
      hakaId: target.hakaId ?? '',
      created_at: row.createdAt.toISOString(),
    };
  },

  async unblock(actorId: string, targetId: string) {
    await prisma.blockedUser
      .delete({ where: { actorId_targetId: { actorId, targetId } } })
      .catch(() => undefined);
  },

  async isBlocked(actorId: string, targetId: string) {
    const row = await prisma.blockedUser.findUnique({
      where: { actorId_targetId: { actorId, targetId } },
    });
    return !!row;
  },
};
