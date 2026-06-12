import { prisma } from "../../config/prisma";
import { redis } from "../../config/redis";
import { getIO } from "../../sockets";
import { AppError } from "../../middleware/error.middleware";
import { assertNoRiskBlock } from "../../utils/risk-control";
import { Prisma } from "@prisma/client";
import { addCharmXp } from "../levels/levels.service";
import {
  updateRichScore,
  updateCharmScore,
  updateGifterScore,
  updateEarnerScore,
  updateLuckyWinnerScore,
} from "../leaderboard/leaderboard.service";
import {
  userSummarySelect,
  serializeUserSummary,
  type UserSummary,
} from "../users/user-summary";
import { resolveTier } from "./tier-lookup";
import { resolveGiftBonusTier } from "./gift-bonus-tier-lookup";
import { resolveGiftBonusRateFromSetting } from "./gift-bonus-rate";
import { isGiftBonusProgramActive } from "./gift-bonus-program";
import {
  COMMISSION_ROLLING_DAYS,
  sumRollingAgencyHostIncome,
  sumRollingAgencyTurnoverCoins,
} from "./rolling-agency-income";
import { writeLedgerRow, type CommissionType } from "./commission-ledger";
import {
  resolveGiftRecipient,
  type GiftRecipientContext,
} from "./recipient-resolver";
import {
  isCommissionOverrideActiveAt,
  isGiftBonusOverrideActiveAt,
} from "./agency-override-validity";
import {
  buildSellerRatesSocketPayload,
  emitSellerRatesUpdatedForUser,
  syncCoinSellerProfileRatesFromTier,
  type TierRates,
} from "../payments/coinSeller.service";
import { isLuckyGiftCategory, MAX_GIFT_SEND_QTY } from "../../shared-types/gifts";
import { getLuckySetting } from "../lucky-gifts/lucky-setting";
import { runLuckyDraw, luckyReceiverBeans } from "../lucky-gifts/lucky-draw";
import {
  broadcastLuckyDraw,
  type LuckyDrawOutcome,
} from "../lucky-gifts/lucky-gifts.service";

const COMBO_WINDOW_SECONDS = 5;

/**
 * Increment the combo counter for the same sender+gift+recipient in a room,
 * resetting the TTL window to 5 seconds. Returns the new combo count (≥1).
 */
export async function bumpCombo(
  roomId: string,
  senderId: string,
  giftId: string,
  recipientId: string,
  qty = 1,
): Promise<number> {
  const key = `gift:combo:${roomId}:${senderId}:${giftId}:${recipientId}`;
  const [[, count]] = (await redis
    .multi()
    .incrby(key, qty)
    .expire(key, COMBO_WINDOW_SECONDS)
    .exec()) as [[unknown, number], [unknown, number]];
  return count;
}

const GIFT_SELECT = {
  id: true,
  name: true,
  icon: true,
  image: true,
  svgaAsset: true,
  coinCost: true,
  beanValue: true,
  category: true,
  animationType: true,
  soundKey: true,
  order: true,
};

/**
 * Get active gift catalogue, ordered by `order` field.
 */
export async function getCatalogue() {
  return prisma.gift.findMany({
    where: { isActive: true },
    select: GIFT_SELECT,
    orderBy: { order: "asc" },
  });
}

/**
 * Distinct gift types a user has received with total quantity (SUM of tx qty),
 * ordered by most-recent receipt per type, capped at `limit`.
 * Used for the profile gift gallery / wall.
 */
