import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma";
import { AppError } from "../../../middleware/error.middleware";
import { logAdminAction } from "../../../utils/audit";
import { emitAdminDataChanged, emitAdminManagementChanged } from "../../../sockets/admin-realtime";
import { forceLogout } from "../../moderation/revocation.service";
import { resolveTier } from "../../gifts/tier-lookup";
import {
  COMMISSION_ROLLING_DAYS,
  GIFT_BONUS_ROLLING_DAYS,
  clampRollingWindowStart,
  illustrativeCompanyShareForAgencyPath,
  sumRollingAgencyHostIncome,
  sumRollingAgencyTurnoverCoins,
} from "../../gifts/rolling-agency-income";
import { resolveGiftBonusTier } from "../../gifts/gift-bonus-tier-lookup";
import { resolveGiftBonusRateFromSetting } from "../../gifts/gift-bonus-rate";
import {
  isCommissionOverrideActiveAt,
  isGiftBonusOverrideActiveAt,
} from "../../gifts/agency-override-validity";
import {
  periodWindow, growthPct,
  agencyRevenueBeans, agencyTurnoverCoins, agencyReceivingBeans,
} from "../metrics/staff-metrics";
import { resolveOrCreateAppUser, ResolveAppUserInput } from "../../../utils/appUser";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ListAgenciesParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sort?: string;
  order?: "asc" | "desc";
  /** When true, only agencies not yet assigned to a BD (bdId = null). */
  unassigned?: boolean;
}

export interface CreateAgencyData {
  name: string;
  ownerId?: string;
  owner?: ResolveAppUserInput;
  description?: string;
  bdId?: string | null;
  region?: string | null;
  country?: string;
  commissionPct?: number;
  hostLimit?: number | null;
  withdrawalLimitMonthly?: string | null;
  withdrawalLimitBeans?: string | null;
}

export interface UpdateAgencyData {
  name?: string;
  description?: string;
  giftBonusEnabled?: boolean;
  bdId?: string | null;
  region?: string | null;
  hostLimit?: number;
  withdrawalLimitBeans?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function agencyWithdrawalFields(data: CreateAgencyData): {
  withdrawalLimitMonthly?: bigint;
  withdrawalLimitBeans?: bigint;
} {
  const monthly = data.withdrawalLimitMonthly != null && data.withdrawalLimitMonthly !== ''
    ? BigInt(data.withdrawalLimitMonthly)
    : undefined;
  const beans = data.withdrawalLimitBeans != null && data.withdrawalLimitBeans !== ''
    ? BigInt(data.withdrawalLimitBeans)
    : undefined;
  if (monthly != null && beans == null) {
    return { withdrawalLimitMonthly: monthly, withdrawalLimitBeans: monthly };
  }
  if (beans != null && monthly == null) {
    return { withdrawalLimitBeans: beans, withdrawalLimitMonthly: beans };
  }
  if (monthly != null && beans != null) {
    return { withdrawalLimitMonthly: monthly, withdrawalLimitBeans: beans };
  }
  return {};
}

// Strip legacy columns from agency objects before returning to callers.
// Physical drop is a future concern; until then we omit them in TypeScript.
// Also converts BigInt fields to strings so JSON serialization does not throw.
function omitDeadFields<
  T extends {
    hostRevenueShare?: unknown;
    agentRevenueShare?: unknown;
    companyShare?: unknown;
    cumulativeHostIncome?: unknown;
    beanBalance?: unknown;
  },
>(
  agency: T,
): Omit<T, "hostRevenueShare" | "agentRevenueShare" | "companyShare"> & {
  cumulativeHostIncome?: string;
  beanBalance?: string;
} {
  const {
    hostRevenueShare: _h,
    agentRevenueShare: _a,
    companyShare: _c,
    cumulativeHostIncome,
    beanBalance,
    ...rest
  } = agency;
  return {
    ...rest,
    ...(cumulativeHostIncome !== undefined && {
      cumulativeHostIncome: String(cumulativeHostIncome),
    }),
    ...(beanBalance !== undefined && { beanBalance: String(beanBalance) }),
  } as Omit<T, "hostRevenueShare" | "agentRevenueShare" | "companyShare"> & {
    cumulativeHostIncome?: string;
    beanBalance?: string;
  };
}

function periodStart(
  period: "day" | "week" | "month" | "all",
): Date | undefined {
  const now = new Date();
  if (period === "day")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return undefined;
}

// ── Service ────────────────────────────────────────────────────────────────────

export async function listAgencies(params: ListAgenciesParams) {
  const {
    page,
    limit,
    search,
    status,
    sort = "createdAt",
    order = "desc",
    unassigned,
  } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.AgencyWhereInput = { deletedAt: null };

  if (unassigned) where.bdId = null;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { owner: { displayName: { contains: search, mode: "insensitive" } } },
      { owner: { username: { contains: search, mode: "insensitive" } } },
      { owner: { hakaId: { contains: search, mode: "insensitive" } } },
      { owner: { activeSpecialId: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (status) where.status = status;

  const orderBy: Prisma.AgencyOrderByWithRelationInput = { [sort]: order };

  const [agencies, total] = await Promise.all([
    prisma.agency.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        parentAgency: { select: { id: true, name: true } },
        bd: { select: { id: true, displayName: true, email: true, role: true, region: true } },
        owner: {
          select: {
            id: true,
            displayName: true,
            username: true,
            hakaId: true,
            avatar: true,
            country: true,
            isActive: true,
            lastSeenAt: true,
            lastLiveAt: true,
            wallet: { select: { coinBalance: true, beanBalance: true } },
            _count: { select: { hosts: true } },
            hosts: { where: { isActive: true }, select: { id: true } },
          },
        },
        adminAssignments: {
          include: {
            admin: {
              select: { id: true, displayName: true, email: true, role: true },
            },
          },
        },
      },
    }),
    prisma.agency.count({ where }),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const agencyIds = agencies.map((a) => a.id);
  const ownerIds = agencies.map((a) => a.ownerId);

  // Hosts under each agency owner (agent) — for total hosts, live hosts, last activity.
  const hostRows =
    ownerIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { agentId: { in: ownerIds }, role: "host" },
          select: {
            id: true,
            agentId: true,
            isActive: true,
            lastSeenAt: true,
            lastLiveAt: true,
          },
        });

