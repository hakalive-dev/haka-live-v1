import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/prisma";
import { AppError } from "../../middleware/error.middleware";
import { addRichXp } from "../levels/levels.service";
import { createAdminNotification } from "../admin/notifications/admin-notifications.service";
import { creditCoinsInTx, getOrCreateWallet } from "../wallet/wallet.service";
import { resolveUserId } from "../users/users.service";
import { assertNoRiskBlock } from "../../utils/risk-control";
import { getIO } from "../../sockets";
import { insertServerDirectMessage } from "../chat/chat.service";
import { scheduleWalletCoinsNotify } from "../chat/haka-team-coins-notify.service";
import { mergeAndRank, getActiveHouseEntries } from "../leaderboard/house-entries.service";
import { getHakaTeamUserId } from "../../constants/haka-team";
import { isSellerRechargePaymentMethod } from "./payments-config";
import { sumRollingAgencyTurnoverCoins } from "../gifts/rolling-agency-income";
import { emitAdminDataChanged } from "../../sockets/admin-realtime";
import { notifyAccountAlert } from "../notifications/notifications.service";

const COINS_PER_USD = 10_000;
const MIN_RECHARGE_USD = 10;
const SELLER_EXCHANGE_TX_TIMEOUT_MS = 15_000;

/**
 * Debit wallet beans, credit coin seller offline balance, record coin seller exchange — must run inside prisma.$transaction.
 */
export async function applySellerPointsExchangeWithinTx(
  tx: Prisma.TransactionClient,
  params: {
    sellerId: string;
    pointsAmount: number;
    exchangeRequestId: string;
    coinSellerTransactionNotes?: string;
  },
): Promise<{ newBeanBalance: number; newSellerBalance: number }> {
  const { sellerId, pointsAmount, exchangeRequestId } = params;
  const notes =
    params.coinSellerTransactionNotes ??
    `Points exchange approved (request ${exchangeRequestId})`;

  const [wallet] = await tx.$queryRaw<
    Array<{ id: string; beanBalance: bigint }>
  >`
    SELECT id, "beanBalance" FROM wallets WHERE "userId" = ${sellerId} FOR UPDATE
  `;
  if (!wallet) throw new AppError("Wallet not found", 404);

  const pointsAmountBig = BigInt(pointsAmount);

  if (wallet.beanBalance < pointsAmountBig)
    throw new AppError("Insufficient beans", 400);

  const newBean = wallet.beanBalance - pointsAmountBig;
  const newBeanNum = Number(newBean);
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { beanBalance: newBeanNum },
  });

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      transactionType: "debit",
      currency: "beans",
      amount: pointsAmount,
      balanceAfter: newBeanNum,
      reference: "seller_exchange",
      description: `Point exchange to seller coins (${pointsAmount.toLocaleString()} pts, request ${exchangeRequestId})`,
    },
  });

  const profile = await tx.coinSellerProfile.upsert({
    where: { userId: sellerId },
    create: {
      userId: sellerId,
      availableBalance: pointsAmount,
      totalBalance: pointsAmount,
    },
    update: {
      availableBalance: { increment: pointsAmount },
      totalBalance: { increment: pointsAmount },
    },
  });

  await tx.coinSellerTransaction.create({
    data: {
      sellerId,
      transactionType: "exchange",
      coinsAmount: pointsAmount,
      notes,
    },
  });

  return {
    newBeanBalance: newBeanNum,
    newSellerBalance: Number(profile.availableBalance),
  };
}

/** Preset tiers (USD). Grid order: 50|100|200 / 300|400|500 / 600|1000|2000 — coins = USD × COINS_PER_USD */
const RECHARGE_PACKAGES: {
  id: string;
  amountUsd: number;
  coinsToCredit: number;
}[] = [
  { id: "pkg_50", amountUsd: 50, coinsToCredit: 500_000 },
  { id: "pkg_100", amountUsd: 100, coinsToCredit: 1_000_000 },
  { id: "pkg_200", amountUsd: 200, coinsToCredit: 2_000_000 },
  { id: "pkg_300", amountUsd: 300, coinsToCredit: 3_000_000 },
  { id: "pkg_400", amountUsd: 400, coinsToCredit: 4_000_000 },
  { id: "pkg_500", amountUsd: 500, coinsToCredit: 5_000_000 },
  { id: "pkg_600", amountUsd: 600, coinsToCredit: 6_000_000 },
  { id: "pkg_1000", amountUsd: 1000, coinsToCredit: 10_000_000 },
  { id: "pkg_2000", amountUsd: 2000, coinsToCredit: 20_000_000 },
];

