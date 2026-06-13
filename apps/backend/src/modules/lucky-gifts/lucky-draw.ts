/**
 * Lucky Gifts draw engine — pure and deterministic under an injected RNG.
 *
 * A Lucky Gift (Gift.category === 'lucky') is a probability-based game:
 *   win  → sender is credited round(coinCost × payoutPercent / 100) from weighted tiers
 *   lose → no sender reward
 * In both outcomes the host's bean pool is
 * round(coinCost × receiverBenefitPercent / 100).
 *
 * Server-authoritative: the client never influences the outcome.
 */

export interface LuckyPayoutTier {
  /** % of stake returned to the sender on win. */
  payoutPercent: number;
  weight: number;
  /** @deprecated legacy display field — ignored when payoutPercent is set. */
  multiplier?: number;
  /** @deprecated legacy fixed coins — parsed into payoutPercent when missing. */
  rewardCoins?: number;
}

/** @deprecated alias — tiers are payout rows, not stake multipliers. */
export type LuckyMultiplierTier = LuckyPayoutTier;

/** Default payout tiers — house-favored weights on stake-relative returns. */
export const DEFAULT_WIN_MULTIPLIER_TIERS: LuckyPayoutTier[] = [
  { payoutPercent: 40, weight: 30 },
  { payoutPercent: 88, weight: 25 },
  { payoutPercent: 95, weight: 20 },
  { payoutPercent: 105, weight: 12 },
  { payoutPercent: 220, weight: 6 },
  { payoutPercent: 350, weight: 3 },
  { payoutPercent: 520, weight: 1 },
];

/** Reference stake for admin TRP / house-edge previews (100-coin example). */
export const LUCKY_TRP_REFERENCE_STAKE = 100;

export interface LuckyDrawConfig {
  /** Chance of a win per send, 0 ≤ p ≤ 1. */
  winProbability: number;
  /** Weighted payout tiers; falls back to a single tier when empty. */
  winMultiplierTiers: LuckyPayoutTier[];
  /** Legacy scalar fallback when tiers are empty (admin / migrations). */
  winMultiplier?: number;
  /** Host's % of gift value (0–1.5) replacing the normal bean share. */
  receiverBenefitPercent: number;
}

export interface LuckyDrawResult {
  isWin: boolean;
  /** Lucky payout % drawn for this send (0 on lose) — display / logs. */
  winMultiplier: number;
  /** Coins credited to the sender (0 on lose). */
  rewardCoins: number;
  /** Bean pool distributed to the receiver side instead of the normal beanValue. */
  receiverBeans: number;
}

function tierPayoutPercent(tier: LuckyPayoutTier): number {
  if (Number.isFinite(tier.payoutPercent) && tier.payoutPercent > 0) {
    return tier.payoutPercent;
  }
  if (tier.rewardCoins != null && Number.isFinite(tier.rewardCoins) && tier.rewardCoins > 0) {
    return tier.rewardCoins;
  }
  if (tier.multiplier != null && Number.isFinite(tier.multiplier) && tier.multiplier > 0) {
    return tier.multiplier;
  }
  return NaN;
}

export function normalizeWinMultiplierTiers(
  tiers: LuckyPayoutTier[] | null | undefined,
  fallbackMultiplier = 3,
  fallbackPayoutPercent?: number,
): LuckyPayoutTier[] {
  const valid = (tiers ?? [])
    .map((t) => {
      const payoutPercent = tierPayoutPercent(t);
      if (
        !Number.isFinite(payoutPercent) ||
        payoutPercent <= 0 ||
        !Number.isFinite(t.weight) ||
        t.weight <= 0
      ) {
        return null;
      }
      return { payoutPercent, weight: t.weight };
    })
    .filter((t): t is LuckyPayoutTier => t != null);
  if (valid.length > 0) return valid;
  const fallbackMult =
    Number.isFinite(fallbackMultiplier) && fallbackMultiplier > 0 ? fallbackMultiplier : 3;
  const fallbackPercent =
    fallbackPayoutPercent != null &&
    Number.isFinite(fallbackPayoutPercent) &&
    fallbackPayoutPercent > 0
      ? fallbackPayoutPercent
      : fallbackMult;
  return [{ payoutPercent: fallbackPercent, weight: 1 }];
}