  const hostIds = hostRows.map((h) => h.id);

  // Live hosts (rooms currently live).
  const liveRooms =
    hostIds.length === 0
      ? []
      : await prisma.room.findMany({
          where: { status: "live", hostId: { in: hostIds } },
          select: { hostId: true },
        });

  const liveHostIds = new Set(liveRooms.map((r) => r.hostId));

  // Monthly revenue (beans) from commission ledger.
  const revenueRows =
    agencyIds.length === 0
      ? []
      : await prisma.giftCommissionLedger.groupBy({
          by: ["agencyId"],
          _sum: { amount: true },
          where: {
            agencyId: { in: agencyIds },
            userId: null,
            createdAt: { gte: monthStart, lt: now },
          },
        });

  const revenueByAgencyId = new Map<string, bigint>();
  for (const r of revenueRows as any[]) {
    if (!r.agencyId) continue;
    revenueByAgencyId.set(r.agencyId as string, (r._sum?.amount as bigint | null) ?? 0n);
  }

  // Monthly withdrawals (beans) for hosts under each agency (grouped by agency owner).
  const withdrawalRows =
    ownerIds.length === 0
      ? []
      : await prisma.withdrawalRequest.findMany({
          where: {
            createdAt: { gte: monthStart, lt: now },
            user: { agentId: { in: ownerIds } },
          },
          select: { beansAmount: true, user: { select: { agentId: true } } },
        });

  const withdrawalsBeansByOwnerId = new Map<string, bigint>();
  for (const wr of withdrawalRows as any[]) {
    const k = wr?.user?.agentId as string | null;
    if (!k) continue;
    withdrawalsBeansByOwnerId.set(k, (withdrawalsBeansByOwnerId.get(k) ?? 0n) + ((wr.beansAmount as bigint) ?? 0n));
  }

  // Risk / freezes: include owner risks + host risks.
  const riskRows =
    ownerIds.length === 0
      ? []
      : await prisma.accountRisk.findMany({
          where: {
            isActive: true,
            OR: [{ userId: { in: ownerIds } }, { user: { agentId: { in: ownerIds } } }],
          },
          select: {
            userId: true,
            severity: true,
            freezeBeans: true,
            user: { select: { agentId: true } },
          },
        });

  const severityScore = (sev: string): number => {
    const s = String(sev || "").toLowerCase();
    if (s === "critical") return 100;
    if (s === "high") return 75;
    if (s === "medium") return 50;
    if (s === "low") return 25;
    return 0;
  };

