import { getUserTagNames } from './tags.service';
import { AppError } from '../../middleware/error.middleware';

/**
 * CS-privilege rules.
 *
 * - CS (Customer Service) users are protected: they cannot be kicked, muted,
 *   or room-banned by anyone *below* super_admin.
 * - CS themselves may kick/mute anyone except super_admin and other CS.
 *
 * `actorUserId` is the user invoking the action (host, room admin, or another
 * staff member). `targetUserId` is whose session is being affected.
 */

const RANK: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  cs: 60,
  moderator: 40,
  assistant: 20,
  operator: 20,
  bdm: 10,
  bd: 10,
};

function topRank(tags: string[]): number {
  return tags.reduce((max, t) => Math.max(max, RANK[t] ?? 0), 0);
}

/**
 * Throws 403 if `actor` is not allowed to take a kick/mute/room-ban action
 * against `target`.
 */
export async function assertCanModerate(actorUserId: string, targetUserId: string): Promise<void> {
  if (actorUserId === targetUserId) return; // acting on self is fine

  const [actorTags, targetTags] = await Promise.all([
    getUserTagNames(actorUserId),
    getUserTagNames(targetUserId),
  ]);

  const actorRank = topRank(actorTags);
  const targetRank = topRank(targetTags);

  // A target with *any* staff tag can only be moderated by a strictly
  // higher-ranked actor. This automatically protects CS from hosts/moderators.
  if (targetRank > 0 && actorRank <= targetRank) {
    throw new AppError('You cannot moderate this user (protected tag).', 403);
  }
}
