import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { emitAdminDataChanged } from '../../../sockets/admin-realtime';
import { periodStart } from '../analytics/analytics.service';

/** Accounts that count as streaming hosts (matches Manage Users role=host filter + legacy rows). */
export function buildHostListWhere(params: {
  search?: string;
  agencyOwnerId?: string;
  verified?: boolean;
}): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [
    {
      OR: [
        { role: 'host' },
        { hostType: { in: ['independent', 'agent_host'] } },
      ],
    },
  ];
  if (params.search?.trim()) {
    const q = params.search.trim();
    and.push({
      OR: [
        { displayName: { contains: q, mode: 'insensitive' } },
        { hakaId: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (params.agencyOwnerId) and.push({ agentId: params.agencyOwnerId });
  if (params.verified !== undefined) and.push({ isVerified: params.verified });
  return { AND: and };
}

const hostListSelect = {
  id: true,
  displayName: true,
  hakaId: true,
  isVerified: true,
  isVerifiedHost: true,
  isMuted: true,
  isHostBanned: true,
  isTaskBanned: true,
  isTaskBannedReason: true,
  hostType: true,
  agentId: true,
  lastLiveAt: true,
  cumulativeBeansEarned: true,
  agent: {
    select: {
      id: true,
      displayName: true,
      hakaId: true,
      ownedAgency: { select: { id: true, name: true, status: true } },
    },
  },
} satisfies Prisma.UserSelect;

export async function listHosts(params: {
  search?: string;
  agencyOwnerId?: string;
  verified?: boolean;
  page?: number;
  pageSize?: number;
  period?: 'day' | 'week' | 'month' | 'all';
}) {
  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 25, 100);
  const where = buildHostListWhere(params);
  const skip = (page - 1) * pageSize;

  type HostListRow = Prisma.UserGetPayload<{ select: typeof hostListSelect }>;
  let rows: HostListRow[];
  let total: number;
  try {
    [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ lastLiveAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
        select: hostListSelect,
      }),
      prisma.user.count({ where }),
    ]);
  } catch {
    // Fallback when optional columns/relations are unavailable on older DB snapshots.
    const slimSelect = {
      id: true,
      displayName: true,
      hakaId: true,
      isVerified: true,
      isVerifiedHost: true,
      isMuted: true,
      isHostBanned: true,
      hostType: true,
      agentId: true,
      lastLiveAt: true,
      cumulativeBeansEarned: true,
    } satisfies Prisma.UserSelect;
    const [slimRows, slimTotal] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: slimSelect,
      }),
      prisma.user.count({ where }),
    ]);
    total = slimTotal;
    rows = slimRows.map((r) => ({
      ...r,
      agent: null,
      isTaskBanned: false,
      isTaskBannedReason: '',
    })) as HostListRow[];
  }

  const since = params.period && params.period !== 'all' ? periodStart(params.period) : null;
  const ids = rows.map(r => r.id);
  let minMap: Record<string, number> = {};
  if (ids.length) {
    try {
      const micWhere: Prisma.HostMicSessionWhereInput = { userId: { in: ids } };
      if (since) micWhere.startedAt = { gte: since };
      const mins = await prisma.hostMicSession.groupBy({
        by: ['userId'],
        _sum: { minutes: true },
        where: micWhere,
      });
      minMap = Object.fromEntries(mins.map(m => [m.userId, m._sum.minutes ?? 0]));
    } catch {
      minMap = {};
    }
  }

  return {
    items: rows.map(r => ({
      id: r.id, displayName: r.displayName, hakaId: r.hakaId,
      isVerified: r.isVerified, isVerifiedHost: r.isVerifiedHost,
      isMuted: r.isMuted, isHostBanned: r.isHostBanned, hostType: r.hostType,
      agentId: r.agentId, lastLiveAt: r.lastLiveAt,
      agency: r.agent?.ownedAgency
        ? {
            id: r.agent.ownedAgency.id,
            name: r.agent.ownedAgency.name,
            status: r.agent.ownedAgency.status,
            owner: { id: r.agent.id, displayName: r.agent.displayName, hakaId: r.agent.hakaId },
          }
        : null,
      cumulativeBeansEarned: r.cumulativeBeansEarned.toString(),
      streamingMinutes: minMap[r.id] ?? 0,
    })),
    pagination: { page, pageSize, total },
  };
}

export async function activeHostCount(): Promise<number> {
  return prisma.user.count({
    where: {
      isActive: true,
      OR: [
        { role: 'host' },
        { hostType: { in: ['independent', 'agent_host'] } },
      ],
    },
  });
}

