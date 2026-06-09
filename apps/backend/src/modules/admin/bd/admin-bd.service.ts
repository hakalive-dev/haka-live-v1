import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import {
  ADMIN_ROLES,
  BD_TIER_ROLES,
  isJuniorBdRole,
  isSeniorBdRole,
  hasSeniorBdRole,
  hasBdRole,
  rolesOf,
} from '../../../shared-types/roles';
import { resolveOrCreateAppUser, ResolveAppUserInput } from '../../../utils/appUser';
import * as adminAuthService from '../auth/admin-auth.service';
import { logAdminAction } from '../../../utils/audit';
import {
  Period, periodWindow, growthPct,
  agencyRevenueBeans, agencyTurnoverCoins, agencyReceivingBeans,
} from '../metrics/staff-metrics';
import { emitAdminManagementChanged } from '../../../sockets/admin-realtime';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'none';

function riskLevelFromSeverities(sevs: string[]): RiskLevel {
  const set = new Set(sevs);
  if (set.has('critical')) return 'critical';
  if (set.has('high')) return 'high';
  if (set.has('medium')) return 'medium';
  if (set.has('low')) return 'low';
  return 'none';
}

export async function listBds(params: { region?: string; managerId?: string; period?: Period } = {}) {
  const where: any = { roles: { hasSome: BD_TIER_ROLES } };
  if (params.region) where.region = params.region;
  if (params.managerId) where.managerId = params.managerId;

  const period: Period = params.period ?? 'month';
  const { start, end, prevStart, prevEnd } = periodWindow(period);

  const bds = await prisma.adminUser.findMany({ where, orderBy: { createdAt: 'desc' } });
  if (bds.length === 0) return { items: [], total: 0 };

  const bdIds = bds.map(b => b.id);

  const agencies = await prisma.agency.findMany({
    where: { bdId: { in: bdIds } },
    select: { id: true, bdId: true, ownerId: true },
  });

  const agenciesByBdId = new Map<string, { agencyIds: string[]; ownerIds: string[] }>();
  for (const bdId of bdIds) agenciesByBdId.set(bdId, { agencyIds: [], ownerIds: [] });
  for (const a of agencies) {
    if (!a.bdId) continue;
    const entry = agenciesByBdId.get(a.bdId) ?? { agencyIds: [], ownerIds: [] };
    entry.agencyIds.push(a.id);
    entry.ownerIds.push(a.ownerId);
    agenciesByBdId.set(a.bdId, entry);
  }

  const allAgencyIds = agencies.map(a => a.id);
  const allOwnerIds = agencies.map(a => a.ownerId);

  const [
    revenueCurRows,
    revenuePrevRows,
    activeHostsByAgent,
    invitationRows,
    riskRows,
    withdrawalRows,
  ] = await Promise.all([
    allAgencyIds.length === 0
      ? Promise.resolve([])
      : prisma.giftCommissionLedger.groupBy({
          by: ['agencyId'],
          _sum: { amount: true },
          where: { agencyId: { in: allAgencyIds }, userId: null, createdAt: { gte: start, lt: end } },
        }),
    allAgencyIds.length === 0
      ? Promise.resolve([])
      : prisma.giftCommissionLedger.groupBy({
          by: ['agencyId'],
          _sum: { amount: true },
          where: { agencyId: { in: allAgencyIds }, userId: null, createdAt: { gte: prevStart, lt: prevEnd } },
        }),
    allOwnerIds.length === 0
      ? Promise.resolve([])
      : prisma.user.groupBy({
          by: ['agentId'],
          _count: { _all: true },
          where: { agentId: { in: allOwnerIds }, role: 'host', isActive: true },
        }),
    prisma.agencyInvitation.findMany({
      where: { createdAt: { gte: start, lt: end }, fromAgency: { bdId: { in: bdIds } } },
      select: { status: true, fromAgency: { select: { bdId: true } } },
    }),
    allOwnerIds.length === 0
      ? Promise.resolve([])
      : prisma.accountRisk.findMany({
          where: { isActive: true, user: { agentId: { in: allOwnerIds } } },
          select: { severity: true, user: { select: { agentId: true } } },
        }),
    allOwnerIds.length === 0
      ? Promise.resolve([])
      : prisma.withdrawalRequest.findMany({
          where: { createdAt: { gte: start, lt: end }, user: { agentId: { in: allOwnerIds } } },
          select: { beansAmount: true, user: { select: { agentId: true } } },
        }),
  ]);

  const revenueCurByAgencyId = new Map<string, bigint>();
  for (const r of revenueCurRows as any[]) {
    if (!r.agencyId) continue;
    revenueCurByAgencyId.set(r.agencyId as string, (r._sum?.amount as bigint | null) ?? 0n);
  }
  const revenuePrevByAgencyId = new Map<string, bigint>();
  for (const r of revenuePrevRows as any[]) {
    if (!r.agencyId) continue;
    revenuePrevByAgencyId.set(r.agencyId as string, (r._sum?.amount as bigint | null) ?? 0n);
  }

  const activeHostCountByOwnerId = new Map<string, number>();
  for (const row of activeHostsByAgent as any[]) {
    const k = row.agentId as string | null;
    if (!k) continue;
    activeHostCountByOwnerId.set(k, Number(row._count?._all ?? 0));
  }

  const invitationStatsByBdId = new Map<string, { total: number; approved: number }>();
  for (const bdId of bdIds) invitationStatsByBdId.set(bdId, { total: 0, approved: 0 });
  for (const inv of invitationRows) {
    const bdId = inv.fromAgency?.bdId;
    if (!bdId) continue;
    const cur = invitationStatsByBdId.get(bdId) ?? { total: 0, approved: 0 };
    cur.total += 1;
    if (inv.status === 'approved') cur.approved += 1;
    invitationStatsByBdId.set(bdId, cur);
  }

  const riskSeveritiesByOwnerId = new Map<string, Set<string>>();
  for (const rr of riskRows as any[]) {
    const ownerId = rr?.user?.agentId as string | null;
    if (!ownerId) continue;
    const set = riskSeveritiesByOwnerId.get(ownerId) ?? new Set<string>();
    if (rr.severity) set.add(String(rr.severity));
    riskSeveritiesByOwnerId.set(ownerId, set);
  }

  const withdrawalsBeansByOwnerId = new Map<string, bigint>();
  for (const wr of withdrawalRows as any[]) {
    const ownerId = wr?.user?.agentId as string | null;
    if (!ownerId) continue;
    const prev = withdrawalsBeansByOwnerId.get(ownerId) ?? 0n;
    withdrawalsBeansByOwnerId.set(ownerId, prev + ((wr.beansAmount as bigint) ?? 0n));
  }

  const items = bds.map((bd) => {
    const entry = agenciesByBdId.get(bd.id) ?? { agencyIds: [], ownerIds: [] };

    let revenueCur = 0n;
    let revenuePrev = 0n;
    for (const agencyId of entry.agencyIds) {
      revenueCur += revenueCurByAgencyId.get(agencyId) ?? 0n;
      revenuePrev += revenuePrevByAgencyId.get(agencyId) ?? 0n;
    }

    let activeHosts = 0;
    let withdrawalsBeans = 0n;
    const allSevs: string[] = [];
    for (const ownerId of entry.ownerIds) {
      activeHosts += activeHostCountByOwnerId.get(ownerId) ?? 0;
      withdrawalsBeans += withdrawalsBeansByOwnerId.get(ownerId) ?? 0n;
      const sevs = riskSeveritiesByOwnerId.get(ownerId);
      if (sevs) allSevs.push(...Array.from(sevs));
    }

    const inv = invitationStatsByBdId.get(bd.id) ?? { total: 0, approved: 0 };
    const conversionRatePct = inv.total > 0 ? Math.round((inv.approved / inv.total) * 1000) / 10 : null;

    return {
      id: bd.id,
      hakaId: bd.hakaId,
      displayName: bd.displayName,
      email: bd.email,
      role: bd.role,
      roles: bd.roles?.length ? bd.roles : [bd.role],
      region: bd.region,
      managerId: bd.managerId,
      isActive: bd.isActive,
      lastLoginAt: bd.lastLoginAt,
      createdAt: bd.createdAt,

      period,
      agencyCount: entry.agencyIds.length,
      activeHosts,
      revenue: revenueCur.toString(),
      revenueGrowthPct: growthPct(revenueCur, revenuePrev),
      withdrawals: withdrawalsBeans.toString(),
      conversionRatePct,
      riskLevel: riskLevelFromSeverities(allSevs),
    };
  });

  return { items, total: items.length };
}