const userSnippet = {
  id: true,
  username: true,
  displayName: true,
  hakaId: true,
  avatar: true,
  activeSpecialId: true,
  activeSpecialIdLevel: true,
} as const;

export interface TierRates {
  totalCommissionRate: string;
  giftCommissionRate: string;
  incomeRewardRate: string;
  giftBonusRate: string;
}

export interface SellerRateCaps {
  max_commission_rate: string;
  max_income_reward_rate: string;
  max_gift_bonus_rate: string;
}

/** Socket + mobile: effective commission % strings after tier resolution. */
export interface SellerRatesSocketPayload extends SellerRateCaps {
  total_commission_rate: string;
  gift_commission_rate: string;
  income_reward_rate: string;
  gift_bonus_rate: string;
}

/**
 * Top-of-ladder caps shown beside "Max. xx%" on Coin Seller UI.
 */
export async function getSellerRateCaps(): Promise<SellerRateCaps> {
  const top = await prisma.coinSellerLevelRule.findFirst({
    orderBy: { minRollingCoins: "desc" },
  });
  if (!top) {
    return {
      max_commission_rate: "0.00",
      max_income_reward_rate: "0.00",
      max_gift_bonus_rate: "0.00",
    };
  }
  return {
    max_commission_rate: top.totalCommissionRate.toNumber().toFixed(2),
    max_income_reward_rate: top.incomeRewardRate.toNumber().toFixed(2),
    max_gift_bonus_rate: top.giftBonusRate.toNumber().toFixed(2),
  };
}

export async function buildSellerRatesSocketPayload(
  tierRates: TierRates,
): Promise<SellerRatesSocketPayload> {
  const caps = await getSellerRateCaps();
  return {
    total_commission_rate: tierRates.totalCommissionRate,
    gift_commission_rate: tierRates.giftCommissionRate,
    income_reward_rate: tierRates.incomeRewardRate,
    gift_bonus_rate: tierRates.giftBonusRate,
    ...caps,
  };
}

export interface SellerTierContext {
  tierRates: TierRates;
  rollingCoins: number;
  tier: {
    levelName: string;
    totalCommissionRate: { toNumber(): number };
    giftCommissionRate: { toNumber(): number };
    incomeRewardRate: { toNumber(): number };
    giftBonusRate: { toNumber(): number };
  } | null;
}

/** Rolling volume + qualifying tier + effective rates (profile override wins per field). */
export async function resolveSellerTierContext(
  profileRates: {
    totalCommissionRate: { toNumber(): number };
    giftCommissionRate: { toNumber(): number };
    incomeRewardRate: { toNumber(): number };
    giftBonusRate: { toNumber(): number };
  },
  userId: string,
  opts?: { giftTurnoverCoins?: number },
): Promise<SellerTierContext> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const agg = await prisma.coinSellerTransaction.aggregate({
    where: { sellerId: userId, createdAt: { gte: since } },
    _sum: { coinsAmount: true },
  });
  const transferRolling = Number(agg._sum.coinsAmount ?? 0);
  const giftRolling =
    opts?.giftTurnoverCoins ??
    (await rollingAgencyGiftTurnoverCoins(userId));
  const rollingCoins = transferRolling + giftRolling;
  // minRollingCoins is INT4; cap before query to avoid overflow for high-volume sellers.
  // Tier thresholds are admin-set and will never approach INT4 max, so capping is semantically safe.
  const rollingCoinsForQuery = Math.min(Math.floor(rollingCoins), 2147483647);

  const tiers = await prisma.coinSellerLevelRule.findMany({
    where: { minRollingCoins: { lte: rollingCoinsForQuery } },
    orderBy: { minRollingCoins: "desc" },
    take: 1,
  });
  const tier = tiers[0] ?? null;

  const pick = (
    stored: { toNumber(): number },
    tierVal: { toNumber(): number } | null,
  ) => {
    const s = stored.toNumber();
    if (s !== 0) return s.toFixed(2);
    if (tierVal) return tierVal.toNumber().toFixed(2);
    return "0.00";
  };

  const tierRates: TierRates = {
    totalCommissionRate: pick(
      profileRates.totalCommissionRate,
      tier?.totalCommissionRate ?? null,
    ),
    giftCommissionRate: pick(
      profileRates.giftCommissionRate,
      tier?.giftCommissionRate ?? null,
    ),
    incomeRewardRate: pick(
      profileRates.incomeRewardRate,
      tier?.incomeRewardRate ?? null,
    ),
    giftBonusRate: pick(
      profileRates.giftBonusRate,
      tier?.giftBonusRate ?? null,
    ),
  };

  return { tierRates, rollingCoins, tier };
}