  const riskByOwnerId = new Map<
    string,
    { maxScore: number; maxSeverity: string; frozen: boolean }
  >();
  for (const id of ownerIds) riskByOwnerId.set(id, { maxScore: 0, maxSeverity: "none", frozen: false });

  for (const rr of riskRows as any[]) {
    const isOwner = ownerIds.includes(rr.userId);
    const ownerId = (isOwner ? rr.userId : (rr?.user?.agentId as string | null)) as string | null;
    if (!ownerId) continue;
    const cur = riskByOwnerId.get(ownerId) ?? { maxScore: 0, maxSeverity: "none", frozen: false };
    const score = severityScore(rr.severity);
    if (score >= cur.maxScore) {
      cur.maxScore = score;
      cur.maxSeverity = String(rr.severity || "none");
    }
    if (rr.freezeBeans) cur.frozen = true;
    riskByOwnerId.set(ownerId, cur);
  }

  // Per-owner host counts and last activity.
  const hostStatsByOwnerId = new Map<
    string,
    { totalHosts: number; activeHosts: number; liveHosts: number; lastActivityAt: string | null }
  >();
  for (const id of ownerIds) hostStatsByOwnerId.set(id, { totalHosts: 0, activeHosts: 0, liveHosts: 0, lastActivityAt: null });

  for (const h of hostRows as any[]) {
    const ownerId = h.agentId as string | null;
    if (!ownerId) continue;
    const cur = hostStatsByOwnerId.get(ownerId) ?? { totalHosts: 0, activeHosts: 0, liveHosts: 0, lastActivityAt: null };
    cur.totalHosts += 1;
    if (h.isActive) cur.activeHosts += 1;
    if (liveHostIds.has(h.id)) cur.liveHosts += 1;

    const candidates: Date[] = [];
    if (h.lastLiveAt) candidates.push(new Date(h.lastLiveAt));
    if (h.lastSeenAt) candidates.push(new Date(h.lastSeenAt));
    const max = candidates.reduce<Date | null>((acc, d) => (!acc || d > acc ? d : acc), cur.lastActivityAt ? new Date(cur.lastActivityAt) : null);
    cur.lastActivityAt = max ? max.toISOString() : cur.lastActivityAt;

    hostStatsByOwnerId.set(ownerId, cur);
  }

