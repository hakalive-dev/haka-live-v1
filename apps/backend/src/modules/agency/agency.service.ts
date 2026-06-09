import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../middleware/error.middleware";
import { creditCoins } from "../wallet/wallet.service";
import { resolveTier } from "../gifts/tier-lookup";
import {
  resolveGiftBonusTier,
  nextGiftBonusTierAfter,
  listGiftBonusTiersAsc,
} from "../gifts/gift-bonus-tier-lookup";
import { resolveGiftBonusRateFromSetting } from "../gifts/gift-bonus-rate";
import { isGiftBonusProgramActive } from "../gifts/gift-bonus-program";
import {
  COMMISSION_ROLLING_DAYS,
  clampRollingWindowStart,
  sumRollingAgencyHostIncome,
} from "../gifts/rolling-agency-income";
import { listCommissionLedger } from "../gifts/commission-ledger-query";
import {
  isCommissionOverrideActiveAt,
  isGiftBonusOverrideActiveAt,
} from "../gifts/agency-override-validity";

/** Hosts with ≥ this much gift volume (coin_cost × qty) in the rolling window count as “base salary” hosts. */
const BASE_SALARY_HOST_COIN_THRESHOLD = 100_000;

// ── Agency Summary ─────────────────────────────────────────────────────────────

/**
 * Get agency summary for an agent.
 * Calculates weekly beans from all hosts under this agent,
 * determines commission tier from rolling 30-day agency turnover, and computes weekly + all-time commission.
 */
