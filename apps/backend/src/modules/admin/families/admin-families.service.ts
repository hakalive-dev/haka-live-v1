import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListFamiliesParams {
  page: number;
  limit: number;
  search?: string;
  tier?: string;
}

export interface UpdateFamilyData {
  name?: string;
  tier?: string;
  badge?: string;
  announcement?: string;
}

// ── Service ────────────────────────────────────────────────────────────────────

export async function listFamilies(params: ListFamiliesParams) {
  const { page, limit, search, tier } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (tier) {
    where.tier = tier;
  }

  const [families, total] = await Promise.all([
    prisma.family.findMany({
      where,
      skip,
      take: limit,
      orderBy: { totalBeans: 'desc' },
      include: {
        owner: {
          select: { id: true, username: true, hakaId: true },
        },
        _count: {
          select: { members: true },
        },
      },
    }),
    prisma.family.count({ where }),
  ]);

  return {
    families,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getFamilyDetail(id: string) {
  const family = await prisma.family.findUnique({
    where: { id },
    include: {
      owner: {
        select: { id: true, username: true, hakaId: true, avatar: true },
      },
      members: {
        include: {
          user: {
            select: { id: true, username: true, hakaId: true, avatar: true },
          },
        },
      },
    },
  });

  if (!family) throw new AppError('Family not found', 404);
  return family;
}

export async function updateFamily(
  id: string,
  data: UpdateFamilyData,
  adminId: string,
  ip?: string,
) {
  const family = await prisma.family.findUnique({ where: { id } });
  if (!family) throw new AppError('Family not found', 404);

  const updated = await prisma.family.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.tier !== undefined && { tier: data.tier }),
      ...(data.badge !== undefined && { badge: data.badge }),
      ...(data.announcement !== undefined && { announcement: data.announcement }),
    },
  });

  await logAdminAction(adminId, 'family.update', 'Family', id, { fields: Object.keys(data) }, ip);
  return updated;
}

export async function removeFamily(id: string, adminId: string, ip?: string) {
  const family = await prisma.family.findUnique({ where: { id } });
  if (!family) throw new AppError('Family not found', 404);

  await prisma.family.delete({ where: { id } });
  await logAdminAction(adminId, 'family.delete', 'Family', id, { name: family.name }, ip);
}

export async function removeFamilyMember(
  familyId: string,
  userId: string,
  adminId: string,
  ip?: string,
) {
  const member = await prisma.familyMember.findFirst({
    where: { familyId, userId },
  });

  if (!member) throw new AppError('Family member not found', 404);
  if (member.role === 'owner') throw new AppError('Cannot remove the family owner', 400);

  await prisma.familyMember.delete({ where: { id: member.id } });
  await logAdminAction(
    adminId,
    'family.remove_member',
    'FamilyMember',
    member.id,
    { familyId, userId },
    ip,
  );
}