/**
 * Persist tier ladder rates onto the profile for fields still at 0 (no admin override).
 * Updates sellerLevel to match the qualifying tier name. Returns effective rates after sync.
 */
export async function syncCoinSellerProfileRatesFromTier(
  userId: string,
  opts?: { giftTurnoverCoins?: number; tx?: Prisma.TransactionClient },
): Promise<{ updated: boolean; tierRates: TierRates }> {
  const db = opts?.tx ?? prisma;
  const profile = await db.coinSellerProfile.findUnique({ where: { userId } });
  if (!profile) {
    return {
      updated: false,
      tierRates: {
        totalCommissionRate: "0.00",
        giftCommissionRate: "0.00",
        incomeRewardRate: "0.00",
        giftBonusRate: "0.00",
      },
    };
  }

  const { tierRates, tier } = await resolveSellerTierContext(
    profile,
    userId,
    opts,
  );

  const data: Prisma.CoinSellerProfileUpdateInput = {};

  const syncField = (
    key:
      | "totalCommissionRate"
      | "giftCommissionRate"
      | "incomeRewardRate"
      | "giftBonusRate",
    stored: { toNumber(): number },
    tierVal: { toNumber(): number } | undefined,
  ) => {
    if (stored.toNumber() !== 0) return;
    data[key] = tierVal?.toNumber() ?? 0;
  };

  syncField(
    "totalCommissionRate",
    profile.totalCommissionRate,
    tier?.totalCommissionRate,
  );
  syncField(
    "giftCommissionRate",
    profile.giftCommissionRate,
    tier?.giftCommissionRate,
  );
  syncField(
    "incomeRewardRate",
    profile.incomeRewardRate,
    tier?.incomeRewardRate,
  );
  syncField("giftBonusRate", profile.giftBonusRate, tier?.giftBonusRate);

  if (tier?.levelName && profile.sellerLevel !== tier.levelName) {
    data.sellerLevel = tier.levelName;
  }

  if (Object.keys(data).length > 0) {
    await db.coinSellerProfile.update({ where: { userId }, data });
  }

  return { updated: Object.keys(data).length > 0, tierRates };
}

/** Push resolved commission % to the seller's app (Coin Seller screen). */
export async function emitSellerRatesUpdatedForUser(userId: string): Promise<void> {
  const profile = await prisma.coinSellerProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const { tierRates } = await syncCoinSellerProfileRatesFromTier(userId);
  const payload = await buildSellerRatesSocketPayload(tierRates);
  getIO().to(`user:${userId}`).emit("seller:rates_updated", payload);
}

async function rollingAgencyGiftTurnoverCoins(userId: string): Promise<number> {
  const agency = await prisma.agency.findFirst({
    where: { ownerId: userId },
    select: { id: true, ownerId: true, createdAt: true },
  });
  if (!agency) return 0;
  const sum = await sumRollingAgencyTurnoverCoins(prisma, {
    agencyId: agency.id,
    agentOwnerId: agency.ownerId,
    windowEnd: new Date(),
    windowStartNotBefore: agency.createdAt,
  });
  return Number(sum);
}

/**
 * Resolves commission rates for a seller from the tier ladder.
 * Rolling volume = 30d coin-seller transfers + 30d agency-attributed gift coin turnover.
 * If a stored profile rate is non-zero it takes precedence (admin override).
 */
export async function resolveSellerTierRates(
  profileRates: {
    totalCommissionRate: { toNumber(): number };
    giftCommissionRate: { toNumber(): number };
    incomeRewardRate: { toNumber(): number };
    giftBonusRate: { toNumber(): number };
  },
  userId: string,
  opts?: { giftTurnoverCoins?: number },
): Promise<TierRates> {
  const { tierRates } = await resolveSellerTierContext(
    profileRates,
    userId,
    opts,
  );
  return tierRates;
}

/** Transfers that count as a retail customer (user wallet), not seller-to-seller stock. */
function customerTransferWhere(sellerId: string) {
  return {
    sellerId,
    transactionType: "transfer" as const,
    targetType: "user",
    counterpartyId: { not: sellerId },
  };
}

/** Distinct end-users who bought coins via transfer (matches getCustomers). */
export async function countUniqueCustomers(sellerId: string): Promise<number> {
  const groups = await prisma.coinSellerTransaction.groupBy({
    by: ["counterpartyId"],
    where: customerTransferWhere(sellerId),
  });
  return groups.length;
}

