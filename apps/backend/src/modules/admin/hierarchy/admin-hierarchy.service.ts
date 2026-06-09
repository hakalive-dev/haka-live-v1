import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { BD_TIER_ROLES, hasBdRole, rolesOf, ADMIN_ROLES } from '../../../shared-types/roles';
import { Period, periodWindow, agencyRevenueBeans } from '../metrics/staff-metrics';
import { logAdminAction } from '../../../utils/audit';
import { emitAdminManagementChanged } from '../../../sockets/admin-realtime';

/** Agencies counted under a regional admin: BD-owned, direct bdId, or explicit assignment. */
async function agenciesForAdminRollup(adminId: string, bdIds: string[]) {
  const [bdLinked, directLinked, assigned] = await Promise.all([
    bdIds.length
      ? prisma.agency.findMany({
          where: { bdId: { in: bdIds }, deletedAt: null },
          select: { id: true },
        })
      : Promise.resolve([]),
    prisma.agency.findMany({
      where: { bdId: adminId, deletedAt: null },
      select: { id: true },
    }),
    prisma.adminAgencyAssignment.findMany({
      where: { adminId },
      select: { agencyId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const a of bdLinked) ids.add(a.id);
  for (const a of directLinked) ids.add(a.id);
  for (const a of assigned) ids.add(a.agencyId);
  return Array.from(ids, (id) => ({ id }));
}

export async function listAdminsWithRollup(period: Period = 'month') {
  const admins = await prisma.adminUser.findMany({ where: { roles: { has: 'admin' } }, orderBy: { createdAt: 'desc' } });
  const { start, end } = periodWindow(period);

  const items = await Promise.all(admins.map(async (admin) => {
    const bds = await prisma.adminUser.findMany({
      where: { managerId: admin.id, roles: { hasSome: BD_TIER_ROLES } }, select: { id: true },
    });
    const bdIds = bds.map(b => b.id);
    const agencies = await agenciesForAdminRollup(admin.id, bdIds);
    let revenue = 0n;
    for (const a of agencies) revenue += await agencyRevenueBeans(a.id, start, end);
    const newBds = await prisma.adminUser.count({
      where: { managerId: admin.id, roles: { hasSome: BD_TIER_ROLES }, createdAt: { gte: start, lt: end } },
    });
    return {
      id: admin.id, displayName: admin.displayName, email: admin.email, region: admin.region,
      isActive: admin.isActive, bdCount: bds.length, agencyCount: agencies.length,
      revenue: revenue.toString(), newBds, createdAt: admin.createdAt,
    };
  }));
  return { items, total: items.length };
}

export async function transferBdBetweenAdmins(bdId: string, toAdminId: string) {
  const bd = await prisma.adminUser.findUnique({ where: { id: bdId } });
  if (!bd || !hasBdRole(rolesOf(bd))) throw new AppError('BD not found', 404);
  const admin = await prisma.adminUser.findUnique({ where: { id: toAdminId } });
  if (!admin || !rolesOf(admin).includes(ADMIN_ROLES.ADMIN)) throw new AppError('Target is not an admin', 400);
  await prisma.adminUser.update({ where: { id: bdId }, data: { managerId: toAdminId } });
  emitAdminManagementChanged({ bdId, fromAdminId: bd.managerId, toAdminId });
  return { bdId, toAdminId };
}

export async function assignBdToAdmin(bdId: string, adminId: string) {
  return transferBdBetweenAdmins(bdId, adminId);
}

function normalizeCountryCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function getWithdrawalFreeze(targetAdminId: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: targetAdminId },
    select: { id: true, displayName: true, region: true },
  });
  if (!admin) throw new AppError('Admin not found', 404);

  const countryCode = admin.region ? normalizeCountryCode(admin.region) : '';
  if (!countryCode) {
    return { adminId: admin.id, countryCode: '', isFrozen: false, reason: '', updatedAt: null };
  }

  const row = await prisma.adminWithdrawalFreeze.findUnique({
    where: { countryCode },
  });

  return {
    adminId: admin.id,
    countryCode,
    isFrozen: row?.isFrozen ?? false,
    reason: row?.reason ?? '',
    updatedAt: row?.updatedAt ?? null,
    frozenByAdminId: row?.adminId ?? null,
  };
}

export async function setWithdrawalFreeze(
  actorAdminId: string,
  targetAdminId: string,
  input: { isFrozen: boolean; reason?: string; countryCode?: string },
) {
  const target = await prisma.adminUser.findUnique({
    where: { id: targetAdminId },
    select: { id: true, displayName: true, region: true },
  });
  if (!target) throw new AppError('Admin not found', 404);

  const countryCode = normalizeCountryCode(input.countryCode || target.region || '');
  if (!countryCode) throw new AppError('Admin region/countryCode is required to freeze withdrawals', 400);

  const row = await prisma.adminWithdrawalFreeze.upsert({
    where: { countryCode },
    update: {
      adminId: target.id,
      isFrozen: input.isFrozen,
      reason: input.reason ?? '',
    },
    create: {
      adminId: target.id,
      countryCode,
      isFrozen: input.isFrozen,
      reason: input.reason ?? '',
    },
  });

  await logAdminAction(
    actorAdminId,
    input.isFrozen ? 'admin.freeze_withdrawals' : 'admin.unfreeze_withdrawals',
    'Country',
    countryCode,
    { targetAdminId: target.id, freezeOwnerAdminId: row.adminId, reason: row.reason },
  );

  return {
    countryCode: row.countryCode,
    isFrozen: row.isFrozen,
    reason: row.reason,
    updatedAt: row.updatedAt,
  };
}

export async function transferAgenciesBetweenAdmins(
  actorAdminId: string,
  input: { fromAdminId: string; toAdminId: string; agencyIds?: string[] },
) {
  if (input.fromAdminId === input.toAdminId) {
    throw new AppError('fromAdminId and toAdminId must be different', 400);
  }

  const [fromAdmin, toAdmin] = await Promise.all([
    prisma.adminUser.findUnique({ where: { id: input.fromAdminId }, select: { id: true, displayName: true } }),
    prisma.adminUser.findUnique({ where: { id: input.toAdminId }, select: { id: true, displayName: true } }),
  ]);
  if (!fromAdmin) throw new AppError('From admin not found', 404);
  if (!toAdmin) throw new AppError('To admin not found', 404);

  const where = {
    adminId: input.fromAdminId,
    ...(input.agencyIds?.length ? { agencyId: { in: input.agencyIds } } : {}),
  } as const;

  const assignments = await prisma.adminAgencyAssignment.findMany({
    where,
    select: { agencyId: true },
  });
  const agencyIds = assignments.map(a => a.agencyId);

  if (agencyIds.length === 0) {
    return { transferred: 0, skipped: 0 };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Create new assignments (skip duplicates), then remove old ones.
    const created = await tx.adminAgencyAssignment.createMany({
      data: agencyIds.map(agencyId => ({ agencyId, adminId: input.toAdminId })),
      skipDuplicates: true,
    });

    const deleted = await tx.adminAgencyAssignment.deleteMany({
      where: { adminId: input.fromAdminId, agencyId: { in: agencyIds } },
    });

    return { created: created.count, deleted: deleted.count };
  });

  const skipped = agencyIds.length - result.created;

  await logAdminAction(
    actorAdminId,
    'admin.transfer_agencies',
    'AdminUser',
    `${input.fromAdminId}->${input.toAdminId}`,
    { agencyCount: agencyIds.length, transferred: result.created, skipped, agencyIds },
  );

  emitAdminManagementChanged({
    fromAdminId: input.fromAdminId,
    toAdminId: input.toAdminId,
    agencyCount: agencyIds.length,
  });

  return {
    fromAdminId: input.fromAdminId,
    toAdminId: input.toAdminId,
    agencyCount: agencyIds.length,
    transferred: result.created,
    skipped,
  };
}