export async function getBdDetail(bdId: string, period: Period = 'month') {
  const bd = await prisma.adminUser.findUnique({ where: { id: bdId } });
  if (!bd || !hasBdRole(rolesOf(bd))) throw new AppError('BD not found', 404);

  const agencies = await prisma.agency.findMany({
    where: { bdId },
    select: { id: true, name: true, ownerId: true, status: true, region: true, createdAt: true },
  });
  const { start, end, prevStart, prevEnd } = periodWindow(period);

  let revCur = 0n, revPrev = 0n, turnover = 0n, receiving = 0n;
  const agencyRows = await Promise.all(agencies.map(async (a) => {
    const [aRev, aRevPrev, aTurn, aRecv] = await Promise.all([
      agencyRevenueBeans(a.id, start, end),
      agencyRevenueBeans(a.id, prevStart, prevEnd),
      agencyTurnoverCoins(a.ownerId, start, end),
      agencyReceivingBeans(a.ownerId, start, end),
    ]);
    revCur += aRev; revPrev += aRevPrev; turnover += aTurn; receiving += aRecv;
    return { id: a.id, name: a.name, region: a.region, status: a.status,
      revenue: aRev.toString(), turnover: aTurn.toString(), receiving: aRecv.toString() };
  }));

  const newAgencies = await prisma.agency.count({ where: { bdId, createdAt: { gte: start, lt: end } } });

  const byRegion: Record<string, number> = {};
  for (const a of agencies) { const k = a.region ?? 'unassigned'; byRegion[k] = (byRegion[k] ?? 0) + 1; }

  return {
    id: bd.id, displayName: bd.displayName, email: bd.email, region: bd.region,
    managerId: bd.managerId, isActive: bd.isActive,
    period,
    metrics: {
      revenue: revCur.toString(), revenueGrowthPct: growthPct(revCur, revPrev),
      turnover: turnover.toString(), receiving: receiving.toString(),
      agencyCount: agencies.length, newAgencies,
    },
    regionalExpansion: byRegion,
    agencies: agencyRows,
  };
}