/** Batch customer counts for public seller listings. */
async function countUniqueCustomersBySeller(
  sellerIds: string[],
): Promise<Map<string, number>> {
  const map = new Map(sellerIds.map((id) => [id, 0]));
  if (sellerIds.length === 0) return map;
  const groups = await prisma.coinSellerTransaction.groupBy({
    by: ["sellerId", "counterpartyId"],
    where: {
      sellerId: { in: sellerIds },
      transactionType: "transfer",
      targetType: "user",
      NOT: { counterpartyId: { in: sellerIds } },
    },
  });
  for (const g of groups) {
    map.set(g.sellerId, (map.get(g.sellerId) ?? 0) + 1);
  }
  return map;
}

function formatProfile(p: {
  id: string;
  userId: string;
  whatsappNumber: string;
  isAssistant: boolean;
  totalCommissionRate: { toNumber(): number };
  giftCommissionRate: { toNumber(): number };
  incomeRewardRate: { toNumber(): number };
  giftBonusRate: { toNumber(): number };
  levelUpRate: { toNumber(): number };
  availableBalance: bigint;
  totalBalance: bigint;
  securityDeposit: bigint;
  sellerLevel: string;
  quickMessage: string;
  totalCoinsSold: bigint;
  user: {
    id: string;
    username: string | null;
    displayName: string;
    hakaId: string | null;
    avatar: string;
  };
}, tierRates: TierRates, caps: SellerRateCaps, totalCustomers: number) {
  return {
    id: p.id,
    user: {
      id: p.user.id,
      username: p.user.username ?? "",
      displayName: p.user.displayName,
      hakaId: p.user.hakaId ?? "",
      avatar: p.user.avatar,
    },
    whatsapp_number: p.whatsappNumber,
    is_assistant: p.isAssistant,
    total_commission_rate: tierRates.totalCommissionRate,
    gift_commission_rate: tierRates.giftCommissionRate,
    income_reward_rate: tierRates.incomeRewardRate,
    gift_bonus_rate: tierRates.giftBonusRate,
    max_commission_rate: caps.max_commission_rate,
    max_income_reward_rate: caps.max_income_reward_rate,
    max_gift_bonus_rate: caps.max_gift_bonus_rate,
    level_up_rate: p.levelUpRate.toNumber().toFixed(2),
    available_balance: Number(p.availableBalance),
    total_balance: Number(p.totalBalance),
    security_deposit: Number(p.securityDeposit),
    seller_level: p.sellerLevel,
    quick_message: p.quickMessage,
    total_coins_sold: Number(p.totalCoinsSold),
    total_customers: totalCustomers,
    payment_methods: [],
  };
}

function userSnippetPublic(u: {
  id: string;
  username: string | null;
  displayName: string;
  hakaId: string | null;
  avatar?: string | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
}) {
  return {
    id: u.id,
    username: u.username ?? "",
    displayName: u.displayName,
    hakaId: u.hakaId ?? "",
    avatar: u.avatar ?? "",
    activeSpecialId: u.activeSpecialId ?? null,
    activeSpecialIdLevel: u.activeSpecialIdLevel ?? null,
  };
}

function formatTx(tx: {
  id: string;
  transactionType: string;
  targetType: string;
  coinsAmount: bigint;
  operatorName: string;
  notes: string;
  createdAt: Date;
  seller: {
    id: string;
    username: string | null;
    displayName: string;
    hakaId: string | null;
    avatar?: string | null;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  };
  counterparty: {
    id: string;
    username: string | null;
    displayName: string;
    hakaId: string | null;
    avatar?: string | null;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  } | null;
}) {
  return {
    id: tx.id,
    seller: userSnippetPublic(tx.seller),
    counterparty: tx.counterparty ? userSnippetPublic(tx.counterparty) : null,
    transaction_type: tx.transactionType,
    target_type: tx.targetType,
    coins_amount: Number(tx.coinsAmount),
    operator_name: tx.operatorName,
    notes: tx.notes,
    created_at: tx.createdAt.toISOString(),
  };
}