/** Weighted average payout % across tiers (on win). */
export function averagePayoutPercent(tiers: LuckyPayoutTier[]): number {
  const valid = normalizeWinMultiplierTiers(tiers);
  const totalWeight = valid.reduce((sum, tier) => sum + tier.weight, 0);
  return valid.reduce((sum, tier) => sum + tier.payoutPercent * tier.weight, 0) / totalWeight;
}

/** @deprecated use averagePayoutPercent — kept for admin DTO compat. */
export function averageWinMultiplier(tiers: LuckyPayoutTier[]): number {
  return averagePayoutPercent(tiers);
}

/** Average coin reward at a reference stake (admin preview). */
export function averageRewardCoins(
  tiers: LuckyPayoutTier[],
  referenceStake = LUCKY_TRP_REFERENCE_STAKE,
): number {
  return Math.round((averagePayoutPercent(tiers) * referenceStake) / 100);
}

/** Pick a payout tier by weight. */
export function pickWinTier(
  tiers: LuckyPayoutTier[],
  rng: () => number = Math.random,
): LuckyPayoutTier {
  const valid = normalizeWinMultiplierTiers(tiers);
  const totalWeight = valid.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = rng() * totalWeight;
  for (const tier of valid) {
    roll -= tier.weight;
    if (roll < 0) return tier;
  }
  return valid[valid.length - 1]!;
}

/** @deprecated use pickWinTier */
export function pickWinMultiplier(
  tiers: LuckyPayoutTier[],
  rng: () => number = Math.random,
): number {
  return pickWinTier(tiers, rng).payoutPercent;
}

export function rewardCoinsForTier(tier: LuckyPayoutTier, coinCost: number): number {
  return Math.round((coinCost * tier.payoutPercent) / 100);
}

export function runLuckyDraw(
  config: LuckyDrawConfig,
  coinCost: number,
  rng: () => number = Math.random,
): LuckyDrawResult {
  const tiers = normalizeWinMultiplierTiers(config.winMultiplierTiers, config.winMultiplier);
  const isWin = rng() < config.winProbability;
  if (!isWin) {
    return {
      isWin: false,
      winMultiplier: 0,
      rewardCoins: 0,
      receiverBeans: luckyReceiverBeans(config, coinCost),
    };
  }
  const tier = pickWinTier(tiers, rng);
  return {
    isWin: true,
    winMultiplier: tier.payoutPercent,
    rewardCoins: rewardCoinsForTier(tier, coinCost),
    receiverBeans: luckyReceiverBeans(config, coinCost),
  };
}

/** Reduced host bean pool for a lucky gift (computed even when the draw loses). */
export function luckyReceiverBeans(
  config: Pick<LuckyDrawConfig, 'receiverBenefitPercent'>,
  coinCost: number,
): number {
  return Math.round((coinCost * config.receiverBenefitPercent) / 100);
}

/** Expected sender return ratio (TRP) — must stay < 1.0 for a house edge. */
export function expectedReturn(
  config: Pick<LuckyDrawConfig, 'winProbability' | 'winMultiplierTiers' | 'winMultiplier'>,
): number {
  const tiers = normalizeWinMultiplierTiers(config.winMultiplierTiers, config.winMultiplier);
  return (config.winProbability * averagePayoutPercent(tiers)) / 100;
}

/** Total payout ratio incl. the receiver cut — surfaced to admin. */
export function totalPayoutRatio(config: LuckyDrawConfig): number {
  return expectedReturn(config) + config.receiverBenefitPercent / 100;
}

export function parseWinMultiplierTiersJson(value: unknown): LuckyPayoutTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const raw = row as Record<string, unknown>;
      const weight = Number(raw.weight);
      const payoutRaw = raw.payoutPercent;
      let payoutPercent =
        payoutRaw != null && Number.isFinite(Number(payoutRaw)) ? Number(payoutRaw) : NaN;
      if (!Number.isFinite(payoutPercent) || payoutPercent <= 0) {
        const rewardRaw = raw.rewardCoins;
        if (rewardRaw != null && Number.isFinite(Number(rewardRaw))) {
          payoutPercent = Number(rewardRaw);
        } else {
          const multiplier = Number(raw.multiplier);
          if (Number.isFinite(multiplier) && multiplier > 0) {
            payoutPercent = multiplier;
          }
        }
      }
      if (!Number.isFinite(payoutPercent) || payoutPercent <= 0 || !Number.isFinite(weight) || weight <= 0) {
        return null;
      }
      return { payoutPercent, weight };
    })
    .filter((row): row is LuckyPayoutTier => row !== null);
}