export async function getHostOwnership(hostId: string) {
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: {
      id: true,
      displayName: true,
      hakaId: true,
      role: true,
      hostType: true,
      agentId: true,
      lastLiveAt: true,
      isHostBanned: true,
      agent: {
        select: {
          id: true,
          displayName: true,
          hakaId: true,
          ownedAgency: { select: { id: true, name: true, status: true } },
        },
      },
    },
  });
  if (!host) throw new AppError('Host not found', 404);
  if (host.role !== 'host') throw new AppError('User is not a host', 400);

  const history = await prisma.hostAgencyOwnershipChange.findMany({
    where: { hostId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      hostId: true,
      fromAgentId: true,
      toAgentId: true,
      changedByAdminId: true,
      reason: true,
      createdAt: true,
      fromAgent: { select: { id: true, displayName: true, hakaId: true } },
      toAgent: { select: { id: true, displayName: true, hakaId: true } },
      changedByAdmin: { select: { id: true, displayName: true, email: true, role: true } },
    },
  });

  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [c7, c30] = await Promise.all([
    prisma.hostAgencyOwnershipChange.count({ where: { hostId, createdAt: { gte: d7 } } }),
    prisma.hostAgencyOwnershipChange.count({ where: { hostId, createdAt: { gte: d30 } } }),
  ]);

  return {
    host: {
      id: host.id,
      displayName: host.displayName,
      hakaId: host.hakaId,
      hostType: host.hostType,
      agentId: host.agentId,
      lastLiveAt: host.lastLiveAt,
      isHostBanned: host.isHostBanned,
    },
    currentAgency: host.agent?.ownedAgency
      ? {
          id: host.agent.ownedAgency.id,
          name: host.agent.ownedAgency.name,
          status: host.agent.ownedAgency.status,
          owner: { id: host.agent.id, displayName: host.agent.displayName, hakaId: host.agent.hakaId },
        }
      : null,
    agencyChangeCount_7d: c7,
    agencyChangeCount_30d: c30,
    history,
  };
}

export async function transferHostAgency(
  actorAdminId: string,
  hostId: string,
  input: { toAgentOwnerId: string; reason?: string },
  ipAddress?: string,
) {
  const [host, targetAgent] = await Promise.all([
    prisma.user.findUnique({ where: { id: hostId }, select: { id: true, role: true, hostType: true, agentId: true } }),
    prisma.user.findUnique({
      where: { id: input.toAgentOwnerId },
      select: { id: true, role: true, ownedAgency: { select: { id: true, name: true, status: true } } },
    }),
  ]);

  if (!host) throw new AppError('Host not found', 404);
  if (host.role !== 'host') throw new AppError('User is not a host', 400);
  if (!targetAgent) throw new AppError('Target agent not found', 404);
  if (targetAgent.role !== 'agent') throw new AppError('Target user is not an agent', 400);
  if (!targetAgent.ownedAgency) throw new AppError('Target agent does not own an agency', 400);
  if (host.agentId === targetAgent.id) throw new AppError('Host is already under this agency', 400);

  const reason = input.reason?.trim() ?? '';

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: hostId },
      data: {
        agentId: targetAgent.id,
        hostType: 'agent_host',
      },
      select: { id: true, agentId: true, hostType: true },
    });

    await tx.hostAgencyOwnershipChange.create({
      data: {
        hostId,
        fromAgentId: host.agentId ?? null,
        toAgentId: targetAgent.id,
        changedByAdminId: actorAdminId,
        reason,
      },
    });

    return u;
  });

  await logAdminAction(
    actorAdminId,
    'host.transfer_agency',
    'User',
    hostId,
    { fromAgentId: host.agentId, toAgentId: targetAgent.id, reason },
    ipAddress,
  );

  emitAdminDataChanged('user_agency', { userId: hostId });

  return {
    hostId,
    fromAgentId: host.agentId ?? null,
    toAgentId: targetAgent.id,
    hostType: updated.hostType,
    reason,
  };
}

export async function removeHostAgency(
  actorAdminId: string,
  hostId: string,
  input: { reason?: string },
  ipAddress?: string,
) {
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: { id: true, role: true, hostType: true, agentId: true },
  });
  if (!host) throw new AppError('Host not found', 404);
  if (host.role !== 'host') throw new AppError('User is not a host', 400);
  if (!host.agentId) {
    // Still write an audit entry, but do not create a history row (no state change).
    await logAdminAction(actorAdminId, 'host.remove_agency_noop', 'User', hostId, { reason: input.reason ?? '' }, ipAddress);
    return { hostId, fromAgentId: null, toAgentId: null, hostType: host.hostType };
  }

  const reason = input.reason?.trim() ?? '';
  const fromAgentId = host.agentId;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: hostId },
      data: {
        agentId: null,
        hostType: 'independent',
      },
      select: { id: true, agentId: true, hostType: true },
    });
    await tx.hostAgencyOwnershipChange.create({
      data: {
        hostId,
        fromAgentId,
        toAgentId: null,
        changedByAdminId: actorAdminId,
        reason,
      },
    });
    return u;
  });

  await logAdminAction(
    actorAdminId,
    'host.remove_agency',
    'User',
    hostId,
    { fromAgentId, toAgentId: null, reason },
    ipAddress,
  );

  emitAdminDataChanged('user_agency', { userId: hostId });

  return {
    hostId,
    fromAgentId,
    toAgentId: null,
    hostType: updated.hostType,
    reason,
  };
}