export async function getReceivedGiftGallery(userId: string, limit = 16) {
  const groups = await prisma.giftTransaction.groupBy({
    by: ["giftId"],
    where: { recipientId: userId },
    _sum: { qty: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: limit,
  });

  if (groups.length === 0) return [];

  const gifts = await prisma.gift.findMany({
    where: { id: { in: groups.map((g) => g.giftId) } },
    select: { id: true, name: true, icon: true, image: true },
  });
  const giftById = new Map(gifts.map((g) => [g.id, g]));

  return groups.flatMap((g) => {
    const gift = giftById.get(g.giftId);
    if (!gift || !g._max.createdAt) return [];
    return [
      {
        id: gift.id,
        name: gift.name,
        icon: gift.icon,
        image: gift.image ?? null,
        qty: g._sum.qty ?? 0,
        receivedAt: g._max.createdAt.toISOString(),
      },
    ];
  });
}

/** Minimal gift fields the room animation needs (GIFT_SELECT subset). */
export interface GiftAnimationGift {
  id: string;
  name: string;
  icon: string;
  image: string | null;
  svgaAsset: string | null;
  coinCost: number;
  beanValue: number;
  category: string;
  animationType: string;
  soundKey: string | null;
  order: number;
}

/**
 * Data handed to `onAnimationReady` so the caller can broadcast the gift
 * animation to room viewers BEFORE coins are deducted. Everything here is
 * already validated (gift active, recipient resolved, sender has the coins).
 */
export interface GiftAnimationData {
  gift: GiftAnimationGift;
  sender: UserSummary;
  recipient: UserSummary;
  recipientId: string;
  qty: number;
  roomId: string;
}

export interface GiftSendInput {
  senderId: string;
  giftId: string;
  qty?: number;
  roomId?: string | null;
  recipientId?: string;
  recipientAgencyId?: string;
  /**
   * Fired after cheap validation but BEFORE the deduction transaction, so room
   * viewers see the animation without waiting for coin processing. Only invoked
   * when `roomId` is set. The callback must not throw or block — fire and forget.
   */
  onAnimationReady?: (data: GiftAnimationData) => void;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function runGiftTransactionWithRetry<T>(
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const MAX_RETRIES = 2;
  let attempt = 0;
  while (true) {
    try {
      return await prisma.$transaction(fn, {
        timeout: 15_000,
        maxWait: 10_000,
      });
    } catch (err) {
      // P2034 = transaction serialization / write conflict
      // P2010 with pg code 40P01 = raw query deadlock (e.g. from $queryRaw FOR UPDATE)
      const isP2034 =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034";
      const isDeadlock =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2010" &&
        typeof (err.meta as Record<string, unknown> | undefined)?.code ===
          "string" &&
        ((err.meta as Record<string, string>).code === "40P01" ||
          (err.meta as Record<string, string>).code === "40001");
      const isSerialization = isP2034 || isDeadlock;
      // P2028 = transaction timed out (e.g. under heavy Render.com DB load)
      const isTimeout =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2028";
      // DB connection pool exhausted / engine not started
      const isConnInit = err instanceof Prisma.PrismaClientInitializationError;

      if (isTimeout)
        throw new AppError("Server is busy, please try again", 503);
      if (isConnInit)
        throw new AppError("Service temporarily unavailable", 503);

      if (!isSerialization || attempt >= MAX_RETRIES) {
        if (isSerialization) {
          throw new AppError("gift_send_contention", 503);
        }
        throw err;
      }
      attempt++;
      const delay = 10 + Math.floor(Math.random() * 10);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

interface PrecomputedDistributionRates {
  directRate: number;
  parentAgency: { id: string; ownerId: string } | null;
  parentDeltaRate: number;
  bonusRate: number;
  giftTurnoverCoins: number;
}

async function resolveDistributionRates(
  ctx: GiftRecipientContext,
  totalCoinCost: number,
): Promise<PrecomputedDistributionRates> {
  const rates: PrecomputedDistributionRates = {
    directRate: 0,
    parentAgency: null,
    parentDeltaRate: 0,
    bonusRate: 0,
    giftTurnoverCoins: 0,
  };

  if (!ctx.agency) return rates;

  const now = new Date();

  const rollingTurnover = await sumRollingAgencyTurnoverCoins(prisma, {
    agencyId: ctx.agency.id,
    agentOwnerId: ctx.agency.ownerId,
    windowEnd: now,
    rollingDays: COMMISSION_ROLLING_DAYS,
    windowStartNotBefore: ctx.agency.createdAt,
  });

  const directTierTurnoverCoins = rollingTurnover + BigInt(totalCoinCost);
  const useDirectOverride = isCommissionOverrideActiveAt({
    rateOverride: ctx.agency.commissionRateOverride,
    validUntil: ctx.agency.commissionRateOverrideValidUntil,
    at: now,
  });
  rates.directRate =
    useDirectOverride && ctx.agency.commissionRateOverride != null
      ? ctx.agency.commissionRateOverride
      : (await resolveTier(directTierTurnoverCoins)).commissionRate;

  // Reuse the same 30d rolling sum for coin seller tier sync.
  rates.giftTurnoverCoins = Number(rollingTurnover);

  if (ctx.agency.parentAgencyId) {
    const parentPre = await prisma.agency.findUniqueOrThrow({
      where: { id: ctx.agency.parentAgencyId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        commissionRateOverride: true,
        commissionRateOverrideValidUntil: true,
        createdAt: true,
      },
    });

    if (parentPre.status === "active") {
      const rollingParentTurnover = await sumRollingAgencyTurnoverCoins(
        prisma,
        {
          agencyId: parentPre.id,
          agentOwnerId: parentPre.ownerId,
          windowEnd: now,
          rollingDays: COMMISSION_ROLLING_DAYS,
          rollUpSubAgencyVolume: true,
          windowStartNotBefore: parentPre.createdAt,
        },
      );
      const parentTierTurnoverCoins =
        rollingParentTurnover + BigInt(totalCoinCost);
      const useParentOverride = isCommissionOverrideActiveAt({
        rateOverride:
          parentPre.commissionRateOverride == null
            ? null
            : Number(parentPre.commissionRateOverride),
        validUntil: parentPre.commissionRateOverrideValidUntil,
        at: now,
      });
      const parentRate =
        useParentOverride && parentPre.commissionRateOverride != null
          ? Number(parentPre.commissionRateOverride)
          : (await resolveTier(parentTierTurnoverCoins)).commissionRate;

      rates.parentAgency = { id: parentPre.id, ownerId: parentPre.ownerId };
      rates.parentDeltaRate = Math.max(0, parentRate - rates.directRate);
    }
  }

  if (ctx.destinationKind === "agency") {
    const [bonusSetting, tierRowCount, rollingIncome] = await Promise.all([
      prisma.giftBonusSetting.findUniqueOrThrow({ where: { id: "singleton" } }),
      prisma.giftBonusTier.count(),
      sumRollingAgencyHostIncome(prisma, {
        agencyId: ctx.agency.id,
        agentOwnerId: ctx.agency.ownerId,
        windowEnd: now,
        windowStartNotBefore: ctx.agency.createdAt,
      }),
    ]);
    const giftBonusTier =
      tierRowCount === 0 ? null : await resolveGiftBonusTier(rollingIncome);
    const useGiftBonusOverride = isGiftBonusOverrideActiveAt({
      rateOverride: ctx.agency.giftBonusRateOverride,
      validUntil: ctx.agency.giftBonusRateOverrideValidUntil,
      at: now,
    });
    rates.bonusRate = resolveGiftBonusRateFromSetting({
      globallyEnabled: bonusSetting.enabled,
      agencyEnabled: ctx.agency.giftBonusEnabled,
      fallbackBonusRate: Number(bonusSetting.bonusRate),
      tierRowCount,
      tierBonusRate: giftBonusTier?.bonusRate,
      overrideRate:
        ctx.agency.giftBonusRateOverride != null
          ? Number(ctx.agency.giftBonusRateOverride)
          : null,
      overrideActive: useGiftBonusOverride,
    });
  }

  return rates;
}

/**
 * Send a gift from sender to recipient (user OR agency).
 * 1. Resolves destination (user/agency, with agent-going-live rewrite)
 * 2. Pre-computes commission/bonus rates outside the transaction (heavy rolling SUM queries)
 * 3. Deducts coins from sender
 * 4. Creates GiftTransaction
 * 5. Distributes beans (via distributeBeans, using pre-computed rates)
 *
 * All wallet mutations inside a single prisma.$transaction with row-level locking.
 */
export async function sendGift(input: GiftSendInput) {
  const { senderId, giftId, qty = 1, roomId = null } = input;

  await assertNoRiskBlock(senderId, "freezeCoins", "disableGifts");

  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_GIFT_SEND_QTY) {
    throw new AppError(
      `qty must be an integer between 1 and ${MAX_GIFT_SEND_QTY}`,
      400,
    );
  }

  const gift = await prisma.gift.findUnique({ where: { id: giftId } });
  if (!gift || !gift.isActive)
    throw new AppError("Gift not found or unavailable", 404);

  const ctx = await resolveGiftRecipient({
    recipientId: input.recipientId,
    recipientAgencyId: input.recipientAgencyId,
  });
  if (ctx.hostUser.id === senderId) {
    throw new AppError("You can't send a gift to yourself", 400);
  }

  const totalCoinCost = gift.coinCost * qty;

  // Lucky gifts (Lucky-tab category) run a server-side win/lose draw — resolve
  // the cached game config up front. When active, the host's bean pool is the
  // small receiver % of gift value instead of the normal beanValue; using it as
  // `totalBeanValue` keeps distributeBeans, charm XP, leaderboards, and the
  // GiftTransaction row consistent without forking any distribution logic.
  const luckySetting = isLuckyGiftCategory(gift.category)
    ? await getLuckySetting()
    : null;
  const luckyActive = luckySetting?.enabled === true;
  const totalBeanValue =
    luckyActive && luckySetting
      ? luckyReceiverBeans(luckySetting, totalCoinCost)
      : gift.beanValue * qty;

  const giftSummary: GiftAnimationGift = {
    id: gift.id,
    name: gift.name,
    icon: gift.icon,
    image: gift.image,
    svgaAsset: gift.svgaAsset,
    coinCost: gift.coinCost,
    beanValue: gift.beanValue,
    category: gift.category,
    animationType: gift.animationType,
    soundKey: gift.soundKey,
    order: gift.order,
  };

  // Fetch the sender + recipient summaries and the sender's coin balance up
  // front so we can broadcast the animation to the room BEFORE the (slower)
  // commission-rate computation + deduction transaction. Coins are still
  // deducted atomically below — this only moves the *visual* broadcast earlier.
  const [senderSummaryRaw, recipientSummaryRaw, senderWalletPre] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: senderId },
        select: userSummarySelect(),
      }),
      prisma.user.findUnique({
        where: { id: ctx.giftTransaction.recipientId },
        select: userSummarySelect(),
      }),
      prisma.wallet.findUnique({
        where: { userId: senderId },
        select: { coinBalance: true },
      }),
    ]);
  if (!senderSummaryRaw || !recipientSummaryRaw) {
    throw new AppError("Wallet not found — please try again", 404);
  }
  // Cheap pre-check so we never broadcast an animation for a gift that will
  // fail on funds. The authoritative check still runs under FOR UPDATE below.
  if (
    !senderWalletPre ||
    Number(senderWalletPre.coinBalance) < totalCoinCost
  ) {
    throw new AppError("Insufficient coins", 400);
  }

  const senderSummary = serializeUserSummary(senderSummaryRaw);
  const recipientSummary = serializeUserSummary(recipientSummaryRaw);

  // Broadcast the gift animation now; deduction + bean distribution follow.
  if (roomId) {
    input.onAnimationReady?.({
      gift: giftSummary,
      sender: senderSummary,
      recipient: recipientSummary,
      recipientId: ctx.giftTransaction.recipientId,
      qty,
      roomId,
    });
  }

  const rates = await resolveDistributionRates(ctx, totalCoinCost);

  const result = await runGiftTransactionWithRetry(async (tx) => {
    // Batch-lock all known wallet rows in one round-trip, ordered by userId
    // to prevent deadlock between concurrent gift transactions to the same host.
    const walletOwnerIds = [
      ...new Set([
        senderId,
        ctx.hostUser.id,
        ...(ctx.agency?.ownerId ? [ctx.agency.ownerId] : []),
        ...(ctx.coinSeller ? [ctx.coinSeller.userId] : []),
      ]),
    ];
    const lockedWalletsRaw = await tx.$queryRaw<
      Array<{
        id: string;
        userId: string;
        coinBalance: bigint | number;
        beanBalance: bigint | number;
      }>
    >(
      Prisma.sql`SELECT id, "userId", "coinBalance", "beanBalance" FROM wallets WHERE "userId" IN (${Prisma.join(walletOwnerIds)}) ORDER BY "userId" FOR UPDATE`,
    );
    const lockedWallets = lockedWalletsRaw.map((w) => ({
      ...w,
      coinBalance: Number(w.coinBalance),
      beanBalance: Number(w.beanBalance),
    }));
    const walletMap = new Map(lockedWallets.map((w) => [w.userId, w]));

    const senderWallet = walletMap.get(senderId);
    if (!senderWallet)
      throw new AppError("Wallet not found — please try again", 404);
    if (senderWallet.coinBalance < totalCoinCost)
      throw new AppError("Insufficient coins", 400);

    const newSenderCoinBalance = senderWallet.coinBalance - totalCoinCost;
    await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { coinBalance: newSenderCoinBalance },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: senderWallet.id,
        transactionType: "debit",
        currency: "coins",
        amount: totalCoinCost,
        balanceAfter: newSenderCoinBalance,
        reference: "gift_sent",
        description: `Sent ${qty}× ${gift.name} to ${ctx.hostUser.displayName}`,
      },
    });

    // Summaries (sender/recipient/gift) were already fetched before the
    // transaction for the early animation broadcast — no need to re-join here.
    const giftTx = await tx.giftTransaction.create({
      data: {
        senderId,
        recipientId: ctx.giftTransaction.recipientId,
        recipientType: ctx.giftTransaction.recipientType,
        recipientAgencyId: ctx.giftTransaction.recipientAgencyId,
        giftId: gift.id,
        roomId,
        qty,
        coinCost: totalCoinCost,
        beanValue: totalBeanValue,
      },
    });

    const {
      credits: commissionCredits,
      hostBeans: distributedHostBeans,
      coinSellerRates,
    } = await distributeBeans(
      tx,
      giftTx.id,
      totalBeanValue,
      ctx,
      walletMap,
      rates,
    );

    if (distributedHostBeans > 0) {
      await addCharmXp(ctx.hostUser.id, totalBeanValue, tx);
    }

    // Lucky draw — runs AFTER the debit + bean distribution so coins are always
    // deducted first and the win credit is atomic with the gift. One draw per
    // send (qty is batched into a single stake). The LuckyGiftDraw row is unique
    // on giftTransactionId, so a retried transaction can never double-log.
    let luckyOutcome: LuckyDrawOutcome | null = null;
    if (luckyActive && luckySetting) {
      const draw = runLuckyDraw(luckySetting, totalCoinCost);
      let senderBalanceAfterDraw = newSenderCoinBalance;
      if (draw.isWin && draw.rewardCoins > 0) {
        senderBalanceAfterDraw = newSenderCoinBalance + draw.rewardCoins;
        await tx.wallet.update({
          where: { id: senderWallet.id },
          data: { coinBalance: senderBalanceAfterDraw },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: senderWallet.id,
            transactionType: "credit",
            currency: "coins",
            amount: draw.rewardCoins,
            balanceAfter: senderBalanceAfterDraw,
            reference: "lucky_reward",
            description: `Lucky gift win: ${gift.name}`,
          },
        });
      }
      const drawRow = await tx.luckyGiftDraw.create({
        data: {
          giftTransactionId: giftTx.id,
          userId: senderId,
          giftId: gift.id,
          roomId,
          coinCost: totalCoinCost,
          isWin: draw.isWin,
          rewardCoins: draw.rewardCoins,
          receiverBeans: distributedHostBeans,
          winProbability: luckySetting.winProbability,
          winMultiplier: draw.winMultiplier,
        },
      });
      luckyOutcome = {
        drawId: drawRow.id,
        isWin: draw.isWin,
        winMultiplier: draw.winMultiplier,
        rewardCoins: draw.rewardCoins,
        coinCost: totalCoinCost,
        senderCoinBalance: senderBalanceAfterDraw,
      };
    }

    return {
      giftTx,
      commissionCredits,
      hostBeans: distributedHostBeans,
      coinSellerRates,
      luckyOutcome,
    };
  });

  // Lucky result — post-commit: sender popup (win and lose), room announcement
  // + winners feed (wins only).
  if (result.luckyOutcome) {
    broadcastLuckyDraw({
      senderId,
      senderName: senderSummary.displayName,
      roomId,
      giftId: gift.id,
      giftName: gift.name,
      giftIcon: gift.icon,
      giftImage: gift.image,
      outcome: result.luckyOutcome,
    });
  }

  // Real-time agency summary (rolling gift-bonus inputs, tier ladders): notify
  // agency + parent owners on every qualifying gift so mobile can refetch summary
  // without waiting for poll (commission:credited already refreshes wallet beans).
  const agencyNotifyOwnerIds: string[] = [];
  if (ctx.agency) {
    agencyNotifyOwnerIds.push(ctx.agency.ownerId);
    if (ctx.agency.parentAgencyId) {
      const parent = await prisma.agency.findUnique({
        where: { id: ctx.agency.parentAgencyId },
        select: { ownerId: true },
      });
      if (parent) agencyNotifyOwnerIds.push(parent.ownerId);
    }
  }
  try {
    const io = getIO();
    for (const ownerId of agencyNotifyOwnerIds) {
      io.to(`user:${ownerId}`).emit("agency:gift_stats_updated", {});
      void emitSellerRatesUpdatedForUser(ownerId).catch(() => undefined);
    }
  } catch {
    /* Socket.io not initialized (e.g. some tests) */
  }

  let sellerRatesPayload:
    | Awaited<ReturnType<typeof buildSellerRatesSocketPayload>>
    | undefined;
  if (ctx.coinSeller && result.coinSellerRates) {
    try {
      const io = getIO();
      sellerRatesPayload = await buildSellerRatesSocketPayload(
        result.coinSellerRates,
      );
      io.to(`user:${ctx.coinSeller.userId}`).emit(
        "seller:rates_updated",
        sellerRatesPayload,
      );
    } catch {
      /* Socket.io not initialized (e.g. some tests) */
    }
  }

  let skipEarnerLeaderboard = false;
  if (ctx.agency) {
    const bonusSetting = await prisma.giftBonusSetting.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    skipEarnerLeaderboard = isGiftBonusProgramActive(
      bonusSetting.enabled,
      ctx.agency.giftBonusEnabled,
    );
  }

  const luckyRewardCoins = result.luckyOutcome?.rewardCoins ?? 0;
  const { enqueueGiftSideEffects } =
    await import("../../queues/gift-side-effects");
  void enqueueGiftSideEffects({
    senderId,
    hostUserId: ctx.hostUser.id,
    totalCoinCost,
    totalBeanValue,
    roomId: roomId ?? null,
    recipientId: input.recipientId ?? null,
    skipEarnerLeaderboard,
    luckyRewardCoins,
  }).catch(() => {
    void updateRichScore(senderId, totalCoinCost).catch(() => undefined);
    void updateCharmScore(ctx.hostUser.id, totalBeanValue).catch(
      () => undefined,
    );
    void updateGifterScore(senderId, totalCoinCost).catch(() => undefined);
    if (!skipEarnerLeaderboard) {
      void updateEarnerScore(ctx.hostUser.id, totalBeanValue).catch(
        () => undefined,
      );
    }
    if (luckyRewardCoins > 0) {
      void updateLuckyWinnerScore(senderId, luckyRewardCoins).catch(
        () => undefined,
      );
    }
  });

  return {
    ...result.giftTx,
    gift: giftSummary,
    sender: senderSummary,
    recipient: recipientSummary,
    commissionCredits: result.commissionCredits,
    hostBeans: result.hostBeans,
    coinSellerUserId: ctx.coinSeller?.userId,
    sellerRatesPayload,
    luckyDraw: result.luckyOutcome,
  };
}

