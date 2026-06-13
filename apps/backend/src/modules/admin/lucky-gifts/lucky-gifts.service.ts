import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { clearLuckySettingCache } from '../../lucky-gifts/lucky-setting';
import {
  averageRewardCoins,
  averageWinMultiplier,
  expectedReturn,
  normalizeWinMultiplierTiers,
  parseWinMultiplierTiersJson,
  totalPayoutRatio,
  type LuckyPayoutTier,
} from '../../lucky-gifts/lucky-draw';
import { logAdminAction } from '../../../utils/audit';
import type { LuckyDrawsQuery, LuckySettingUpdateInput } from './lucky-gifts.validation';

export interface LuckySettingDTO {
  enabled: boolean;
  winProbability: number;
  /** Weighted average display multiplier across tiers. */
  winMultiplier: number;
  /** Weighted average coin reward across tiers. */
  averageRewardCoins: number;
  winMultiplierTiers: LuckyPayoutTier[];
  receiverBenefitPercent: number;
  dailyUserWinCapCoins: string;
  updatedBy: string;
  updatedAt: string;
  /** TRP — expected sender return (winProbability × avg reward / reference stake). */
  expectedReturn: number;
  /** Expected total payout incl. the receiver cut. Keep < 1.0 for a house edge. */
  totalPayoutRatio: number;
}

function toSettingDTO(row: {
  enabled: boolean;
  winProbability: unknown;
  winMultiplier: unknown;
  winMultiplierTiers: unknown;
  receiverBenefitPercent: unknown;
  dailyUserWinCapCoins: bigint;
  updatedBy: string;
  updatedAt: Date;
}): LuckySettingDTO {
  const winMultiplierTiers = normalizeWinMultiplierTiers(
    parseWinMultiplierTiersJson(row.winMultiplierTiers),
    Number(row.winMultiplier),
  );
  const config = {
    winProbability: Number(row.winProbability),
    winMultiplierTiers,
    winMultiplier: averageWinMultiplier(winMultiplierTiers),
    averageRewardCoins: averageRewardCoins(winMultiplierTiers),
    receiverBenefitPercent: Number(row.receiverBenefitPercent),
  };
  return {
    enabled: row.enabled,
    ...config,
    dailyUserWinCapCoins: row.dailyUserWinCapCoins.toString(),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
    expectedReturn: expectedReturn(config),
    totalPayoutRatio: totalPayoutRatio(config),
  };
}

async function ensureSetting() {
  return prisma.luckyGiftSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

export async function getSetting(): Promise<LuckySettingDTO> {
  return toSettingDTO(await ensureSetting());
}

export async function updateSetting(
  adminUserId: string,
  input: LuckySettingUpdateInput,
): Promise<LuckySettingDTO> {
  const current = await ensureSetting();

  // Validate the MERGED config so a partial patch can't sneak past the house edge.
  const mergedTiers = normalizeWinMultiplierTiers(
    input.winMultiplierTiers ??
      parseWinMultiplierTiersJson(current.winMultiplierTiers),
    input.winMultiplier ?? Number(current.winMultiplier),
  );
  const merged = {
    winProbability: input.winProbability ?? Number(current.winProbability),
    winMultiplierTiers: mergedTiers,
    receiverBenefitPercent:
      input.receiverBenefitPercent ?? Number(current.receiverBenefitPercent),
  };
  if (expectedReturn(merged) >= 1) {
    throw new AppError('expected_return_too_high', 400);
  }

  const row = await prisma.luckyGiftSetting.update({
    where: { id: 'singleton' },
    data: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.winProbability !== undefined ? { winProbability: input.winProbability } : {}),
      ...(input.winMultiplier !== undefined ? { winMultiplier: input.winMultiplier } : {}),
      ...(input.winMultiplierTiers !== undefined
        ? { winMultiplierTiers: input.winMultiplierTiers }
        : {}),
      ...(input.receiverBenefitPercent !== undefined
        ? { receiverBenefitPercent: input.receiverBenefitPercent }
        : {}),
      ...(input.dailyUserWinCapCoins !== undefined
        ? { dailyUserWinCapCoins: BigInt(input.dailyUserWinCapCoins) }
        : {}),
      updatedBy: adminUserId,
    },
  });
  clearLuckySettingCache();
  void logAdminAction(adminUserId, 'lucky_gifts.setting_updated', 'lucky_gift_setting', 'singleton', {
    ...input,
  }).catch(() => undefined);
  return toSettingDTO(row);
}

export async function listDraws(query: LuckyDrawsQuery) {
  const where: Prisma.LuckyGiftDrawWhereInput = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.giftId ? { giftId: query.giftId } : {}),
    ...(query.roomId ? { roomId: query.roomId } : {}),
    ...(query.isWin !== undefined ? { isWin: query.isWin } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.luckyGiftDraw.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: { gift: { select: { id: true, name: true, icon: true } } },
    }),
    prisma.luckyGiftDraw.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      giftTransactionId: r.giftTransactionId,
      userId: r.userId,
      gift: r.gift,
      roomId: r.roomId,
      coinCost: r.coinCost,
      isWin: r.isWin,
      rewardCoins: r.rewardCoins,
      receiverBeans: r.receiverBeans,
      winProbability: Number(r.winProbability),
      winMultiplier: Number(r.winMultiplier),
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/** Participation + realized payout / house edge, overall and per gift. */
export async function getStats() {
  const [overall, wins, perGift, setting] = await Promise.all([
    prisma.luckyGiftDraw.aggregate({
      _count: { _all: true },
      _sum: { coinCost: true, rewardCoins: true, receiverBeans: true },
    }),
    prisma.luckyGiftDraw.count({ where: { isWin: true } }),
    prisma.luckyGiftDraw.groupBy({
      by: ['giftId'],
      _count: { _all: true },
      _sum: { coinCost: true, rewardCoins: true, receiverBeans: true },
    }),
    ensureSetting(),
  ]);

  const gifts = await prisma.gift.findMany({
    where: { id: { in: perGift.map((g) => g.giftId) } },
    select: { id: true, name: true, icon: true, coinCost: true },
  });
  const giftById = new Map(gifts.map((g) => [g.id, g]));

  const totalStaked = overall._sum.coinCost ?? 0;
  const totalPaidOut = overall._sum.rewardCoins ?? 0;
  const totalReceiverBeans = overall._sum.receiverBeans ?? 0;
  const totalDraws = overall._count._all;

  return {
    totalDraws,
    totalWins: wins,
    observedWinRate: totalDraws > 0 ? wins / totalDraws : 0,
    configuredWinRate: Number(setting.winProbability),
    totalStakedCoins: totalStaked,
    totalPaidOutCoins: totalPaidOut,
    totalReceiverBeans,
    /** Share of staked coins the house kept (ignores the bean cut, which is a different currency). */
    realizedHouseEdge: totalStaked > 0 ? (totalStaked - totalPaidOut) / totalStaked : null,
    perGift: perGift.map((g) => {
      const staked = g._sum.coinCost ?? 0;
      const paidOut = g._sum.rewardCoins ?? 0;
      return {
        gift: giftById.get(g.giftId) ?? { id: g.giftId, name: '(deleted)', icon: '', coinCost: 0 },
        draws: g._count._all,
        stakedCoins: staked,
        paidOutCoins: paidOut,
        receiverBeans: g._sum.receiverBeans ?? 0,
        realizedHouseEdge: staked > 0 ? (staked - paidOut) / staked : null,
      };
    }),
  };
}
