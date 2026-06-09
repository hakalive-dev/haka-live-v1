import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';

/**
 * Tag helpers. A user's "tags" confer admin-panel capabilities on their
 * regular account (no separate AdminUser row needed).
 */

export type TagSummaryDto = {
  name: string;
  displayName: string;
  color: string;
  iconUrl: string;
  sortOrder: number;
};

/** Prisma include for user tags — ordered by admin catalogue `sortOrder`, then name. */
export const userTagsOrderedInclude = {
  include: { tag: true },
  orderBy: { tag: { sortOrder: 'asc' as const } },
} satisfies Prisma.UserTagFindManyArgs;

type UserTagWithTag = {
  tag: {
    name: string;
    displayName: string;
    color: string;
    iconUrl: string;
    sortOrder: number;
  };
};

/** Map assigned tags to API summaries in display order (matches tag-icons / admin catalogue). */
export function mapSortedUserTags(rows: UserTagWithTag[]): TagSummaryDto[] {
  return rows
    .map((r) => ({
      name: r.tag.name,
      displayName: r.tag.displayName,
      color: r.tag.color,
      iconUrl: r.tag.iconUrl,
      sortOrder: r.tag.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function getUserTagNames(userId: string): Promise<string[]> {
  const rows = await prisma.userTag.findMany({
    where: { userId },
    include: { tag: { select: { name: true } } },
  });
  return rows.map((r) => r.tag.name);
}

export async function userHasTag(userId: string, tagName: string): Promise<boolean> {
  const names = await getUserTagNames(userId);
  return names.includes(tagName);
}

export async function isCS(userId: string): Promise<boolean> {
  return userHasTag(userId, 'cs');
}

/**
 * Permission lookup: returns true if any of the user's tags grants the
 * requested permission (super_admin's '*' wildcard is honoured).
 */
export async function userHasPermission(
  userId: string,
  permission: string,
): Promise<boolean> {
  const tags = await prisma.userTag.findMany({
    where: { userId },
    include: { tag: { select: { permissions: true } } },
  });
  for (const t of tags) {
    const perms = t.tag.permissions;
    if (perms.includes('*') || perms.includes(permission)) return true;
  }
  return false;
}
