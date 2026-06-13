/**
 * Lucky Gifts draw engine — pure and deterministic under an injected RNG.
 *
 * A Lucky Gift (Gift.category === 'lucky') is a probability-based game:
 *   win  → sender is credited a random rewardCoins amount from weighted tiers
 *   lose → no sender reward
 * Each tier also carries a random winMultiplier (display / announcement only —
 * it is NOT multiplied by the stake).
 * In both outcomes the host's bean pool is
 * round(coinCost × receiverBenefitPercent / 100).
 *
 * Server-authoritative: the client never influences the outcome.
 */

export interface LuckyPayoutTier {
  /** Random lucky number shown on win (not × stake). */
  multiplier: number;
  /** Absolute coins credited to the sender on win. */
  rewardCoins: number;
  weight: number;
}

/** @deprecated alias — tiers are payout rows, not stake multipliers. */
export type LuckyMultiplierTier = LuckyPayoutTier;

/** Default payout tiers — random coin prizes + independent display multipliers. */
export const DEFAULT_WIN_MULTIPLIER_TIERS: LuckyPayoutTier[] = [
  { multiplier: 2, rewardCoins: 20, weight: 50 },
  { multiplier: 5, rewardCoins: 100, weight: 25 },
  { multiplier: 10, rewardCoins: 500, weight: 15 },
  { multiplier: 50, rewardCoins: 5_000, weight: 7 },
  { multiplier: 100, rewardCoins: 50_000, weight: 2 },
  { multiplier: 500, rewardCoins: 500_000, weight: 1 },
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
  /** Lucky number drawn for this send (0 on lose) — display only. */
  winMultiplier: number;
  /** Coins credited to the sender (0 on lose). */
  rewardCoins: number;
  /** Bean pool distributed to the receiver side instead of the normal beanValue. */
  receiverBeans: number;
}

export function normalizeWinMultiplierTiers(
  tiers: LuckyPayoutTier[] | null | undefined,
  fallbackMultiplier = 3,
  fallbackRewardCoins?: number,
): LuckyPayoutTier[] {
  const valid = (tiers ?? []).filter(
    (t) =>
      Number.isFinite(t.multiplier) &&
      t.multiplier > 0 &&
      Number.isFinite(t.rewardCoins) &&
      t.rewardCoins > 0 &&
      Number.isFinite(t.weight) &&
      t.weight > 0,
  );
  if (valid.length > 0) return valid;
  const fallbackMult =
    Number.isFinite(fallbackMultiplier) && fallbackMultiplier > 0 ? fallbackMultiplier : 3;
  const fallbackReward =
    fallbackRewardCoins != null && Number.isFinite(fallbackRewardCoins) && fallbackRewardCoins > 0
      ? fallbackRewardCoins
      : fallbackMult;
  return [{ multiplier: fallbackMult, rewardCoins: fallbackReward, weight: 1 }];
}

export function averageWinMultiplier(tiers: LuckyPayoutTier[]): number {
  const valid = normalizeWinMultiplierTiers(tiers);
  const totalWeight = valid.reduce((sum, tier) => sum + tier.weight, 0);
  return valid.reduce((sum, tier) => sum + tier.multiplier * tier.weight, 0) / totalWeight;
}

export function averageRewardCoins(tiers: LuckyPayoutTier[]): number {
  const valid = normalizeWinMultiplierTiers(tiers);
  const totalWeight = valid.reduce((sum, tier) => sum + tier.weight, 0);
  return valid.reduce((sum, tier) => sum + tier.rewardCoins * tier.weight, 0) / totalWeight;
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
  return pickWinTier(tiers, rng).multiplier;
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
    winMultiplier: tier.multiplier,
    rewardCoins: Math.round(tier.rewardCoins),
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
  referenceStake = LUCKY_TRP_REFERENCE_STAKE,
): number {
  const tiers = normalizeWinMultiplierTiers(config.winMultiplierTiers, config.winMultiplier);
  if (referenceStake <= 0) return 0;
  return (config.winProbability * averageRewardCoins(tiers)) / referenceStake;
}

/** Total payout ratio incl. the receiver cut — surfaced to admin. */
export function totalPayoutRatio(
  config: LuckyDrawConfig,
  referenceStake = LUCKY_TRP_REFERENCE_STAKE,
): number {
  return expectedReturn(config, referenceStake) + config.receiverBenefitPercent / 100;
}

export function parseWinMultiplierTiersJson(value: unknown): LuckyPayoutTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const multiplier = Number((row as LuckyPayoutTier).multiplier);
      const weight = Number((row as LuckyPayoutTier).weight);
      const rewardRaw = (row as LuckyPayoutTier).rewardCoins;
      const rewardCoins =
        rewardRaw != null && Number.isFinite(Number(rewardRaw))
          ? Number(rewardRaw)
          : Number.isFinite(multiplier)
            ? multiplier
            : NaN;
      if (
        !Number.isFinite(multiplier) ||
        multiplier <= 0 ||
        !Number.isFinite(rewardCoins) ||
        rewardCoins <= 0 ||
        !Number.isFinite(weight) ||
        weight <= 0
      ) {
        return null;
      }
      return { multiplier, rewardCoins, weight };
    })
    .filter((row): row is LuckyPayoutTier => row !== null);
}