export interface CommissionCredit {
  ownerId: string;
  amount: number;
  commissionType: CommissionType;
  rateApplied: number;
  agencyId: string | null;
}

/**
 * distributeBeans — CRITICAL atomic function.
 *
 * Must run inside an existing prisma.$transaction. Never credit beans outside this function.
 *
 * Rules (see CLAUDE.md § Bean Distribution):
 *   hostBeans       = floor(totalBeans × 0.70)   → credited to ctx.hostUser + counter bump
 *   directRate      = agency.commissionRateOverride when active at gift time
 *                     (rate set AND (validUntil null OR gift.createdAt ≤ validUntil));
 *                     else tierRate(PRE rolling 30d turnover + this gift's coinCost)
 *   directCommission= floor(hostBeans × directRate)  → agent owner + ledger(direct)
 *   parentRate      = parent commission override when active at gift time, else parent tier
 *   parentDelta     = floor(hostBeans × max(0, parentRate − directRate))  → parent agent + ledger(parent_delta)
 *                     (only when agency.parentAgencyId is set AND parent.status === 'active')
 *   giftBonus       = floor(hostBeans × bonusRate)   → agency.beanBalance + ledger(gift_bonus)
 *                     only when ctx.destinationKind === 'agency' (gifts to agency / own ID);
 *                     host gifts under the agency earn direct commission only. Rolling 7-day
 *                     host income still counts toward bonus tier/rate on agency-dest gifts.
 *   Company share   = remainder (implicit, not credited anywhere).
 *
 * Note: commission tier income = PRE rolling sum (excluding this gift row) plus this
 * gift's hostBeans so the slab that applies upgrades on the same gift that crosses it.
 * Cumulative counters still bump for analytics/parent rollup but do not drive commission %.
 *
 * Returns an array of CommissionCredit entries for real-time notification after commit.
 */
