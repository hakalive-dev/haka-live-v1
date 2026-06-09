import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

const FAMILY_SELECT = {
  id: true,
  name: true,
  tier: true,
  badge: true,
  announcement: true,
  weeklyBeans: true,
  totalBeans: true,
  createdAt: true,
  owner: {
    select: { id: true, displayName: true, avatar: true, hakaId: true },
  },
  _count: { select: { members: true } },
};

/**
 * Create a new family. Owner is automatically added as 'owner' member.
 * A user can only own / belong to one family.
 */
export async function createFamily(ownerId: string, name: string, announcement = '') {
  // Check owner is not already in a family
  const existing = await prisma.familyMember.findUnique({ where: { userId: ownerId } });
  if (existing) throw new AppError('You are already in a family', 400);

  const trimmedName = name.trim();
  if (!trimmedName) throw new AppError('Family name is required');

  return prisma.$transaction(async (tx) => {
    const family = await tx.family.create({
      data: { name: trimmedName, ownerId, announcement },
    });
    await tx.familyMember.create({
      data: { familyId: family.id, userId: ownerId, role: 'owner' },
    });
    return family;
  });
}

/**
 * Get family by ID with member list.
 */
export async function getFamily(familyId: string) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      ...FAMILY_SELECT,
      members: {
        orderBy: { joinedAt: 'asc' },
        include: {
          user: { select: { id: true, displayName: true, avatar: true, hakaId: true, role: true } },
        },
      },
    },
  });
  if (!family) throw new AppError('Family not found', 404);
  return family;
}

/**
 * Get the family the authenticated user belongs to.
 */
export async function getMyFamily(userId: string) {
  const membership = await prisma.familyMember.findUnique({
    where: { userId },
    include: {
      family: {
        select: {
          ...FAMILY_SELECT,
          members: {
            orderBy: { joinedAt: 'asc' },
            include: {
              user: { select: { id: true, displayName: true, avatar: true, hakaId: true, role: true } },
            },
          },
        },
      },
    },
  });
  if (!membership) throw new AppError('You are not in a family', 404);
  return membership.family;
}

/**
 * Join a family by ID. Must not already be in a family.
 */
export async function joinFamily(userId: string, familyId: string) {
  const existing = await prisma.familyMember.findUnique({ where: { userId } });
  if (existing) throw new AppError('You are already in a family', 400);

  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new AppError('Family not found', 404);

  return prisma.familyMember.create({
    data: { familyId, userId, role: 'member' },
    include: {
      family: { select: FAMILY_SELECT },
    },
  });
}

/**
 * Leave a family. Owner cannot leave — must transfer ownership or disband.
 */
export async function leaveFamily(userId: string) {
  const membership = await prisma.familyMember.findUnique({ where: { userId } });
  if (!membership) throw new AppError('You are not in a family', 404);
  if (membership.role === 'owner') throw new AppError('Owner cannot leave — disband or transfer ownership first', 400);

  await prisma.familyMember.delete({ where: { userId } });
  return { success: true };
}

/**
 * Disband family. Only owner can disband. Cascades to delete all members.
 */
export async function disbandFamily(userId: string) {
  const membership = await prisma.familyMember.findUnique({ where: { userId } });
  if (!membership || membership.role !== 'owner') throw new AppError('Only the family owner can disband the family', 403);

  await prisma.family.delete({ where: { id: membership.familyId } });
  return { success: true };
}

/**
 * Promote a member to admin. Only owner can promote.
 */
export async function promoteMember(ownerId: string, targetUserId: string) {
  const ownerMembership = await prisma.familyMember.findUnique({ where: { userId: ownerId } });
  if (!ownerMembership || ownerMembership.role !== 'owner') throw new AppError('Only the family owner can promote members', 403);

  const targetMembership = await prisma.familyMember.findUnique({ where: { userId: targetUserId } });
  if (!targetMembership || targetMembership.familyId !== ownerMembership.familyId) {
    throw new AppError('Target user is not in your family', 404);
  }
  if (targetMembership.role === 'owner') throw new AppError('Cannot change owner role', 400);

  return prisma.familyMember.update({
    where: { userId: targetUserId },
    data: { role: 'admin' },
  });
}

/**
 * Kick a member. Owner/admin can kick members; only owner can kick admins.
 */
export async function kickMember(actorId: string, targetUserId: string) {
  const actorMembership = await prisma.familyMember.findUnique({ where: { userId: actorId } });
  if (!actorMembership || actorMembership.role === 'member') {
    throw new AppError('You do not have permission to kick members', 403);
  }

  const targetMembership = await prisma.familyMember.findUnique({ where: { userId: targetUserId } });
  if (!targetMembership || targetMembership.familyId !== actorMembership.familyId) {
    throw new AppError('Target user is not in your family', 404);
  }
  if (targetMembership.role === 'owner') throw new AppError('Cannot kick the owner', 400);
  if (targetMembership.role === 'admin' && actorMembership.role !== 'owner') {
    throw new AppError('Only the owner can kick admins', 403);
  }

  await prisma.familyMember.delete({ where: { userId: targetUserId } });
  return { success: true };
}

/**
 * Update family info. Owner or admin can update announcement. Only owner can rename.
 */
export async function updateFamily(
  userId: string,
  data: { name?: string; announcement?: string; badge?: string },
) {
  const membership = await prisma.familyMember.findUnique({ where: { userId } });
  if (!membership || membership.role === 'member') throw new AppError('Insufficient permissions', 403);

  if (data.name && membership.role !== 'owner') throw new AppError('Only the owner can rename the family', 403);

  return prisma.family.update({
    where: { id: membership.familyId },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.announcement !== undefined ? { announcement: data.announcement } : {}),
      ...(data.badge !== undefined ? { badge: data.badge } : {}),
    },
    select: FAMILY_SELECT,
  });
}

/**
 * List families ordered by weeklyBeans (for discovery / leaderboard).
 */
export async function listFamilies(page: number, limit: number, search?: string) {
  const where = search
    ? { name: { contains: search, mode: 'insensitive' as const } }
    : {};

  const [items, total] = await Promise.all([
    prisma.family.findMany({
      where,
      select: FAMILY_SELECT,
      orderBy: { weeklyBeans: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.family.count({ where }),
  ]);

  return { items, total, page, limit, hasMore: page * limit < total };
}

/**
 * Add beans to a family (called when a family member receives beans).
 * Updates weeklyBeans and totalBeans, then recalculates tier.
 */
export async function addBeansToFamily(familyId: string, beans: number) {
  const family = await prisma.family.update({
    where: { id: familyId },
    data: {
      weeklyBeans: { increment: beans },
      totalBeans:  { increment: beans },
    },
  });

  // Recalculate tier based on leaderboard position
  const rank = await prisma.family.count({
    where: { weeklyBeans: { gt: family.weeklyBeans } },
  });

  let tier = 'bronze';
  if (rank < 10) tier = 'gold';
  else if (rank < 50) tier = 'silver';

  if (tier !== family.tier) {
    await prisma.family.update({ where: { id: familyId }, data: { tier } });
  }
}