export async function getAgencySummary(agentId: string) {
  // Validate agent
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true },
  });
  if (!agent) throw new AppError("Agent not found", 404);
  if (agent.role !== "agent") throw new AppError("User is not an agent", 403);

  // Get all host IDs under this agent
  const hosts = await prisma.user.findMany({
    where: { agentId },
    select: { id: true },
  });
  const hostIds = hosts.map((h) => h.id);

  const totalHosts = hostIds.length;

  // Day boundaries (server-local time; acceptable since commission is internal accounting)
  const now = new Date();
  const thirtyDayWindowStart = new Date(
    now.getTime() - COMMISSION_ROLLING_DAYS * 24 * 60 * 60 * 1000,
  );

  let baseSalaryHostCount = 0;
  if (hostIds.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT gt."recipientId"
        FROM gift_transactions gt
        WHERE gt."recipientId" IN (${Prisma.join(hostIds)})
          AND gt."recipientType" = 'user'
          AND gt."createdAt" >= ${thirtyDayWindowStart}
        GROUP BY gt."recipientId"
        HAVING COALESCE(SUM(gt."coinCost"::bigint * gt.qty::bigint), 0) >= ${BASE_SALARY_HOST_COIN_THRESHOLD}
      ) sub
    `;
    baseSalaryHostCount = Number(rows[0]?.count ?? 0n);
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const sameDayLastWeekStart = new Date(todayStart);
  sameDayLastWeekStart.setDate(sameDayLastWeekStart.getDate() - 7);
  const sameDayLastWeekEnd = new Date(sameDayLastWeekStart);
  sameDayLastWeekEnd.setDate(sameDayLastWeekEnd.getDate() + 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Host wallets (used for host-bean aggregates below)
  let hostWalletIds: string[] = [];
  if (hostIds.length > 0) {
    const hostWallets = await prisma.wallet.findMany({
      where: { userId: { in: hostIds } },
      select: { id: true },
    });
    hostWalletIds = hostWallets.map((w) => w.id);
  }

  const agentWallet = await prisma.wallet.findUnique({
    where: { userId: agentId },
    select: { id: true },
  });

  // Host bean aggregates: weekly / yesterday / same day last week (roster hosts only)
  let weeklyBeans = 0;
  let yesterdayBeans = 0;
  let sameDayLastWeekBeans = 0;
  if (hostWalletIds.length > 0) {
    const hostBeansWhere = {
      walletId: { in: hostWalletIds },
      currency: "beans",
      transactionType: "credit",
      reference: "gift_received",
    } as const;
    const [weekAgg, yesterdayAgg, sameAgg] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: { ...hostBeansWhere, createdAt: { gte: weekStart } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          ...hostBeansWhere,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          ...hostBeansWhere,
          createdAt: { gte: sameDayLastWeekStart, lt: sameDayLastWeekEnd },
        },
        _sum: { amount: true },
      }),
    ]);
    weeklyBeans = Number(weekAgg._sum.amount ?? 0);
    yesterdayBeans = Number(yesterdayAgg._sum.amount ?? 0);
    sameDayLastWeekBeans = Number(sameAgg._sum.amount ?? 0);
  }

  // todayBeans (mobile "Earned Today"): gift_received credits today for this agency's agent wallet
  // plus every managed host's wallet. Live-room gifts credit the host on mic (host wallet), not the agent.
  const giftTodayWalletIds = [
    ...(agentWallet ? [agentWallet.id] : []),
    ...hostWalletIds,
  ];
  let todayBeans = 0;
  if (giftTodayWalletIds.length > 0) {
    const todayGiftAgg = await prisma.walletTransaction.aggregate({
      where: {
        walletId: { in: giftTodayWalletIds },
        currency: "beans",
        transactionType: "credit",
        reference: "gift_received",
        createdAt: { gte: todayStart },
      },
      _sum: { amount: true },
    });
    todayBeans = Number(todayGiftAgg._sum.amount ?? 0);
  }

  let weeklyCommission = 0;
  let allTimeCommission = 0;
  let todayCommission = 0;
  let monthCommission = 0;
  if (agentWallet) {
    const commWhere = {
      walletId: agentWallet.id,
      currency: "beans",
      transactionType: "credit",
      reference: "gift_commission",
    } as const;
    const [weekAgg, allAgg, todayAgg, monthAgg] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: { ...commWhere, createdAt: { gte: weekStart } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: commWhere,
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...commWhere, createdAt: { gte: todayStart } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...commWhere, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    weeklyCommission = Number(weekAgg._sum.amount ?? 0);
    allTimeCommission = Number(allAgg._sum.amount ?? 0);
    todayCommission = Number(todayAgg._sum.amount ?? 0);
    monthCommission = Number(monthAgg._sum.amount ?? 0);
  }

  // All tiers sorted ascending — used by mobile to render tier journey progress bar.
  const allTiersRaw = await prisma.agencyTier.findMany({
    orderBy: { minHostIncome: "asc" },
  });
  const allTiers = allTiersRaw.map((t) => ({
    name: t.name,
    commissionRate: Number(t.commissionRate),
    minHostIncome: (t.minHostIncome as unknown as bigint).toString(),
  }));

  const agency = await prisma.agency.findUnique({
    where: { ownerId: agentId },
    include: { parentAgency: { select: { id: true, name: true } } },
  });

  let commissionTier = { name: "A", commissionRate: 0.04 };
  let cumulativeHostIncome = "0";
  let agencyPotBalance = "0";
  let parentAgencyId: string | null = null;
  let parentAgencyName: string | null = null;
  let effectiveCommissionRate = 0.04;
  let effectiveGiftBonusRate = 0;
  let giftBonusProgramEnabled = false;
  let giftBonusEnabledFlag = true;
  let currentTier = { name: "A", commissionRate: 0.04, minHostIncome: "0" };
  let nextTier: {
    name: string;
    commissionRate: number;
    minHostIncome: string;
  } | null = null;

  let rollingThirtyDayAgencyHostIncome = "0";
  let rollingThirtyDayWindowStart = "";
  let rollingThirtyDayWindowEnd = "";

  let rollingSevenDayAgencyHostIncome = "0";
  let currentGiftBonusTier: {
    name: string;
    bonusRate: number;
    minRollingIncome: string;
  } | null = null;
  let nextGiftBonusTier: {
    name: string;
    bonusRate: number;
    minRollingIncome: string;
  } | null = null;
  /** Global ladder from DB — not tied to whether this user has an `Agency` row (mobile needs labels). */
  const gbCatalogRaw = await listGiftBonusTiersAsc();
  const allGiftBonusTiers: {
    name: string;
    bonusRate: number;
    minRollingIncome: string;
  }[] = gbCatalogRaw.map((t) => ({
    name: t.name,
    bonusRate: t.bonusRate,
    minRollingIncome: t.minRollingIncome.toString(),
  }));

  let subAgencyCount = 0;

  if (agency) {
    const income = BigInt(
      agency.cumulativeHostIncome as unknown as string | number | bigint,
    );
    cumulativeHostIncome = income.toString();
    agencyPotBalance = BigInt(
      agency.beanBalance as unknown as string | number | bigint,
    ).toString();
    parentAgencyId = agency.parentAgency?.id ?? null;
    parentAgencyName = agency.parentAgency?.name ?? null;

    subAgencyCount = await prisma.agency.count({
      where: { parentAgencyId: agency.id },
    });
    const rolling30 = await sumRollingAgencyHostIncome(prisma, {
      agencyId: agency.id,
      agentOwnerId: agency.ownerId,
      windowEnd: now,
      rollingDays: COMMISSION_ROLLING_DAYS,
      rollUpSubAgencyVolume: subAgencyCount > 0,
      windowStartNotBefore: agency.createdAt,
    });
    rollingThirtyDayAgencyHostIncome = rolling30.toString();
    const thirtyStart = clampRollingWindowStart(
      now,
      COMMISSION_ROLLING_DAYS,
      agency.createdAt,
    );
    rollingThirtyDayWindowStart = thirtyStart.toISOString();
    rollingThirtyDayWindowEnd = now.toISOString();

    const tier = await resolveTier(rolling30);

    const commissionOvActive = isCommissionOverrideActiveAt({
      rateOverride: agency.commissionRateOverride,
      validUntil: agency.commissionRateOverrideValidUntil,
      at: now,
    });
    effectiveCommissionRate =
      commissionOvActive && agency.commissionRateOverride !== null
        ? Number(agency.commissionRateOverride)
        : tier.commissionRate;

    commissionTier = {
      name: tier.name,
      commissionRate: tier.commissionRate,
    };

    // Gift-bonus tier + 7d display: same rolling sum as distributeBeans gift-bonus step
    // (sumRollingAgencyHostIncome — agency destination + hosts under this agent).
    const rollingIncome7 = await sumRollingAgencyHostIncome(prisma, {
      agencyId: agency.id,
      agentOwnerId: agency.ownerId,
      windowEnd: now,
      windowStartNotBefore: agency.createdAt,
    });
    rollingSevenDayAgencyHostIncome = rollingIncome7.toString();

    const bonus = await prisma.giftBonusSetting.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    const giftBonusTierCount = await prisma.giftBonusTier.count();

    const giftBonusOvActive = isGiftBonusOverrideActiveAt({
      rateOverride: agency.giftBonusRateOverride,
      validUntil: agency.giftBonusRateOverrideValidUntil,
      at: now,
    });
    giftBonusEnabledFlag = agency.giftBonusEnabled;
    giftBonusProgramEnabled = isGiftBonusProgramActive(
      bonus.enabled,
      agency.giftBonusEnabled,
    );
    const gt = await resolveGiftBonusTier(rollingIncome7);
    effectiveGiftBonusRate = resolveGiftBonusRateFromSetting({
      globallyEnabled: bonus.enabled,
      agencyEnabled: agency.giftBonusEnabled,
      fallbackBonusRate: Number(bonus.bonusRate),
      tierRowCount: giftBonusTierCount,
      tierBonusRate: gt?.bonusRate,
      overrideRate:
        agency.giftBonusRateOverride != null
          ? Number(agency.giftBonusRateOverride)
          : null,
      overrideActive: giftBonusOvActive,
    });
    if (giftBonusProgramEnabled && gt) {
      currentGiftBonusTier = {
        name: gt.name,
        bonusRate: gt.bonusRate,
        minRollingIncome: gt.minRollingIncome.toString(),
      };
    }
    if (giftBonusProgramEnabled) {
      const nxt = await nextGiftBonusTierAfter(rollingIncome7);
      if (nxt) {
        nextGiftBonusTier = {
          name: nxt.name,
          bonusRate: nxt.bonusRate,
          minRollingIncome: nxt.minRollingIncome.toString(),
        };
      }
    }

    currentTier = {
      name: tier.name,
      commissionRate: tier.commissionRate,
      minHostIncome: tier.minHostIncome.toString(),
    };

    const currentTierIdx = allTiers.findIndex((t) => t.name === tier.name);
    if (currentTierIdx >= 0 && currentTierIdx < allTiers.length - 1) {
      nextTier = allTiers[currentTierIdx + 1];
    }
  } else if (allTiers.length > 0) {
    // No agency row yet: still expose global A–E ladder so mobile can show commission ring + next tier (4% → 8%, …).
    const first = allTiers[0];
    currentTier = {
      name: first.name,
      commissionRate: first.commissionRate,
      minHostIncome: first.minHostIncome,
    };
    commissionTier = { name: first.name, commissionRate: first.commissionRate };
    effectiveCommissionRate = first.commissionRate;
    if (allTiers.length > 1) {
      nextTier = allTiers[1];
    }
  }

  // Direct vs invite-agent commission split (all-time) from GiftCommissionLedger.
  // "direct" — commission from hosts directly under this agency.
  // "parent_delta" — commission delta received from sub-agencies (aka invite-agent commission).
  let directCommissionAllTime = 0;
  let inviteAgentCommissionAllTime = 0;
  if (agency) {
    const ledgerGroups = await prisma.giftCommissionLedger.groupBy({
      by: ["commissionType"],
      where: { agencyId: agency.id },
      _sum: { amount: true },
    });
    for (const row of ledgerGroups) {
      const amt = Number((row._sum.amount as unknown as bigint | null) ?? 0n);
      if (row.commissionType === "direct") directCommissionAllTime = amt;
      else if (row.commissionType === "parent_delta")
        inviteAgentCommissionAllTime = amt;
    }
  }

  // Monthly commission split from GiftCommissionLedger.
  let monthHostCommission = 0;
  let monthSubAgentCommission = 0;
  let monthHostBeans = 0;
  if (agency) {
    const [monthHostCommAgg, monthSubAgentCommAgg] = await Promise.all([
      prisma.giftCommissionLedger.aggregate({
        where: { agencyId: agency.id, commissionType: "direct", createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.giftCommissionLedger.aggregate({
        where: { agencyId: agency.id, commissionType: "parent_delta", createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    monthHostCommission = Number((monthHostCommAgg._sum.amount as unknown as bigint | null) ?? 0n);
    monthSubAgentCommission = Number((monthSubAgentCommAgg._sum.amount as unknown as bigint | null) ?? 0n);
  }
  if (hostIds.length > 0) {
    const monthBeansAgg = await prisma.giftTransaction.aggregate({
      where: { recipientId: { in: hostIds }, createdAt: { gte: monthStart } },
      _sum: { beanValue: true },
    });
    monthHostBeans = Math.floor((monthBeansAgg._sum.beanValue ?? 0) * 0.7);
  }

  return {
    commissionTier,
    totalHosts,
    weeklyBeans,
    weeklyCommission,
    allTimeCommission,
    todayBeans,
    yesterdayBeans,
    sameDayLastWeekBeans,
    todayCommission,
    monthCommission,
    directCommissionAllTime,
    inviteAgentCommissionAllTime,
    monthHostCommission,
    monthSubAgentCommission,
    monthHostBeans,
    cumulativeHostIncome,
    agencyPotBalance,
    parentAgencyId,
    parentAgencyName,
    effectiveCommissionRate,
    effectiveGiftBonusRate,
    giftBonusProgramEnabled,
    giftBonusEnabled: giftBonusEnabledFlag,
    rollingThirtyDayAgencyHostIncome,
    rollingThirtyDayWindowStart,
    rollingThirtyDayWindowEnd,
    rollingSevenDayAgencyHostIncome,
    currentGiftBonusTier,
    nextGiftBonusTier,
    allGiftBonusTiers,
    currentTier,
    nextTier,
    allTiers,
    agencyStatus: agency?.status ?? "active",
    /** Child agencies under this agency (each owned by a sub-agent). */
    subAgencyCount,
    /** Hosts under this agent with ≥100k coins of gifts received (coin_cost×qty) in the last 30 days. */
    baseSalaryHostCount,
  };
}

// ── Host Roster ────────────────────────────────────────────────────────────────

/**
 * Get paginated list of hosts under an agent.
 */
export async function getHostRoster(
  agentId: string,
  page: number,
  limit: number,
) {
  const where = { agentId };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        hostType: true,
        country: true,
        createdAt: true,
        wallet: {
          select: { beanBalance: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const hostIds = items.map((h) => h.id);

  const [monthlyBeansGroups, monthlyCommLedger] = await Promise.all([
    hostIds.length > 0
      ? prisma.giftTransaction.groupBy({
          by: ["recipientId"],
          where: { recipientId: { in: hostIds }, createdAt: { gte: monthStart } },
          _sum: { beanValue: true },
        })
      : Promise.resolve([]),
    hostIds.length > 0
      ? prisma.giftCommissionLedger.findMany({
          where: {
            userId: agentId,
            commissionType: "direct",
            createdAt: { gte: monthStart },
          },
          select: {
            amount: true,
            giftTransaction: { select: { recipientId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const monthlyBeansMap: Record<string, number> = {};
  for (const row of monthlyBeansGroups) {
    monthlyBeansMap[row.recipientId] = Math.floor((row._sum.beanValue ?? 0) * 0.7);
  }

  const monthlyCommMap: Record<string, number> = {};
  for (const row of monthlyCommLedger) {
    const recipientId = row.giftTransaction?.recipientId;
    if (!recipientId) continue;
    const amt = Number((row.amount as unknown as bigint) ?? 0n);
    monthlyCommMap[recipientId] = (monthlyCommMap[recipientId] ?? 0) + amt;
  }

  const enrichedItems = items.map((h) => ({
    ...h,
    monthly_beans: monthlyBeansMap[h.id] ?? 0,
    monthly_commission: monthlyCommMap[h.id] ?? 0,
  }));

  return { items: enrichedItems, total, page, limit, hasMore: page * limit < total };
}

// ── Host Stats ─────────────────────────────────────────────────────────────────

/**
 * Get gift transaction stats for a host over last 30 days, grouped by date.
 */
export async function getHostStats(agentId: string, hostId: string) {
  // Verify the host belongs to this agent
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: {
      id: true,
      agentId: true,
      displayName: true,
      username: true,
      avatar: true,
    },
  });
  if (!host) throw new AppError("Host not found", 404);
  if (host.agentId !== agentId)
    throw new AppError("Host does not belong to your agency", 403);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const transactions = await prisma.giftTransaction.findMany({
    where: {
      recipientId: hostId,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: {
      beanValue: true,
      coinCost: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by date
  const byDate: Record<
    string,
    { date: string; totalBeans: number; totalCoins: number; count: number }
  > = {};
  for (const tx of transactions) {
    const date = tx.createdAt.toISOString().split("T")[0];
    if (!byDate[date]) {
      byDate[date] = { date, totalBeans: 0, totalCoins: 0, count: 0 };
    }
    byDate[date].totalBeans += tx.beanValue;
    byDate[date].totalCoins += tx.coinCost;
    byDate[date].count += 1;
  }

  const daily = Object.values(byDate).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const totals = transactions.reduce(
    (acc, tx) => {
      acc.totalBeans += tx.beanValue;
      acc.totalCoins += tx.coinCost;
      acc.count += 1;
      return acc;
    },
    { totalBeans: 0, totalCoins: 0, count: 0 },
  );

  return { host, daily, totals };
}

// ── Daily Analytics ────────────────────────────────────────────────────────────

/**
 * Returns per-day host bean income and agent commission for the last N days.
 * Always returns exactly `days` entries (zero-filled) with the oldest first.
 */
export async function getAgencyDailyAnalytics(agentId: string, days: number) {
  if (days < 1 || days > 365)
    throw new AppError("days must be between 1 and 365", 400);

  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true },
  });
  if (!agent) throw new AppError("Agent not found", 404);
  if (agent.role !== "agent") throw new AppError("User is not an agent", 403);

  // Host ids + wallet ids
  const hosts = await prisma.user.findMany({
    where: { agentId },
    select: { id: true },
  });
  const hostIds = hosts.map((h) => h.id);
  const hostWallets = hostIds.length
    ? await prisma.wallet.findMany({
        where: { userId: { in: hostIds } },
        select: { id: true },
      })
    : [];
  const hostWalletIds = hostWallets.map((w) => w.id);

  // Agent's own wallet
  const agentWallet = await prisma.wallet.findUnique({
    where: { userId: agentId },
    select: { id: true },
  });

  // Window boundaries — use UTC midnight so bucket keys match transaction UTC dates
  const now = new Date();
  const endExclusive = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const windowStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1 - days,
    ),
  );

  // Pull raw transactions in window (small number of rows per day; cheaper than N aggregate queries)
  const hostBeanTxs = hostWalletIds.length
    ? await prisma.walletTransaction.findMany({
        where: {
          walletId: { in: hostWalletIds },
          currency: "beans",
          transactionType: "credit",
          reference: "gift_received",
          createdAt: { gte: windowStart, lt: endExclusive },
        },
        select: { amount: true, createdAt: true },
      })
    : [];

  const commissionTxs = agentWallet
    ? await prisma.walletTransaction.findMany({
        where: {
          walletId: agentWallet.id,
          currency: "beans",
          transactionType: "credit",
          reference: "gift_commission",
          createdAt: { gte: windowStart, lt: endExclusive },
        },
        select: { amount: true, createdAt: true },
      })
    : [];

  // Bucket by YYYY-MM-DD (UTC)
  const bucket: Record<string, { hostBeans: number; commission: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(windowStart.getTime() + i * 86_400_000);
    bucket[d.toISOString().split("T")[0]] = { hostBeans: 0, commission: 0 };
  }
  for (const tx of hostBeanTxs) {
    const key = tx.createdAt.toISOString().split("T")[0];
    if (bucket[key]) bucket[key].hostBeans += Number(tx.amount);
  }
  for (const tx of commissionTxs) {
    const key = tx.createdAt.toISOString().split("T")[0];
    if (bucket[key]) bucket[key].commission += Number(tx.amount);
  }

  const daily = Object.entries(bucket)
    .map(([date, v]) => ({
      date,
      hostBeans: v.hostBeans,
      commission: v.commission,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { days, daily };
}

// ── My Agent Info (for hosts) ──────────────────────────────────────────────────

/**
 * Get agent info for a host.
 */
export async function getMyAgentInfo(hostId: string) {
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: { id: true, agentId: true },
  });
  if (!host) throw new AppError("User not found", 404);
  if (!host.agentId)
    throw new AppError("You are not assigned to an agent", 404);

  const agentUser = await prisma.user.findUnique({
    where: { id: host.agentId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      country: true,
      createdAt: true,
    },
  });
  if (!agentUser) throw new AppError("Agent not found", 404);

  const hostCount = await prisma.user.count({
    where: { agentId: host.agentId },
  });

  return { ...agentUser, totalHosts: hostCount };
}

// ── Agent Transactions (coin selling) ─────────────────────────────────────────

/**
 * Log an agent coin sale and credit coins to customer wallet.
 */
export async function logAgentSale(
  agentId: string,
  customerId: string,
  coinsSold: number,
  amountCollected: number,
  currency: string,
  notes: string,
) {
  if (coinsSold <= 0) throw new AppError("coinsSold must be positive");
  if (amountCollected <= 0)
    throw new AppError("amountCollected must be positive");

  const { assertActiveCurrency } = await import("../payments/currency.service");
  const rateRow = await assertActiveCurrency(currency);
  const normalizedCurrency = rateRow.currency;

  // Validate agent
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true },
  });
  if (!agent) throw new AppError("Agent not found", 404);
  if (agent.role !== "agent") throw new AppError("User is not an agent", 403);

  // Validate customer
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw new AppError("Customer not found", 404);

  // Create transaction record
  const agentTx = await prisma.agentTransaction.create({
    data: {
      agentId,
      customerId,
      coinsSold,
      amountCollected,
      currency: normalizedCurrency,
      notes,
    },
  });

  // Credit coins to customer wallet
  await creditCoins(
    customerId,
    coinsSold,
    "agent_sale",
    `${coinsSold.toLocaleString()} coins purchased from agent`,
  );

  return agentTx;
}

/**
 * Get paginated agent transaction history.
 */
export async function getAgentTransactions(
  agentId: string,
  page: number,
  limit: number,
) {
  const where = { agentId };
  const [items, total] = await Promise.all([
    prisma.agentTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
    }),
    prisma.agentTransaction.count({ where }),
  ]);

  return { items, total, page, limit, hasMore: page * limit < total };
}

// ── Owner commission-ledger ────────────────────────────────────────────────────

/**
 * List commission-ledger rows for the agency owned by callerUserId.
 * Delegates cursor pagination to listCommissionLedger (Task 2).
 */
export async function listOwnerCommissionLedger(input: {
  callerUserId: string;
  cursor?: string;
  limit?: number;
  from?: string;
  to?: string;
}) {
  const agency = await prisma.agency.findUnique({
    where: { ownerId: input.callerUserId },
  });
  if (!agency) throw new AppError("not_found", 404);
  return listCommissionLedger({
    agencyId: agency.id,
    cursor: input.cursor,
    limit: input.limit,
    from: input.from,
    to: input.to,
  });
}

// ── Agency Search ─────────────────────────────────────────────────────────────

export interface AgencySearchResult {
  id: string;
  name: string;
  owner: { displayName: string; hakaId: string | null };
}

export async function searchAgencies(q: string): Promise<AgencySearchResult[]> {
  const term = q.trim();
  if (!term) return [];

  const agencies = await prisma.agency.findMany({
    where: {
      status: "active",
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { owner: { displayName: { contains: term, mode: "insensitive" } } },
        { owner: { hakaId: { contains: term, mode: "insensitive" } } },
      ],
    },
    include: { owner: { select: { displayName: true, hakaId: true } } },
    take: 10,
    orderBy: { name: "asc" },
  });

  return agencies.map((a) => ({
    id: a.id,
    name: a.name,
    owner: { displayName: a.owner.displayName, hakaId: a.owner.hakaId },
  }));
}

/** Public bind list for Become Agent — searchable agents (agency owners). Includes owner id for `parentAgentId` on apply. */
export interface AgencyBindSearchResult {
  id: string;
  name: string;
  owner: {
    id: string;
    displayName: string;
    hakaId: string | null;
    avatar: string;
  };
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

type BindSearchOwnerRow = {
  id: string;
  displayName: string;
  hakaId: string | null;
  avatar: string;
  facePhotoUrl: string;
  faceVerificationStatus: string;
};

function mapBindSearchOwner(owner: BindSearchOwnerRow) {
  return {
    id: owner.id,
    displayName: owner.displayName,
    hakaId: owner.hakaId,
    avatar:
      owner.avatar.trim() ||
      (owner.faceVerificationStatus === "approved"
        ? owner.facePhotoUrl.trim()
        : ""),
  };
}

function mapAgencyToBindSearchResult(a: {
  id: string;
  name: string;
  owner: BindSearchOwnerRow;
}): AgencyBindSearchResult {
  return {
    id: a.id,
    name: a.name,
    owner: mapBindSearchOwner(a.owner),
  };
}

const BIND_SEARCH_OWNER_SELECT = {
  id: true,
  displayName: true,
  hakaId: true,
  avatar: true,
  facePhotoUrl: true,
  faceVerificationStatus: true,
} as const;

/** Agencies whose owners can receive sub-agent applications (excludes banned only). */
const BIND_SEARCH_AGENCY_WHERE = { status: { not: "banned" as const } };

const AGENCY_NAME_MAX_LEN = 100;
const AGENCY_NAME_SUFFIX = "'s Agency";

/** Read-only: existing non-banned agency for an agent owner (bind-search / browse). */
export async function getExistingBindableAgencyForOwner(ownerId: string) {
  return prisma.agency.findFirst({
    where: { ownerId, ...BIND_SEARCH_AGENCY_WHERE },
    include: { owner: { select: BIND_SEARCH_OWNER_SELECT } },
  });
}

/** Load or create a bindable agency for an agent owner (fixes role=agent without Agency row). */
export async function loadBindableAgencyForOwner(ownerId: string) {
  const existing = await getExistingBindableAgencyForOwner(ownerId);
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, displayName: true },
  });
  if (!user || user.role !== "agent") return null;

  const baseName = user.displayName.trim() || "Agent";
  const maxBase = AGENCY_NAME_MAX_LEN - AGENCY_NAME_SUFFIX.length;
  const trimmedBase =
    baseName.length > maxBase ? baseName.slice(0, maxBase) : baseName;
  const name = `${trimmedBase}${AGENCY_NAME_SUFFIX}`;

  return prisma.$transaction(async (tx) => {
    await tx.wallet.upsert({
      where: { userId: ownerId },
      create: { userId: ownerId },
      update: {},
    });
    return tx.agency.create({
      data: {
        name,
        ownerId,
        status: "active",
      },
      include: { owner: { select: BIND_SEARCH_OWNER_SELECT } },
    });
  });
}

/** Ensures an agent user has a bindable agency (idempotent). Used after admin role promotion. */
export async function ensureAgencyForAgentOwner(userId: string): Promise<void> {
  await loadBindableAgencyForOwner(userId);
}

function mergeBindSearchResults(
  ...groups: AgencyBindSearchResult[][]
): AgencyBindSearchResult[] {
  const seen = new Set<string>();
  const merged: AgencyBindSearchResult[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

/** OR clause for exact agent lookup (Haka ID is case-insensitive). */
function ownerIdentifierOr(term: string) {
  return [
    { id: term },
    { username: term },
    { hakaId: { equals: term, mode: "insensitive" as const } },
  ];
}

/** Exact agent match by User UUID, Haka ID, or username (any non-banned agency). */
async function findAgencyByOwnerIdentifier(
  term: string,
): Promise<AgencyBindSearchResult | null> {
  const user = await prisma.user.findFirst({
    where: {
      OR: ownerIdentifierOr(term),
    },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "agent") return null;

  const agency = await getExistingBindableAgencyForOwner(user.id);
  if (!agency) return null;

  return mapAgencyToBindSearchResult(agency);
}

/** Fuzzy match on agent users (role agent) who already own a bindable agency. */
async function findAgenciesByAgentProfileSearch(
  term: string,
): Promise<AgencyBindSearchResult[]> {
  const agentOr: Array<Record<string, unknown>> = [
    { displayName: { contains: term, mode: "insensitive" as const } },
    { username: { contains: term, mode: "insensitive" as const } },
    { hakaId: { contains: term, mode: "insensitive" as const } },
  ];
  if (looksLikeUuid(term)) {
    agentOr.unshift({ id: term });
  }

  const agents = await prisma.user.findMany({
    where: { role: "agent", OR: agentOr },
    select: { id: true },
    take: 25,
  });
  if (agents.length === 0) return [];

  const agencies = await prisma.agency.findMany({
    where: {
      ownerId: { in: agents.map((a) => a.id) },
      ...BIND_SEARCH_AGENCY_WHERE,
    },
    include: { owner: { select: BIND_SEARCH_OWNER_SELECT } },
    orderBy: { name: "asc" },
  });

  return agencies.map(mapAgencyToBindSearchResult);
}

export async function bindSearchAgencies(
  q: string,
): Promise<AgencyBindSearchResult[]> {
  const term = q.trim();
  if (!term) {
    const agencies = await prisma.agency.findMany({
      where: BIND_SEARCH_AGENCY_WHERE,
      include: { owner: { select: BIND_SEARCH_OWNER_SELECT } },
      take: 50,
      orderBy: { name: "asc" },
    });
    return agencies.map(mapAgencyToBindSearchResult);
  }

  const orClause: Array<Record<string, unknown>> = [
    { name: { contains: term, mode: "insensitive" as const } },
    {
      owner: { displayName: { contains: term, mode: "insensitive" as const } },
    },
    { owner: { username: { contains: term, mode: "insensitive" as const } } },
  ];
  if (!/^\d+$/.test(term)) {
    orClause.push({
      owner: { hakaId: { contains: term, mode: "insensitive" as const } },
    });
  }
  if (looksLikeUuid(term)) {
    orClause.unshift({ id: term }, { owner: { id: term } });
  }
  const where = { ...BIND_SEARCH_AGENCY_WHERE, OR: orClause };

  const agencies = await prisma.agency.findMany({
    where,
    include: {
      owner: { select: BIND_SEARCH_OWNER_SELECT },
    },
    take: 25,
    orderBy: { name: "asc" },
  });

  const byAgency = agencies.map(mapAgencyToBindSearchResult);

  const [exact, byAgent] = await Promise.all([
    findAgencyByOwnerIdentifier(term),
    findAgenciesByAgentProfileSearch(term),
  ]);

  return mergeBindSearchResults(
    exact ? [exact] : [],
    byAgent,
    byAgency,
  );
}

/** Exact lookup for Become Agent when user has a specific parent agent ID. */
export async function lookupParentAgent(
  raw: string,
): Promise<AgencyBindSearchResult> {
  const term = raw.trim();
  if (!term) throw new AppError("Agent ID is required", 400);

  const user = await prisma.user.findFirst({
    where: {
      OR: ownerIdentifierOr(term),
    },
    select: { id: true, role: true },
  });
  if (!user) throw new AppError("Agent not found", 404);
  if (user.role !== "agent") {
    throw new AppError("User is not an agent", 400);
  }

  const agency = await loadBindableAgencyForOwner(user.id);
  if (!agency) {
    throw new AppError("Unable to bind to this agent", 400);
  }
  return mapAgencyToBindSearchResult(agency);
}

export async function listLearnPromotions() {
  return prisma.agencyLearnPromotion.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      imageUrl: true,
      title: true,
      description: true,
      linkUrl: true,
      viewCount: true,
      likeCount: true,
      tag: true,
    },
  });
}

/** Single round-trip payload for Agency Center initial load. */
export async function getCenterBootstrap(agentId: string) {
  const { getBalance } = await import('../wallet/wallet.service');
  const [summaryV2, roster, wallet] = await Promise.all([
    getAgencySummary(agentId),
    getHostRoster(agentId, 1, 50),
    getBalance(agentId),
  ]);
  return {
    summaryV2,
    hosts: roster.items,
    wallet,
  };
}