export async function distributeBeans(
  tx: Tx,
  giftTransactionId: string,
  totalBeans: number,
  ctx: GiftRecipientContext,
  walletMap: Map<string, { id: string; beanBalance: number }> = new Map(),
  rates: PrecomputedDistributionRates = {
    directRate: 0,
    parentAgency: null,
    parentDeltaRate: 0,
    bonusRate: 0,
    giftTurnoverCoins: 0,
  },
): Promise<{
  credits: CommissionCredit[];
  hostBeans: number;
  coinSellerRates?: TierRates;
}> {
  const credits: CommissionCredit[] = [];
  const hostBeans = Math.floor(totalBeans * 0.7);
  if (hostBeans <= 0) return { credits, hostBeans };

  // Acquire row-level locks in a consistent order to prevent deadlocks:
  // sender-wallet (already locked in sendGift) → host user → sub-agency → parent agency.
  await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${ctx.hostUser.id} FOR UPDATE`;
  if (ctx.agency) {
    await tx.$queryRaw`SELECT 1 FROM agencies WHERE id = ${ctx.agency.id} FOR UPDATE`;
    if (ctx.agency.parentAgencyId) {
      await tx.$queryRaw`SELECT 1 FROM agencies WHERE id = ${ctx.agency.parentAgencyId} FOR UPDATE`;
    }
  }

  // 1. Credit host's personal wallet + bump cumulativeBeansEarned.
  await creditBeansInTx(
    tx,
    ctx.hostUser.id,
    hostBeans,
    "gift_received",
    "Gift host share",
    walletMap.get(ctx.hostUser.id),
  );
  await tx.user.update({
    where: { id: ctx.hostUser.id },
    data: { cumulativeBeansEarned: { increment: BigInt(hostBeans) } },
  });

  // Track totals for company share calculation at the end.
  let directCommission = 0;
  let parentDelta = 0;
  let giftBonus = 0;
  let csGiftCommission = 0;
  let csIncomeReward = 0;
  let csGiftBonus = 0;
  let csTotalCommission = 0;
  let coinSellerRates: TierRates | undefined;

  if (ctx.agency) {
    // 2. Direct commission — rate pre-computed before transaction.
    const directRate = rates.directRate;

    directCommission = Math.floor(hostBeans * directRate);
    if (directCommission > 0) {
      await creditBeansInTx(
        tx,
        ctx.agency.ownerId,
        directCommission,
        "gift_commission",
        "Agency direct commission",
        walletMap.get(ctx.agency.ownerId),
      );
      await writeLedgerRow(tx, {
        giftTransactionId,
        agencyId: ctx.agency.id,
        userId: ctx.agency.ownerId,
        amount: BigInt(directCommission),
        commissionType: "direct",
        rateApplied: directRate,
      });
      credits.push({
        ownerId: ctx.agency.ownerId,
        amount: directCommission,
        commissionType: "direct",
        rateApplied: directRate,
        agencyId: ctx.agency.id,
      });
    }

    // 3. Sub-agency counter rollup. Both sub and parent counters bumped by hostBeans.
    await tx.agency.update({
      where: { id: ctx.agency.id },
      data: { cumulativeHostIncome: { increment: BigInt(hostBeans) } },
    });

    // 4. Parent delta — rate pre-computed before transaction.
    if (ctx.agency.parentAgencyId) {
      // Bump parent counter regardless of status.
      await tx.agency.update({
        where: { id: ctx.agency.parentAgencyId },
        data: { cumulativeHostIncome: { increment: BigInt(hostBeans) } },
      });

      const parentAgency = rates.parentAgency; // non-null only when parent status === 'active'
      if (parentAgency) {
        parentDelta = Math.floor(hostBeans * rates.parentDeltaRate);
        if (parentDelta > 0) {
          await creditBeansInTx(
            tx,
            parentAgency.ownerId,
            parentDelta,
            "gift_commission_parent",
            "Parent agency delta",
          );
          await writeLedgerRow(tx, {
            giftTransactionId,
            agencyId: ctx.agency.parentAgencyId,
            userId: parentAgency.ownerId,
            amount: BigInt(parentDelta),
            commissionType: "parent_delta",
            rateApplied: rates.parentDeltaRate,
          });
          credits.push({
            ownerId: parentAgency.ownerId,
            amount: parentDelta,
            commissionType: "parent_delta",
            rateApplied: rates.parentDeltaRate,
            agencyId: ctx.agency.parentAgencyId,
          });
        }
      }
    }

    // 5. Gift bonus — agency / own-ID destination only (not host gifts under the agency).
    if (ctx.destinationKind === "agency") {
      // bonusRate pre-computed before transaction.
      giftBonus = Math.floor(hostBeans * rates.bonusRate);
      if (giftBonus > 0) {
        await tx.agency.update({
          where: { id: ctx.agency.id },
          data: { beanBalance: { increment: BigInt(giftBonus) } },
        });
        await writeLedgerRow(tx, {
          giftTransactionId,
          agencyId: ctx.agency.id,
          userId: null,
          amount: BigInt(giftBonus),
          commissionType: "gift_bonus",
          rateApplied: rates.bonusRate,
        });
        credits.push({
          ownerId: ctx.agency.ownerId,
          amount: giftBonus,
          commissionType: "gift_bonus",
          rateApplied: rates.bonusRate,
          agencyId: ctx.agency.id,
        });
        // Credit agent's personal wallet (spendable beans), same destination as direct commission.
        const ownerGiftBonusWallet = await tx.wallet.upsert({
          where: { userId: ctx.agency.ownerId },
          create: { userId: ctx.agency.ownerId, beanBalance: giftBonus },
          update: { beanBalance: { increment: giftBonus } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: ownerGiftBonusWallet.id,
            transactionType: "credit",
            currency: "beans",
            amount: giftBonus,
            balanceAfter: ownerGiftBonusWallet.beanBalance,
            reference: "gift_bonus",
            description: "Agency gift bonus",
          },
        });
      }
    }
  }

  // 6. Coin seller additional earnings — credited to the agent's personal wallet.
  if (ctx.coinSeller) {
    // giftTurnoverCoins pre-computed before transaction (reuses direct commission rolling sum).
    const giftTurnoverCoins = rates.giftTurnoverCoins;
    const { tierRates: csRates } = await syncCoinSellerProfileRatesFromTier(
      ctx.coinSeller.userId,
      { giftTurnoverCoins, tx },
    );
    coinSellerRates = csRates;

    const csTotalRate = parseFloat(csRates.totalCommissionRate);
    const csGiftRate = parseFloat(csRates.giftCommissionRate);
    const csIncomeRate = parseFloat(csRates.incomeRewardRate);
    const csBonusRate = parseFloat(csRates.giftBonusRate);
    csTotalCommission = Math.floor(hostBeans * csTotalRate);
    csGiftCommission = Math.floor(hostBeans * csGiftRate);
    csIncomeReward = Math.floor(hostBeans * csIncomeRate);
    csGiftBonus = Math.floor(hostBeans * csBonusRate);

    const agentId = ctx.coinSeller.userId;

    if (csTotalCommission > 0) {
      await creditBeansInTx(
        tx,
        agentId,
        csTotalCommission,
        "cs_total_commission",
        "Coin seller total commission",
      );
      await writeLedgerRow(tx, {
        giftTransactionId,
        agencyId: null,
        userId: agentId,
        amount: BigInt(csTotalCommission),
        commissionType: "cs_total_commission",
        rateApplied: csTotalRate,
      });
      credits.push({
        ownerId: agentId,
        amount: csTotalCommission,
        commissionType: "cs_total_commission",
        rateApplied: csTotalRate,
        agencyId: null,
      });
    }

    if (csGiftCommission > 0) {
      await creditBeansInTx(
        tx,
        agentId,
        csGiftCommission,
        "cs_gift_commission",
        "Coin seller gift commission",
      );
      await writeLedgerRow(tx, {
        giftTransactionId,
        agencyId: null,
        userId: agentId,
        amount: BigInt(csGiftCommission),
        commissionType: "cs_gift_commission",
        rateApplied: csGiftRate,
      });
      credits.push({
        ownerId: agentId,
        amount: csGiftCommission,
        commissionType: "cs_gift_commission",
        rateApplied: csGiftRate,
        agencyId: null,
      });
    }

    if (csIncomeReward > 0) {
      await creditBeansInTx(
        tx,
        agentId,
        csIncomeReward,
        "cs_income_reward",
        "Coin seller income reward",
      );
      await writeLedgerRow(tx, {
        giftTransactionId,
        agencyId: null,
        userId: agentId,
        amount: BigInt(csIncomeReward),
        commissionType: "cs_income_reward",
        rateApplied: csIncomeRate,
      });
      credits.push({
        ownerId: agentId,
        amount: csIncomeReward,
        commissionType: "cs_income_reward",
        rateApplied: csIncomeRate,
        agencyId: null,
      });
    }

    if (csGiftBonus > 0) {
      await creditBeansInTx(
        tx,
        agentId,
        csGiftBonus,
        "cs_gift_bonus",
        "Coin seller gift bonus",
      );
      await writeLedgerRow(tx, {
        giftTransactionId,
        agencyId: null,
        userId: agentId,
        amount: BigInt(csGiftBonus),
        commissionType: "cs_gift_bonus",
        rateApplied: csBonusRate,
      });
      credits.push({
        ownerId: agentId,
        amount: csGiftBonus,
        commissionType: "cs_gift_bonus",
        rateApplied: csBonusRate,
        agencyId: null,
      });
    }
  }

  // 7. Company share — the platform's implicit revenue.
  //    = totalBeans − hostBeans − directCommission − parentDelta − giftBonus − cs* cuts
  const companyShare =
    totalBeans -
    hostBeans -
    directCommission -
    parentDelta -
    giftBonus -
    csTotalCommission -
    csGiftCommission -
    csIncomeReward -
    csGiftBonus;
  if (companyShare > 0) {
    await writeLedgerRow(tx, {
      giftTransactionId,
      agencyId: null,
      userId: null,
      amount: BigInt(companyShare),
      commissionType: "company_share",
      rateApplied: companyShare / totalBeans,
    });
  }

  return { credits, hostBeans, coinSellerRates };
}

/**
 * Credit beans inside an existing transaction.
 * If `prelockedWallet` is provided (already locked via the batch FOR UPDATE at
 * transaction start), the redundant individual FOR UPDATE is skipped.
 */
async function creditBeansInTx(
  tx: Tx,
  userId: string,
  amount: number,
  reference: string,
  description: string,
  prelockedWallet?: { id: string; beanBalance: number },
) {
  if (amount <= 0) return;

  let walletId: string;
  let newBalance: number;

  if (prelockedWallet) {
    walletId = prelockedWallet.id;
    newBalance = prelockedWallet.beanBalance + amount;
    await tx.wallet.update({
      where: { id: walletId },
      data: { beanBalance: newBalance },
    });
    // Same wallet can receive host share + commission in one tx; keep snapshot in sync.
    prelockedWallet.beanBalance = newBalance;
  } else {
    // Wallet not pre-locked (e.g. parent agency owner resolved mid-tx): lock individually.
    const rows = await tx.$queryRaw<
      Array<{ id: string; beanBalance: bigint | number }>
    >`
      SELECT id, "beanBalance" FROM wallets WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) {
      const created = await tx.wallet.create({
        data: { userId, beanBalance: amount },
      });
      walletId = created.id;
      newBalance = amount;
    } else {
      walletId = rows[0].id;
      newBalance = Number(rows[0].beanBalance) + amount;
      await tx.wallet.update({
        where: { id: walletId },
        data: { beanBalance: newBalance },
      });
    }
  }

  await tx.walletTransaction.create({
    data: {
      walletId,
      transactionType: "credit",
      currency: "beans",
      amount,
      balanceAfter: newBalance,
      reference,
      description,
    },
  });
}