  return {
    agencies: agencies.map((a) => {
      const mapped: any = omitDeadFields(a as any);
      mapped.owner = mapped.owner
        ? {
            ...mapped.owner,
            _count: {
              ...(mapped.owner._count ?? {}),
              activeHosts: Array.isArray((mapped.owner as any).hosts)
                ? (mapped.owner as any).hosts.length
                : 0,
            },
            hosts: undefined,
          }
        : mapped.owner;

      const ownerId = a.ownerId;
      const stats = hostStatsByOwnerId.get(ownerId);
      const risk = riskByOwnerId.get(ownerId);
      mapped.metrics = {
        hostsTotal: stats?.totalHosts ?? mapped.owner?._count?.hosts ?? 0,
        hostsActive: stats?.activeHosts ?? mapped.owner?._count?.activeHosts ?? 0,
        hostsLive: stats?.liveHosts ?? 0,
        monthlyRevenueBeans: (revenueByAgencyId.get(a.id) ?? 0n).toString(),
        monthlyWithdrawalsBeans: (withdrawalsBeansByOwnerId.get(ownerId) ?? 0n).toString(),
        fraudRiskScore: risk?.maxScore ?? 0,
        fraudRiskLevel: risk?.maxSeverity ?? "none",
        frozen: risk?.frozen ?? false,
        lastActivityAt: stats?.lastActivityAt ?? null,
      };

      return mapped;
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getAgencyDetail(agencyId: string) {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    include: {
      parentAgency: { select: { id: true, name: true } },
      owner: {
        select: {
          id: true,
          displayName: true,
          username: true,
          hakaId: true,
          avatar: true,
          isActive: true,
          createdAt: true,
          wallet: true,
          hosts: {
            select: {
              id: true,
              displayName: true,
              hakaId: true,
              avatar: true,
              hostType: true,
              isActive: true,
              createdAt: true,
              wallet: { select: { coinBalance: true, beanBalance: true } },
              level: { select: { charmLevel: true, charmXp: true } },
            },
          },
          _count: { select: { hosts: true } },
        },
      },
      adminAssignments: {
        include: {
          admin: {
            select: { id: true, displayName: true, email: true, role: true },
          },
        },
      },
    },
  });

  if (!agency || agency.deletedAt) throw new AppError("Agency not found", 404);
  const result: any = omitDeadFields(agency as any);
  const hosts = result?.owner?.hosts ?? [];
  if (result?.owner?._count) {
    result.owner._count.activeHosts = Array.isArray(hosts)
      ? hosts.filter((h: any) => h?.isActive).length
      : 0;
  }

  // Commission tier snapshot (rolling 30d turnover coins → rate).
  const now = new Date();
  const rollingTurnoverCoins = await sumRollingAgencyTurnoverCoins(prisma, {
    agencyId: agency.id,
    agentOwnerId: agency.ownerId,
    windowEnd: now,
    rollingDays: COMMISSION_ROLLING_DAYS,
    windowStartNotBefore: agency.createdAt,
  });
  const tier = await resolveTier(rollingTurnoverCoins);
  const commissionOvActive = isCommissionOverrideActiveAt({
    rateOverride: agency.commissionRateOverride,
    validUntil: agency.commissionRateOverrideValidUntil,
    at: now,
  });
  const effectiveCommissionRate =
    commissionOvActive && agency.commissionRateOverride != null
      ? Number(agency.commissionRateOverride)
      : tier.commissionRate;

  result.rollingThirtyDayTurnoverCoins = rollingTurnoverCoins.toString();
  result.commissionTier = {
    name: tier.name,
    commissionRate: tier.commissionRate,
  };
  result.effectiveCommissionRate = effectiveCommissionRate;

  const commissionWindowStart = clampRollingWindowStart(
    now,
    COMMISSION_ROLLING_DAYS,
    agency.createdAt,
  );
  result.rollingCommissionWindowStart = commissionWindowStart.toISOString();
  result.rollingCommissionWindowEnd = now.toISOString();

  const ill = illustrativeCompanyShareForAgencyPath({
    commissionRate: effectiveCommissionRate,
    giftBonusRate: 0,
    parentDeltaRate: 0,
  });
  result.companyShareIllustrativeGrossBeans = ill.illustrativeGrossBeans;
  result.companyShareIllustrativeHostBeans = ill.hostBeans;
  result.companyShareIllustrativeDirectBeans = ill.directCommissionBeans;
  result.companyShareIllustrativeCompanyBeans = ill.companyBeans;
  result.companyShareIllustrativePercent = ill.companyPercentOfGross;
  result.hasParentAgency = !!agency.parentAgencyId;

  const rollingGiftBonusIncome = await sumRollingAgencyHostIncome(prisma, {
    agencyId: agency.id,
    agentOwnerId: agency.ownerId,
    windowEnd: now,
    rollingDays: GIFT_BONUS_ROLLING_DAYS,
    windowStartNotBefore: agency.createdAt,
  });
  const gbTier = await resolveGiftBonusTier(rollingGiftBonusIncome);
  const giftBonusOvActive = isGiftBonusOverrideActiveAt({
    rateOverride: agency.giftBonusRateOverride,
    validUntil: agency.giftBonusRateOverrideValidUntil,
    at: now,
  });
  const [giftBonusTierCount, bonusSettingRow] = await Promise.all([
    prisma.giftBonusTier.count(),
    prisma.giftBonusSetting.findUniqueOrThrow({ where: { id: "singleton" } }),
  ]);
  const effectiveGiftBonusRate = resolveGiftBonusRateFromSetting({
    globallyEnabled: bonusSettingRow.enabled,
    agencyEnabled: agency.giftBonusEnabled,
    fallbackBonusRate: Number(bonusSettingRow.bonusRate),
    tierRowCount: giftBonusTierCount,
    tierBonusRate: gbTier?.bonusRate,
    overrideRate:
      agency.giftBonusRateOverride != null
        ? Number(agency.giftBonusRateOverride)
        : null,
    overrideActive: giftBonusOvActive,
  });

  result.rollingSevenDayAgencyHostIncomeBeans =
    rollingGiftBonusIncome.toString();
  result.rollingSevenDayOwnIdIncomeBeans = rollingGiftBonusIncome.toString();
  result.giftBonusTier = gbTier
    ? { name: gbTier.name, bonusRate: gbTier.bonusRate }
    : null;
  result.effectiveGiftBonusRate = effectiveGiftBonusRate;

  return result;
}

export async function createAgency(
  adminId: string,
  data: CreateAgencyData,
  ipAddress?: string,
) {
  let ownerId = data.ownerId;
  let ownerResolved = false;
  if (!ownerId) {
    if (!data.owner) throw new AppError("Provide ownerId or owner", 400);
    const resolved = await resolveOrCreateAppUser(data.owner);
    ownerId = resolved.id;
    ownerResolved = true;
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner) throw new AppError("Owner user not found", 404);
  if (owner.role === "host") {
    throw new AppError(
      "User is a host and cannot own an agency. Demote first.",
      400,
    );
  }

  const existing = await prisma.agency.findUnique({
    where: { ownerId },
  });
  if (existing) throw new AppError("This user already owns an agency", 409);

  const oldRole = owner.role;
  const promoted = oldRole !== "agent";
  const withdrawalFields = agencyWithdrawalFields(data);

  const agency = await prisma.$transaction(async (tx) => {
    if (promoted) {
      await tx.user.update({
        where: { id: ownerId },
        data: { role: "agent" },
      });
    }
    await tx.coinSellerProfile.upsert({
      where: { userId: ownerId },
      create: { userId: ownerId },
      update: {},
    });
    await tx.wallet.upsert({
      where: { userId: ownerId },
      create: { userId: ownerId },
      update: {},
    });
    return tx.agency.create({
      data: {
        name: data.name,
        ownerId,
        description: data.description ?? "",
        ...(data.bdId !== undefined && { bdId: data.bdId }),
        ...(data.region !== undefined && { region: data.region }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.hostLimit !== undefined && { hostLimit: data.hostLimit ?? 0 }),
        ...withdrawalFields,
        ...(data.commissionPct !== undefined && {
          commissionRateOverride: data.commissionPct / 100,
          commissionRateOverrideValidUntil: null,
        }),
      },
    });
  });

  if (promoted) {
    await logAdminAction(
      adminId,
      "user.role_change",
      "User",
      ownerId,
      { oldRole, newRole: "agent", reason: "agency_create" },
      ipAddress,
    );
    await forceLogout(ownerId, "role_promoted_to_agent").catch(() => {});
  } else if (ownerResolved) {
    await forceLogout(ownerId, "admin_created_account").catch(() => {});
  }
  await logAdminAction(
    adminId,
    "agency.create",
    "Agency",
    agency.id,
    { name: agency.name, ownerId: agency.ownerId, promoted, ownerResolved },
    ipAddress,
  );
  emitAdminManagementChanged({ agencyId: agency.id, bdId: agency.bdId });
  return omitDeadFields(agency);
}

function calcExpiresAt(duration: string): Date | null {
  const now = new Date();
  if (duration === "24h") {
    now.setHours(now.getHours() + 24);
    return now;
  }
  if (duration === "7d") {
    now.setDate(now.getDate() + 7);
    return now;
  }
  if (duration === "30d") {
    now.setDate(now.getDate() + 30);
    return now;
  }
  return null;
}

export async function setAgencyWithdrawalFreeze(
  adminId: string,
  agencyId: string,
  input: {
    isFrozen: boolean;
    reason: string;
    severity: "low" | "medium" | "high" | "critical";
    duration: "24h" | "7d" | "30d" | "permanent";
    cascadeToHosts: boolean;
  },
  ipAddress?: string,
) {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { id: true, name: true, ownerId: true },
  });
  if (!agency) throw new AppError("Agency not found", 404);