export async function listMultiAgencyAbuse(params: {
  window: '7d' | '30d';
  minChanges: number;
  agencyOwnerId?: string;
}) {
  const since =
    params.window === '7d'
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = { createdAt: { gte: since } };
  if (params.agencyOwnerId) {
    where.OR = [
      { fromAgentId: params.agencyOwnerId },
      { toAgentId: params.agencyOwnerId },
    ];
  }

  const grouped = await prisma.hostAgencyOwnershipChange.groupBy({
    by: ['hostId'],
    where,
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _count: { id: 'desc' } },
    take: 500,
  });

  const filtered = grouped.filter((g) => (g._count?.id ?? 0) >= params.minChanges).slice(0, 200);

  const hostIds = filtered.map((g) => g.hostId);
  if (hostIds.length === 0) return { items: [], since };

  const hosts = await prisma.user.findMany({
    where: { id: { in: hostIds } },
    select: {
      id: true,
      displayName: true,
      hakaId: true,
      agentId: true,
      hostType: true,
      lastLiveAt: true,
      agent: { select: { id: true, displayName: true, hakaId: true, ownedAgency: { select: { id: true, name: true, status: true } } } },
    },
  });
  const hostMap = new Map(hosts.map((h) => [h.id, h]));

  return {
    since,
    items: filtered.map((g) => {
      const h = hostMap.get(g.hostId);
      return {
        hostId: g.hostId,
        displayName: h?.displayName ?? 'Unknown',
        hakaId: h?.hakaId ?? null,
        currentAgentId: h?.agentId ?? null,
        currentAgency: h?.agent?.ownedAgency
          ? {
              id: h.agent.ownedAgency.id,
              name: h.agent.ownedAgency.name,
              status: h.agent.ownedAgency.status,
              owner: { id: h.agent.id, displayName: h.agent.displayName, hakaId: h.agent.hakaId },
            }
          : null,
        changeCount: g._count?.id ?? 0,
        lastChangeAt: g._max?.createdAt ?? null,
      };
    }),
  };
}

export async function getHostRevenue(hostId: string, period: 'day' | 'week' | 'month' | 'all') {
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: { id: true, role: true, cumulativeBeansEarned: true },
  });
  if (!host) throw new AppError('Host not found', 404);
  if (host.role !== 'host') throw new AppError('User is not a host', 400);

  const since = period !== 'all' ? periodStart(period) : null;
  const wallet = await prisma.wallet.findUnique({ where: { userId: hostId }, select: { id: true } });
  if (!wallet) {
    return {
      hostId,
      period,
      since,
      totals: { gift_received_beans: '0', gift_commission_beans: '0', total_beans: '0' },
      cumulativeBeansEarned: host.cumulativeBeansEarned.toString(),
    };
  }

  const whereBase: Record<string, unknown> = {
    walletId: wallet.id,
    currency: 'beans',
    transactionType: 'credit',
    reference: { in: ['gift_received', 'gift_commission'] },
  };
  if (since) whereBase.createdAt = { gte: since };

  const rows = await prisma.walletTransaction.findMany({
    where: whereBase as any,
    select: { reference: true, amount: true },
    take: 5000,
    orderBy: { createdAt: 'desc' },
  });

  let giftReceived = 0n;
  let giftCommission = 0n;
  for (const r of rows) {
    const amt = BigInt(r.amount as any);
    if (r.reference === 'gift_received') giftReceived += amt;
    else if (r.reference === 'gift_commission') giftCommission += amt;
  }
  const total = giftReceived + giftCommission;

  return {
    hostId,
    period,
    since,
    totals: {
      gift_received_beans: giftReceived.toString(),
      gift_commission_beans: giftCommission.toString(),
      total_beans: total.toString(),
    },
    cumulativeBeansEarned: host.cumulativeBeansEarned.toString(),
  };
}

export async function banHostTask(
  adminId: string,
  hostId: string,
  reason: string,
  ipAddress?: string,
) {
  const host = await prisma.user.findUnique({ where: { id: hostId }, select: { id: true, role: true } });
  if (!host) throw new AppError('Host not found', 404);
  if (host.role !== 'host') throw new AppError('User is not a host', 400);

  await prisma.user.update({
    where: { id: hostId },
    data: { isTaskBanned: true, isTaskBannedReason: reason },
  });
  await logAdminAction(adminId, 'host.task_ban', 'User', hostId, { reason }, ipAddress);
  return { hostId, isTaskBanned: true, reason };
}

export async function releaseHostTask(adminId: string, hostId: string, ipAddress?: string) {
  const host = await prisma.user.findUnique({ where: { id: hostId }, select: { id: true, role: true } });
  if (!host) throw new AppError('Host not found', 404);
  if (host.role !== 'host') throw new AppError('User is not a host', 400);

  await prisma.user.update({
    where: { id: hostId },
    data: { isTaskBanned: false, isTaskBannedReason: '' },
  });
  await logAdminAction(adminId, 'host.task_release', 'User', hostId, {}, ipAddress);
  return { hostId, isTaskBanned: false };
}
