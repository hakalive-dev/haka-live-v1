import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { getIO } from '../../../sockets';

/**
 * Tell a connected user to refresh their profile after a tag change, WITHOUT
 * logging them out. Tags aren't baked into the JWT and permissions are checked
 * per-request against the DB, so a re-login is unnecessary — the client just
 * refetches /auth/me to pick up the new badges/permissions. The client handles
 * `user:profile_updated` in useUserSocket.ts.
 */
function notifyProfileUpdated(userId: string): void {
  try {
    getIO().to(`user:${userId}`).emit('user:profile_updated', { reason: 'tags_changed' });
  } catch {
    // Socket.io not initialized (e.g. inside a test or seed script) — ignore.
  }
}

export async function listTags() {
  return prisma.adminTag.findMany({ orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }] });
}

export async function createTag(
  adminId: string,
  name: string,
  displayName: string,
  color: string,
  iconUrl: string,
  permissions: string[],
  ipAddress?: string,
) {
  const existing = await prisma.adminTag.findUnique({ where: { name } });
  if (existing) throw new AppError('Tag with that name already exists', 409);

  const tag = await prisma.adminTag.create({
    data: { name, displayName, color, iconUrl, permissions, isBuiltIn: false },
  });
  await logAdminAction(adminId, 'tag.create', 'AdminTag', tag.id, { name }, ipAddress);
  return tag;
}

export async function updateTag(
  adminId: string,
  id: string,
  data: { displayName?: string; color?: string; iconUrl?: string; permissions?: string[] },
  ipAddress?: string,
) {
  const tag = await prisma.adminTag.findUnique({ where: { id } });
  if (!tag) throw new AppError('Tag not found', 404);
  const updated = await prisma.adminTag.update({ where: { id }, data });
  await logAdminAction(adminId, 'tag.update', 'AdminTag', id, data, ipAddress);
  return updated;
}

export async function deleteTag(adminId: string, id: string, ipAddress?: string) {
  const tag = await prisma.adminTag.findUnique({ where: { id } });
  if (!tag) throw new AppError('Tag not found', 404);
  if (tag.isBuiltIn) throw new AppError('Cannot delete a built-in tag', 400);
  await prisma.adminTag.delete({ where: { id } });
  await logAdminAction(adminId, 'tag.delete', 'AdminTag', id, { name: tag.name }, ipAddress);
  return { deleted: true };
}

// ── User ↔ Tag assignment ────────────────────────────────────────────────────

export async function listUserTags(userId: string) {
  return prisma.userTag.findMany({
    where: { userId },
    include: {
      tag: true,
      assigner: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function assignTag(
  adminId: string,
  userId: string,
  tagId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  const tag = await prisma.adminTag.findUnique({ where: { id: tagId } });
  if (!tag) throw new AppError('Tag not found', 404);

  const existing = await prisma.userTag.findUnique({
    where: { userId_tagId: { userId, tagId } },
  });
  if (existing) throw new AppError('User already has this tag', 409);

  const row = await prisma.userTag.create({
    data: { userId, tagId, assignedBy: adminId },
    include: {
      tag: true,
      assigner: { select: { id: true, displayName: true } },
    },
  });

  // Push a live profile refresh so the client picks up the new tag without
  // being logged out.
  notifyProfileUpdated(userId);
  await logAdminAction(adminId, 'user.tag_assign', 'User', userId, { tag: tag.name }, ipAddress);
  return row;
}

export async function bulkAssignTags(
  adminId: string,
  userIds: string[],
  tagId: string,
  ipAddress?: string,
) {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) throw new AppError('At least one user is required', 400);

  const tag = await prisma.adminTag.findUnique({ where: { id: tagId } });
  if (!tag) throw new AppError('Tag not found', 404);

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true },
  });
  if (users.length !== uniqueUserIds.length) {
    throw new AppError('One or more users were not found', 404);
  }

  const assignedRows = await prisma.$transaction(async tx => {
    await tx.userTag.createMany({
      data: uniqueUserIds.map(userId => ({ userId, tagId, assignedBy: adminId })),
      skipDuplicates: true,
    });

    return tx.userTag.findMany({
      where: { userId: { in: uniqueUserIds }, tagId },
      include: {
        tag: true,
        assigner: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  uniqueUserIds.forEach(notifyProfileUpdated);
  await Promise.all(uniqueUserIds.map(userId =>
    logAdminAction(adminId, 'user.tag_assign', 'User', userId, { tag: tag.name, bulk: true }, ipAddress),
  ));

  return { assignedCount: assignedRows.length, usersTouched: uniqueUserIds.length, items: assignedRows };
}

export async function revokeTag(
  adminId: string,
  userId: string,
  tagId: string,
  ipAddress?: string,
) {
  const existing = await prisma.userTag.findUnique({
    where: { userId_tagId: { userId, tagId } },
    include: { tag: true },
  });
  if (!existing) throw new AppError('User does not have this tag', 404);

  await prisma.userTag.delete({ where: { id: existing.id } });
  // Revoked permissions take effect immediately (checked per-request in the DB);
  // just refresh the client's profile instead of forcing a logout.
  notifyProfileUpdated(userId);
  await logAdminAction(adminId, 'user.tag_revoke', 'User', userId, { tag: existing.tag.name }, ipAddress);
  return { revoked: true };
}