/** Socket toast, FCM (via DM push), and Haka Team DM after admin approves a seller recharge. */
export async function notifySellerRechargeApproved(opts: {
  sellerId: string;
  rechargeId: string;
  coinsAdded: number;
  amountUsd: number;
  newBalance: number;
}): Promise<void> {
  const { sellerId, rechargeId, coinsAdded, amountUsd, newBalance } = opts;

  try {
    const io = getIO();
    io.to(`user:${sellerId}`).emit("seller:recharge_approved", {
      rechargeId,
      coinsAdded,
      amountUsd,
      newBalance,
    });
    io.to(`user:${sellerId}`).emit("seller:stats_updated");
  } catch {
    // Socket.io not initialised (e.g. tests)
  }

  const lines = [
    `Your $${amountUsd.toFixed(2)} recharge was approved.`,
    `${coinsAdded.toLocaleString()} coins were added to your coin seller balance.`,
  ];
  if (newBalance > 0) {
    lines.push(`New balance: ${newBalance.toLocaleString()} coins.`);
  }
  const content = lines.join("\n");

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: sellerId,
    content,
    messageType: "seller_recharge_approved",
  }).catch(() => {});

  const pushPreview = content.split("\n")[0] ?? content;

  void notifyAccountAlert(
    sellerId,
    "seller_recharge_approved",
    "Recharge approved",
    pushPreview,
    {
      rechargeId,
      senderId: getHakaTeamUserId(),
      messageType: "seller_recharge_approved",
      open: "haka_team_dm",
    },
  ).catch(() => {});

  emitAdminDataChanged("seller_recharges", { rechargeId, status: "approved" });
}