  const hostIds = input.cascadeToHosts
    ? (
        await prisma.user.findMany({
          where: { agentId: agency.ownerId, role: "host" },
          select: { id: true },
        })
      ).map((h) => h.id)
    : [];

  const targetUserIds = Array.from(new Set([agency.ownerId, ...hostIds]));
  const expiresAt = calcExpiresAt(input.duration);

  if (input.isFrozen) {
    // Deactivate existing active risks first (keep history).
    await prisma.accountRisk.updateMany({
      where: { userId: { in: targetUserIds }, isActive: true },
      data: { isActive: false, releasedAt: new Date(), releasedBy: adminId },
    });

    await prisma.accountRisk.createMany({
      data: targetUserIds.map((userId) => ({
        userId,
        freezeCoins: false,
        freezeBeans: true,
        disableGames: false,
        disableGifts: false,
        blockChat: false,
        reason: input.reason || "agency_withdrawals_frozen",
        severity: input.severity,
        notes: `Agency withdrawal freeze: ${agency.name}`,
        evidenceUrls: [],
        expiresAt,
        appliedBy: adminId,
        isActive: true,
      })),
    });
  } else {
    await prisma.accountRisk.updateMany({
      where: { userId: { in: targetUserIds }, isActive: true, freezeBeans: true },
      data: { isActive: false, releasedAt: new Date(), releasedBy: adminId },
    });
  }

