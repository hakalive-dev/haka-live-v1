import type { AgencySummaryV2 } from "@/types";

/** Host share of gift coin value (matches distributeBeans hostBeans = 70%). */
export const HOST_GIFT_SHARE_PERCENT = 70;

export interface CoinSellerCommissionDisplay {
  giftCommissionPercent: string;
  incomeRewardPercent: string;
  giftBonusPercent: string;
  myCommissionRatePercent: string;
  maxIncomeRewardPercent: string;
  maxGiftBonusPercent: string;
  maxMyCommissionRatePercent: string;
  formulaTooltip: string;
}

/** Decimal 0.04 → display 4; already-whole 16 → 16. */
export function decimalRateToDisplayPercent(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  if (rate > 0 && rate <= 1) return rate * 100;
  return rate;
}

function formatDisplayPercent(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(/\.0$/, "");
}

/**
 * Coin Seller overview commission block (reference UI):
 * - Gift commission = fixed 70% host share
 * - Income reward = agency direct commission %
 * - Gift bonus = agency gift bonus %
 * - My commission rate = 70 + (giftBonus × 70%) + (agencyCommission × 70%)
 */
export function computeCoinSellerCommissionDisplay(
  summary: AgencySummaryV2 | null,
): CoinSellerCommissionDisplay {
  const giftCommission = HOST_GIFT_SHARE_PERCENT;

  let incomeReward = 0;
  let giftBonus = 0;
  let maxIncome = 0;
  let maxBonus = 0;

  if (summary) {
    incomeReward = decimalRateToDisplayPercent(
      summary.effectiveCommissionRate ?? 0,
    );
    giftBonus = summary.giftBonusProgramEnabled
      ? decimalRateToDisplayPercent(summary.effectiveGiftBonusRate ?? 0)
      : 0;

    maxIncome =
      summary.allTiers.length > 0
        ? Math.max(
            ...summary.allTiers.map((t) =>
              decimalRateToDisplayPercent(t.commissionRate),
            ),
          )
        : incomeReward;

    maxBonus =
      summary.allGiftBonusTiers.length > 0
        ? Math.max(
            ...summary.allGiftBonusTiers.map((t) =>
              decimalRateToDisplayPercent(t.bonusRate),
            ),
          )
        : giftBonus;
  }

  const myRate =
    giftCommission + giftBonus * 0.7 + incomeReward * 0.7;
  const maxMy = giftCommission + maxBonus * 0.7 + maxIncome * 0.7;

  const giftStr = formatDisplayPercent(giftCommission);
  const incomeStr = formatDisplayPercent(incomeReward);
  const bonusStr = formatDisplayPercent(giftBonus);
  const maxIncomeStr = formatDisplayPercent(maxIncome);
  const maxBonusStr = formatDisplayPercent(maxBonus);

  const formulaTooltip =
    `${giftStr}%(Gift Commission)\n` +
    `+${maxBonusStr}%(Gift Bonus Rate)*70%\n` +
    `+${maxIncomeStr}%(Agency Commission Rate)*70%`;

  return {
    giftCommissionPercent: giftStr,
    incomeRewardPercent: incomeStr,
    giftBonusPercent: bonusStr,
    myCommissionRatePercent: formatDisplayPercent(myRate),
    maxIncomeRewardPercent: maxIncomeStr,
    maxGiftBonusPercent: maxBonusStr,
    maxMyCommissionRatePercent: formatDisplayPercent(maxMy),
    formulaTooltip,
  };
}