export const coinSellerService = {
  async getOrCreateProfile(userId: string) {
    // Read first — avoid a blind upsert write on every call
    let profile = await prisma.coinSellerProfile.findUnique({
      where: { userId },
      include: { user: { select: userSnippet } },
    });
    if (!profile) {
      await prisma.coinSellerProfile.create({ data: { userId } });
      profile = await prisma.coinSellerProfile.findUniqueOrThrow({
        where: { userId },
        include: { user: { select: userSnippet } },
      });
    }
    const [tierRates, caps, totalCustomers] = await Promise.all([
      resolveSellerTierRates({
        totalCommissionRate: profile.totalCommissionRate,
        giftCommissionRate: profile.giftCommissionRate,
        incomeRewardRate: profile.incomeRewardRate,
        giftBonusRate: profile.giftBonusRate,
      }, userId),
      getSellerRateCaps(),
      countUniqueCustomers(userId),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return formatProfile(profile as any, tierRates, caps, totalCustomers);
  },

  async updateProfile(
    userId: string,
    data: { whatsapp_number?: string; is_assistant?: boolean },
  ) {
    const profile = await prisma.coinSellerProfile.update({
      where: { userId },
      data: {
        ...(data.whatsapp_number !== undefined && {
          whatsappNumber: data.whatsapp_number,
        }),
        ...(data.is_assistant !== undefined && {
          isAssistant: data.is_assistant,
        }),
      },
      include: { user: { select: userSnippet } },
    });
    const [tierRates, caps, totalCustomers] = await Promise.all([
      resolveSellerTierRates(profile, userId),
      getSellerRateCaps(),
      countUniqueCustomers(userId),
    ]);
    return formatProfile(profile, tierRates, caps, totalCustomers);
  },

  async getBalance(userId: string) {
    const p = await prisma.coinSellerProfile.findUnique({ where: { userId } });
    if (!p)
      return { available_balance: 0, total_balance: 0, security_deposit: 0 };
    return {
      available_balance: p.availableBalance,
      total_balance: p.totalBalance,
      security_deposit: p.securityDeposit,
    };
  },

  /** Profile + optional agency summary + app wallet — one request for Coin Seller screen. */
  async getBootstrap(userId: string, userRole: string) {
    const { getBalance: getWalletBalance } = await import('../wallet/wallet.service');
    const [profile, wallet] = await Promise.all([
      this.getOrCreateProfile(userId),
      getWalletBalance(userId),
    ]);
    let agencySummary: Awaited<
      ReturnType<typeof import('../agency/agency.service').getAgencySummary>
    > | null = null;
    if (userRole === 'agent') {
      try {
        const { getAgencySummary } = await import('../agency/agency.service');
        agencySummary = await getAgencySummary(userId);
      } catch {
        agencySummary = null;
      }
    }
    return { profile, agencySummary, wallet };
  },

  async transfer(
    sellerId: string,
    targetIdentifier: string,
    coinsAmount: number,
    targetType: string,
  ) {
    if (coinsAmount <= 0) throw new AppError("Invalid coins amount", 400);
    const profile = await prisma.coinSellerProfile.findUnique({
      where: { userId: sellerId },
    });
    if (!profile || profile.availableBalance < coinsAmount)
      throw new AppError("Insufficient balance", 400);

    let targetUserId: string;
    try {
      targetUserId = await resolveUserId(targetIdentifier);
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 404)
        throw new AppError("User not found", 404);
      throw e;
    }

    if (targetUserId === sellerId && targetType === "coin_seller") {
      throw new AppError("Cannot transfer to your own seller balance", 400);
    }

    if (targetType === "coin_seller") {
      const targetSellerProfile = await prisma.coinSellerProfile.findUnique({
        where: { userId: targetUserId },
      });
      if (!targetSellerProfile) throw new AppError("Target is not a coin seller", 400);
    }

    let recipientNewBalance: number | null = null;
    const tx = await prisma.$transaction(async (t) => {
      await t.coinSellerProfile.update({
        where: { userId: sellerId },
        data: {
          availableBalance: { decrement: coinsAmount },
          totalCoinsSold: { increment: coinsAmount },
        },
      });

      if (targetType === "coin_seller") {
        // Coin seller → coin seller: credit target's existing seller balance only
        await t.coinSellerProfile.update({
          where: { userId: targetUserId },
          data: {
            availableBalance: { increment: coinsAmount },
            totalBalance: { increment: coinsAmount },
          },
        });
      } else {
        // Coin seller → user: credit target's wallet + award Rich XP (paid recharge)
        const wallet = await creditCoinsInTx(
          t,
          targetUserId,
          coinsAmount,
          "coin_seller_transfer",
          "Coins purchased from seller",
        );
        recipientNewBalance = Number(wallet.coinBalance);
        await addRichXp(targetUserId, coinsAmount, t);
      }

      return t.coinSellerTransaction.create({
        data: {
          sellerId,
          counterpartyId: targetUserId,
          transactionType: "transfer",
          targetType,
          coinsAmount,
          operatorName: "",
          notes: "",
        },
        include: {
          seller: { select: userSnippet },
          counterparty: { select: userSnippet },
        },
      });
    });

    if (sellerId !== targetUserId) {
      scheduleWalletCoinsNotify({
        userId: targetUserId,
        coinsAmount,
        newBalance: recipientNewBalance ?? 0,
        reference: "coin_seller_transfer",
        description: "Coins purchased from seller",
        notifyMeta: {
          targetType,
          transactionId: tx.id,
          sellerName: tx.seller.displayName ?? tx.seller.username ?? null,
          sellerHakaId: tx.seller.activeSpecialId ?? tx.seller.hakaId ?? null,
        },
      });
    }

    try {
      await syncCoinSellerProfileRatesFromTier(sellerId);
      getIO().to(`user:${sellerId}`).emit("seller:stats_updated");
      await emitSellerRatesUpdatedForUser(sellerId);
    } catch {
      // Socket.io not yet initialised (e.g. test env)
    }

    return formatTx(tx);
  },

  async recharge(sellerId: string, coinsAmount: number) {
    if (coinsAmount <= 0) throw new AppError("Invalid coins amount", 400);
    const tx = await prisma.$transaction(async (t) => {
      await t.coinSellerProfile.update({
        where: { userId: sellerId },
        data: {
          availableBalance: { increment: coinsAmount },
          totalBalance: { increment: coinsAmount },
        },
      });
      return t.coinSellerTransaction.create({
        data: {
          sellerId,
          transactionType: "recharge",
          coinsAmount,
        },
        include: {
          seller: { select: userSnippet },
          counterparty: { select: userSnippet },
        },
      });
    });
    return formatTx(tx);
  },

  /**
   * Exchange wallet beans into seller offline coin balance in one transaction (no admin approval).
   */
  async submitExchangeRequest(sellerId: string, pointsAmount: number) {
    if (pointsAmount <= 0) throw new AppError("Invalid amount", 400);
    await assertNoRiskBlock(sellerId, "freezeBeans");
    const wallet = await getOrCreateWallet(sellerId);
    if (wallet.beanBalance < pointsAmount)
      throw new AppError("Insufficient points", 400);

    const { row, newBeanBalance, newSellerBalance } = await prisma.$transaction(
      async (tx) => {
        const created = await tx.sellerExchangeRequest.create({
          data: { sellerId, pointsAmount: BigInt(pointsAmount), status: "pending" },
        });
        const balances = await applySellerPointsExchangeWithinTx(tx, {
          sellerId,
          pointsAmount,
          exchangeRequestId: created.id,
          coinSellerTransactionNotes: `Points exchange (request ${created.id})`,
        });
        await tx.sellerExchangeRequest.update({
          where: { id: created.id },
          data: {
            status: "approved",
            processedAt: new Date(),
            processedById: null,
          },
        });
        const row = await tx.sellerExchangeRequest.findUnique({
          where: { id: created.id },
          include: { seller: { select: userSnippet } },
        });
        return {
          row,
          newBeanBalance: balances.newBeanBalance,
          newSellerBalance: balances.newSellerBalance,
        };
      },
      { timeout: SELLER_EXCHANGE_TX_TIMEOUT_MS },
    );

    if (!row) throw new AppError("Exchange failed", 500);

    try {
      const io = getIO();
      io.to(`user:${sellerId}`).emit("seller:exchange_approved", {
        exchangeId: row.id,
        pointsAmount,
        newSellerBalance,
        newBeanBalance,
        silent: true,
      });
      io.to(`user:${sellerId}`).emit("seller:stats_updated");
    } catch {
      // Socket.io not yet initialised (e.g. test env)
    }

    return row;
  },

  async getMyExchangeRequests(sellerId: string) {
    return prisma.sellerExchangeRequest.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  },

  async getTransactions(sellerId: string, type?: string) {
    const where = type ? { sellerId, transactionType: type } : { sellerId };
    const txs = await prisma.coinSellerTransaction.findMany({
      where,
      include: {
        seller: { select: userSnippet },
        counterparty: { select: userSnippet },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return txs.map(formatTx);
  },

  async getCustomers(sellerId: string, type?: string) {
    const txs = await prisma.coinSellerTransaction.findMany({
      where: customerTransferWhere(sellerId),
      include: { counterparty: { select: { ...userSnippet } } },
      orderBy: { createdAt: "desc" },
    });

    const seen = new Map<string, { tradeCount: number; lastTradeAt: string }>();
    const latestTxByCounterparty = new Map<
      string,
      (typeof txs)[number]
    >();
    for (const tx of txs) {
      if (!tx.counterpartyId || !tx.counterparty) continue;
      const existing = seen.get(tx.counterpartyId);
      if (existing) {
        existing.tradeCount++;
        if (tx.createdAt > new Date(existing.lastTradeAt)) {
          existing.lastTradeAt = tx.createdAt.toISOString();
          latestTxByCounterparty.set(tx.counterpartyId, tx);
        }
      } else {
        seen.set(tx.counterpartyId, {
          tradeCount: 1,
          lastTradeAt: tx.createdAt.toISOString(),
        });
        latestTxByCounterparty.set(tx.counterpartyId, tx);
      }
    }

    const customers = Array.from(seen.entries()).map(([id, stats]) => {
      const tx = latestTxByCounterparty.get(id)!;
      return {
        id,
        displayName: tx.counterparty!.displayName,
        avatar: null,
        hakaId: tx.counterparty!.hakaId ?? "",
        customer_type: stats.tradeCount > 3 ? "old" : "recommend",
        trade_count: stats.tradeCount,
        last_trade_at: stats.lastTradeAt,
      };
    });

    if (type === "recommend")
      return customers.filter((c) => c.customer_type === "recommend");
    if (type === "old")
      return customers.filter((c) => c.customer_type === "old");
    return customers;
  },

  async getQuickMessage(userId: string) {
    const p = await prisma.coinSellerProfile.findUnique({ where: { userId } });
    return { quick_message: p?.quickMessage ?? "" };
  },

  async updateQuickMessage(userId: string, quickMessage: string) {
    await prisma.coinSellerProfile.upsert({
      where: { userId },
      create: { userId, quickMessage },
      update: { quickMessage },
    });
    return { quick_message: quickMessage };
  },

  async getLevelRules() {
    const rules = await prisma.coinSellerLevelRule.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return rules.map((r) => ({
      id: r.id,
      level_name: r.levelName,
      exchange_limit: r.exchangeLimit,
      seller_to_user_rate: r.sellerToUserRate,
      user_to_seller_rate: r.userToSellerRate,
      seller_list_rule: r.sellerListRule,
      coin_selling_list_rule: r.coinSellingListRule,
      sort_order: r.sortOrder,
    }));
  },

  getRechargePackages() {
    return RECHARGE_PACKAGES;
  },

  async getRechargePaymentInfo() {
    const keys = [
      "coin_seller_usdt_trc20",
      "coin_seller_usdt_bep20",
      "coin_seller_epay",
    ];
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const str = (key: string) => {
      const v = map[key];
      return typeof v === "string" ? v : v != null ? String(v) : "";
    };
    return {
      usdt_trc20: str("coin_seller_usdt_trc20"),
      usdt_bep20: str("coin_seller_usdt_bep20"),
      epay: str("coin_seller_epay"),
    };
  },

  async submitRechargeRequest(
    sellerId: string,
    amountUsd: number,
    paymentMethod: string,
    proofImageUrl: string,
    txHash?: string,
  ) {
    if (!isSellerRechargePaymentMethod(paymentMethod)) {
      throw new AppError(
        "Invalid payment method. Use epay, usdt_trc20, or usdt_bep20.",
        400,
      );
    }
    if (amountUsd < MIN_RECHARGE_USD)
      throw new AppError(`Minimum recharge amount is $${MIN_RECHARGE_USD}`, 400);

    const pkg = RECHARGE_PACKAGES.find((p) => p.amountUsd === amountUsd);
    const coinsToCredit = pkg
      ? pkg.coinsToCredit
      : Math.floor(amountUsd * COINS_PER_USD);

    const created = await prisma.sellerRechargeRequest.create({
      data: {
        sellerId,
        amountUsd: new Decimal(amountUsd),
        coinsToCredit,
        paymentMethod,
        proofImageUrl,
        txHash: txHash ?? "",
        status: "pending",
      },
      include: { seller: { select: userSnippet } },
    });

    await createAdminNotification({
      type: "seller_recharge_requested",
      title: "New seller recharge request",
      body: `${created.seller.displayName} · $${amountUsd} · ${paymentMethod}`,
      linkPath: "/seller-recharges",
      entityType: "SellerRechargeRequest",
      entityId: created.id,
    });

    return created;
  },

  async getMyRechargeRequests(sellerId: string) {
    return prisma.sellerRechargeRequest.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  },

  async listSellers(countryCode?: string) {
    const profiles = await prisma.coinSellerProfile.findMany({
      where: countryCode ? { countryCode } : undefined,
      orderBy: { totalCoinsSold: "desc" },
      take: 50,
      include: { user: { select: { ...userSnippet, avatar: true } } },
    });
    const customerCounts = await countUniqueCustomersBySeller(
      profiles.map((p) => p.userId),
    );
    return profiles.map((p) => ({
      id: p.user.id,
      profileId: p.id,
      displayName: p.user.displayName,
      avatar: p.user.avatar ?? null,
      hakaId: p.user.hakaId ?? "",
      whatsapp_number: p.whatsappNumber,
      total_coins_sold: p.totalCoinsSold,
      total_customers: customerCounts.get(p.userId) ?? 0,
      seller_level: p.sellerLevel,
      payment_methods: p.paymentMethods
        ? p.paymentMethods.split(",").filter(Boolean)
        : [],
      price_per_coin: p.pricePerCoin.toNumber(),
      country_code: p.countryCode,
    }));
  },

  async getLeaderboard() {
    const profiles = await prisma.coinSellerProfile.findMany({
      where: { user: { role: "agent" } },
      orderBy: { totalCoinsSold: "desc" },
      take: 50,
      include: { user: { select: userSnippet } },
    });
    const realItems = profiles.map((p, i) => ({
      rank: i + 1,
      score: Number(p.totalCoinsSold),
      id: p.user.id,
      username: p.user.username ?? null,
      displayName: p.user.displayName,
      avatar: p.user.avatar ?? null,
      hakaId: p.user.hakaId ?? null,
      activeSpecialId: p.user.activeSpecialId ?? null,
      activeSpecialIdLevel: p.user.activeSpecialIdLevel ?? null,
    }));

    // Blend in admin-seeded house entries (read-time only). Agent rewards no-op, so these are
    // display-only — they raise the visible bar without affecting any payout.
    const house = await getActiveHouseEntries("agent");
    if (house.length === 0) return realItems;

    const realById = new Map(realItems.map((r) => [r.id, r]));
    const { entries } = mergeAndRank(
      realItems.map((r) => ({ userId: r.id, score: r.score })),
      house,
      realItems.length + house.length,
    );
    const missingIds = entries.filter((e) => !realById.has(e.userId)).map((e) => e.userId);
    const extras = missingIds.length
      ? await prisma.user.findMany({ where: { id: { in: missingIds } }, select: userSnippet })
      : [];
    const extraById = new Map(extras.map((u) => [u.id, u]));

    return entries.map((e) => {
      const real = realById.get(e.userId);
      if (real) return { ...real, rank: e.rank, score: e.score };
      const u = extraById.get(e.userId);
      return {
        rank: e.rank,
        score: e.score,
        id: e.userId,
        username: u?.username ?? null,
        displayName: u?.displayName ?? "",
        avatar: u?.avatar ?? null,
        hakaId: u?.hakaId ?? null,
        activeSpecialId: u?.activeSpecialId ?? null,
        activeSpecialIdLevel: u?.activeSpecialIdLevel ?? null,
      };
    });
  },
};