  await logAdminAction(
    adminId,
    input.isFrozen ? "agency.freeze_withdrawals" : "agency.unfreeze_withdrawals",
    "Agency",
    agency.id,
    {
      reason: input.reason,
      severity: input.severity,
      duration: input.duration,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      cascadeToHosts: input.cascadeToHosts,
      targetUserCount: targetUserIds.length,
      ownerId: agency.ownerId,
    },
    ipAddress,
  );

  return {
    agencyId: agency.id,
    isFrozen: input.isFrozen,
    cascadeToHosts: input.cascadeToHosts,
    targetUserCount: targetUserIds.length,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

export async function updateAgency(
  adminId: string,
  agencyId: string,
  data: UpdateAgencyData,
  ipAddress?: string,
) {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency || agency.deletedAt) throw new AppError("Agency not found", 404);

  const updated = await prisma.agency.update({
    where: { id: agencyId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.giftBonusEnabled !== undefined && { giftBonusEnabled: data.giftBonusEnabled }),
      ...(data.bdId !== undefined && { bdId: data.bdId }),
      ...(data.region !== undefined && { region: data.region }),
      ...(data.hostLimit !== undefined && { hostLimit: data.hostLimit }),
      ...(data.withdrawalLimitBeans !== undefined && { withdrawalLimitBeans: BigInt(data.withdrawalLimitBeans) }),
    },
  });

  await logAdminAction(
    adminId,
    "agency.update",
    "Agency",
    agencyId,
    { fields: Object.keys(data) },
    ipAddress,
  );
  return omitDeadFields(updated);
}

export async function deleteAgency(
  adminId: string,
  agencyId: string,
  ipAddress?: string,
) {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency || agency.deletedAt) throw new AppError("Agency not found", 404);

  await logAdminAction(
    adminId,
    "agency.delete",
    "Agency",
    agencyId,
    { name: agency.name },
    ipAddress,
  );
  await prisma.agency.update({ where: { id: agencyId }, data: { deletedAt: new Date() } });
  return { message: `Agency "${agency.name}" deleted` };
}

export async function setAgencyStatus(
  adminId: string,
  agencyId: string,
  status: string,
  ipAddress?: string,
) {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency || agency.deletedAt) throw new AppError("Agency not found", 404);

  const updated = await prisma.agency.update({
    where: { id: agencyId },
    data: { status },
  });
  await logAdminAction(
    adminId,
    "agency.status_change",
    "Agency",
    agencyId,
    { oldStatus: agency.status, newStatus: status },
    ipAddress,
  );
  return updated;
}

export async function assignAdmin(
  adminId: string,
  agencyId: string,
  targetAdminId: string,
  ipAddress?: string,
) {
  const [agency, targetAdmin] = await Promise.all([
    prisma.agency.findUnique({ where: { id: agencyId } }),
    prisma.adminUser.findUnique({ where: { id: targetAdminId } }),
  ]);
  if (!agency) throw new AppError("Agency not found", 404);
  if (!targetAdmin) throw new AppError("Admin not found", 404);

  await prisma.adminAgencyAssignment.upsert({
    where: { agencyId_adminId: { agencyId, adminId: targetAdminId } },
    create: { agencyId, adminId: targetAdminId },
    update: {},
  });

  await logAdminAction(
    adminId,
    "agency.assign_admin",
    "Agency",
    agencyId,
    { targetAdminId },
    ipAddress,
  );
  return { message: `Admin "${targetAdmin.displayName}" assigned to agency` };
}