export async function assignAgencyToBd(agencyId: string, bdId: string) {
  const bd = await prisma.adminUser.findUnique({ where: { id: bdId } });
  if (!bd || !hasBdRole(rolesOf(bd))) throw new AppError('Target is not a BD', 400);
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new AppError('Agency not found', 404);
  await prisma.agency.update({ where: { id: agencyId }, data: { bdId } });
  emitAdminManagementChanged({ agencyId, bdId });
  return { agencyId, bdId };
}

export async function transferAgencyBetweenBds(agencyId: string, toBdId: string) {
  return assignAgencyToBd(agencyId, toBdId);
}

export async function setBdActive(bdId: string, isActive: boolean) {
  const bd = await prisma.adminUser.findUnique({ where: { id: bdId } });
  if (!bd || !hasBdRole(rolesOf(bd))) throw new AppError('BD not found', 404);
  await prisma.adminUser.update({ where: { id: bdId }, data: { isActive } });
}

export interface CreateBdInput {
  email: string;
  password: string;
  displayName: string;
  role: 'bd' | 'senior_bd';
  region?: string | null;
  managerId?: string | null;
  username?: string | null;
  phone?: string | null;
  country?: string;
  appUser: ResolveAppUserInput;
  /** Optional unassigned agencies to attach to the new BD on creation. */
  agencyIds?: string[];
}

async function validateBdManager(role: string, managerId?: string | null): Promise<void> {
  if (!managerId) {
    if (isJuniorBdRole(role)) {
      throw new AppError('Junior BD requires a manager (senior BD or admin)', 400);
    }
    return;
  }
  const manager = await prisma.adminUser.findUnique({ where: { id: managerId } });
  if (!manager) throw new AppError('Manager not found', 404);
  // The manager may hold several roles; any qualifying role satisfies the rule.
  const managerRoles = manager.roles?.length ? manager.roles : [manager.role];
  const managerIsAdmin = managerRoles.includes(ADMIN_ROLES.ADMIN) || managerRoles.includes(ADMIN_ROLES.SUPER_ADMIN);
  if (isSeniorBdRole(role)) {
    if (!managerIsAdmin) {
      throw new AppError('Senior BD must report to an admin', 400);
    }
    return;
  }
  if (isJuniorBdRole(role)) {
    if (!hasSeniorBdRole(managerRoles) && !managerIsAdmin) {
      throw new AppError('Junior BD must report to a senior BD or admin', 400);
    }
  }
}

export async function createBd(actingAdminId: string, input: CreateBdInput, ipAddress?: string) {
  if (input.role !== ADMIN_ROLES.BD && input.role !== ADMIN_ROLES.SENIOR_BD) {
    throw new AppError('Role must be bd or senior_bd', 400);
  }
  await validateBdManager(input.role, input.managerId);

  const appUser = await resolveOrCreateAppUser(input.appUser);
  if (!appUser.hakaId) throw new AppError('App user has no Haka ID', 400);

  // One account, many roles: createAdmin adds the BD role to the existing staff
  // account for this Haka ID (if any) rather than rejecting it as a duplicate.
  const { admin: bd, merged } = await adminAuthService.createAdmin(
    input.email,
    input.password,
    input.displayName,
    input.role,
    [],
    {
      region: input.region ?? null,
      hakaId: appUser.hakaId,
      managerId: input.managerId ?? null,
      username: input.username ?? null,
      phone: input.phone ?? null,
      country: input.country ?? '',
    },
    { allowBdRole: true },
  );

  // Attach selected agencies to the new BD. The bdId:null guard ensures we only
  // pick up genuinely-unassigned agencies and never silently steal one already
  // managed by another BD.
  let assignedAgencyCount = 0;
  if (input.agencyIds?.length) {
    const res = await prisma.agency.updateMany({
      where: { id: { in: input.agencyIds }, bdId: null },
      data: { bdId: bd.id },
    });
    assignedAgencyCount = res.count;
  }

  await logAdminAction(
    actingAdminId,
    merged ? 'bd.role_added' : 'bd.create',
    'AdminUser',
    bd.id,
    {
      role: input.role,
      hakaId: appUser.hakaId,
      appUserId: appUser.id,
      managerId: input.managerId ?? null,
      merged,
      assignedAgencyCount,
    },
    ipAddress,
  );
  return { admin: bd, merged, assignedAgencyCount };
}
