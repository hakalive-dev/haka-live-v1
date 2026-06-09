import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

/** In-app super admin power (UserSettings.superAdminPower) — distinct from AdminTag. */
export async function hasSuperAdminPower(userId: string): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { superAdminPower: true },
  });
  return settings?.superAdminPower ?? false;
}

/**
 * Throws 403 if actor may not kick/mute/ban/block the target.
 * Combines super-admin-power rules with staff tag hierarchy (cs-privilege).
 */
export async function assertCanModerateTarget(actorUserId: string, targetUserId: string): Promise<void> {
  if (actorUserId === targetUserId) return;

  const [actorPower, targetPower] = await Promise.all([
    hasSuperAdminPower(actorUserId),
    hasSuperAdminPower(targetUserId),
  ]);

  if (targetPower && !actorPower) {
    throw new AppError('You cannot moderate this user (super admin power).', 403);
  }
  if (targetPower && actorPower) {
    throw new AppError('You cannot moderate this user (super admin power).', 403);
  }

  const { assertCanModerate } = await import('./cs-privilege');
  await assertCanModerate(actorUserId, targetUserId);
}

/** Super admin power users bypass host/room-admin requirement for moderation actions. */
export async function assertRoomModerationActor(
  room: { id: string; hostId: string },
  actorUserId: string,
): Promise<void> {
  if (await hasSuperAdminPower(actorUserId)) return;
  if (room.hostId === actorUserId) return;
  const admin = await prisma.roomAdmin.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: actorUserId } },
  });
  if (!admin) throw new AppError('Only the room host or admin can do this', 403);
}