export async function removeAdminAssignment(
  adminId: string,
  agencyId: string,
  targetAdminId: string,
  ipAddress?: string,
) {
  const assignment = await prisma.adminAgencyAssignment.findUnique({
    where: { agencyId_adminId: { agencyId, adminId: targetAdminId } },
  });
  if (!assignment) throw new AppError("Assignment not found", 404);

  await prisma.adminAgencyAssignment.delete({
    where: { agencyId_adminId: { agencyId, adminId: targetAdminId } },
  });
  await logAdminAction(
    adminId,
    "agency.remove_admin",
    "Agency",
    agencyId,
    { targetAdminId },
    ipAddress,
  );
  return { message: "Admin assignment removed" };
}

export async function getAgencyAnalytics(
  agencyId: string,
  period: "day" | "week" | "month" | "all" = "month",
) {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: {
      ownerId: true,
      owner: { select: { hosts: { select: { id: true, isActive: true } } } },
    },
  });
  if (!agency) throw new AppError("Agency not found", 404);

  const hostIds = agency.owner.hosts.map((h) => h.id);
  const activeHostIds = agency.owner.hosts
    .filter((h) => h.isActive)
    .map((h) => h.id);
  const since = periodStart(period);
  const createdFilter = since ? { gte: since } : undefined;

  const [beansEarned, giftsCount, topHosts] = await Promise.all([
    // Total beans earned by all hosts of this agency
    prisma.giftTransaction.aggregate({
      _sum: { beanValue: true },
      where: { recipientId: { in: hostIds }, createdAt: createdFilter },
    }),
    // Total gift count
    prisma.giftTransaction.count({
      where: { recipientId: { in: hostIds }, createdAt: createdFilter },
    }),
    // Top performing hosts
    prisma.giftTransaction.groupBy({
      by: ["recipientId"],
      _sum: { beanValue: true },
      _count: { id: true },
      where: { recipientId: { in: hostIds }, createdAt: createdFilter },
      orderBy: { _sum: { beanValue: "desc" } },
      take: 5,
    }),
  ]);

  // Enrich top hosts with display names
  const hostDetails =
    topHosts.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: topHosts.map((h) => h.recipientId) } },
          select: { id: true, displayName: true, hakaId: true, avatar: true },
        })
      : [];

  const hostMap = new Map(hostDetails.map((u) => [u.id, u]));

  return {
    period,
    totalHosts: hostIds.length,
    activeHosts: activeHostIds.length,
    beansEarned: beansEarned._sum.beanValue ?? 0,
    giftsReceived: giftsCount,
    topHosts: topHosts.map((h) => ({
      user: hostMap.get(h.recipientId),
      beansEarned: h._sum.beanValue ?? 0,
      giftsReceived: h._count.id,
    })),
  };
}

export async function getAgencyHostRetention(
  agencyId: string,
  window: '7d' | '30d' = '30d',
) {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { id: true, ownerId: true, name: true },
  });
  if (!agency) throw new AppError('Agency not found', 404);

  const since =
    window === '7d'
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const hosts = await prisma.user.findMany({
    where: { role: 'host', agentId: agency.ownerId },
    select: { id: true, lastLiveAt: true },
  });
  const hostIds = hosts.map((h) => h.id);
  if (hostIds.length === 0) {
    return {
      agencyId: agency.id,
      agencyName: agency.name,
      window,
      since,
      totals: { totalHosts: 0, retainedHosts: 0, retentionRate: 0 },
    };
  }

  const micActive = await prisma.hostMicSession.groupBy({
    by: ['userId'],
    where: { userId: { in: hostIds }, startedAt: { gte: since } },
    _count: { _all: true },
  });
  const micSet = new Set(micActive.map((m) => m.userId));

  let retained = 0;
  for (const h of hosts) {
    const lastLiveOk = h.lastLiveAt ? h.lastLiveAt >= since : false;
    const micOk = micSet.has(h.id);
    if (lastLiveOk || micOk) retained += 1;
  }

  const totalHosts = hosts.length;
  const retentionRate = totalHosts === 0 ? 0 : retained / totalHosts;

  return {
    agencyId: agency.id,
    agencyName: agency.name,
    window,
    since,
    totals: {
      totalHosts,
      retainedHosts: retained,
      retentionRate,
    },
  };
}

export async function getAgencyPerformance(agencyId: string, period: 'week' | 'month' = 'month') {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new AppError('Agency not found', 404);
  const { start, end, prevStart, prevEnd } = periodWindow(period);
  const [revenue, revenuePrev, turnover, receiving] = await Promise.all([
    agencyRevenueBeans(agencyId, start, end),
    agencyRevenueBeans(agencyId, prevStart, prevEnd),
    agencyTurnoverCoins(agency.ownerId, start, end),
    agencyReceivingBeans(agency.ownerId, start, end),
  ]);
  return {
    period,
    revenue: revenue.toString(),
    revenueGrowthPct: growthPct(revenue, revenuePrev),
    turnover: turnover.toString(),
    receiving: receiving.toString(),
  };
}

export async function getAgencyWallet(agencyId: string) {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { ownerId: true },
  });
  if (!agency) throw new AppError("Agency not found", 404);

  const wallet = await prisma.wallet.findUnique({
    where: { userId: agency.ownerId },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  return { wallet };
}

export async function transferHost(
  data: { hostUserId: string; toAgencyId: string; reason?: string },
  adminId: string,
  ip: string,
) {
  const host = await prisma.user.findUnique({ where: { id: data.hostUserId } });
  if (!host) throw new AppError("Host user not found", 404);
  if (host.role !== "host") throw new AppError("User is not a host", 400);
  if (host.hostType !== "agent_host")
    throw new AppError("Host is not an agency host", 400);

  // Accept either:
  // - agency owner's userId (agent user id), OR
  // - agencyId (resolve to agency.ownerId)
  let targetAgentUserId: string | null = null;

  const directAgent = await prisma.user.findUnique({
    where: { id: data.toAgencyId },
  });
  if (directAgent) {
    targetAgentUserId = directAgent.id;
    if (directAgent.role !== "agent")
      throw new AppError("Target user is not an agent", 400);
  } else {
    const targetAgency = await prisma.agency.findUnique({
      where: { id: data.toAgencyId },
      select: { id: true, ownerId: true },
    });
    if (!targetAgency) throw new AppError("Target agency not found", 404);

    const agencyOwner = await prisma.user.findUnique({
      where: { id: targetAgency.ownerId },
    });
    if (!agencyOwner) throw new AppError("Target agency owner not found", 404);
    if (agencyOwner.role !== "agent")
      throw new AppError("Target agency owner is not an agent", 400);

    targetAgentUserId = agencyOwner.id;
  }

  const fromAgencyId = host.agentId;

  const updated = await prisma.user.update({
    where: { id: data.hostUserId },
    data: { agentId: targetAgentUserId },
  });

  // Persist ownership history for abuse detection + timeline.
  await prisma.hostAgencyOwnershipChange.create({
    data: {
      hostId: data.hostUserId,
      fromAgentId: fromAgencyId ?? null,
      toAgentId: targetAgentUserId,
      changedByAdminId: adminId,
      reason: (data.reason ?? '').trim(),
    },
  });

  await logAdminAction(
    adminId,
    "agency.transfer_host",
    "User",
    data.hostUserId,
    { fromAgencyId, toAgencyId: targetAgentUserId, rawTarget: data.toAgencyId, reason: (data.reason ?? '').trim() },
    ip,
  );
  emitAdminDataChanged('user_agency', { userId: data.hostUserId });
  return updated;
}

export async function removeHostFromAgency(
  agencyId: string,
  hostUserId: string,
  adminId: string,
  ip: string,
  reason?: string,
) {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { id: true, ownerId: true, name: true },
  });
  if (!agency) throw new AppError("Agency not found", 404);

  const host = await prisma.user.findUnique({ where: { id: hostUserId } });
  if (!host) throw new AppError("Host user not found", 404);
  if (host.role !== "host") throw new AppError("User is not a host", 400);

  // Hosts are linked to an agency via agentId = agency.ownerId.
  if (host.agentId !== agency.ownerId) {
    throw new AppError("Host is not linked to this agency", 400);
  }

  const updated = await prisma.user.update({
    where: { id: hostUserId },
    data: { agentId: null },
  });

  // Persist ownership history for abuse detection + timeline.
  await prisma.hostAgencyOwnershipChange.create({
    data: {
      hostId: hostUserId,
      fromAgentId: agency.ownerId,
      toAgentId: null,
      changedByAdminId: adminId,
      reason: (reason ?? '').trim(),
    },
  });

  await logAdminAction(
    adminId,
    "agency.remove_host",
    "User",
    hostUserId,
    {
      agencyId: agency.id,
      agencyOwnerId: agency.ownerId,
      agencyName: agency.name,
      reason: (reason ?? '').trim(),
    },
    ip,
  );

  emitAdminDataChanged('user_agency', { userId: hostUserId });
  return updated;
}
