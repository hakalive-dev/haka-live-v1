/**
 * Lucky Gifts draw engine — pure and deterministic under an injected RNG.
 *
 * A Lucky Gift (Gift.category === 'lucky') is a probability-based game:
 *   win  → sender is credited round(coinCost × drawnMultiplier) coins
 *   lose → no sender reward
 * In both cases the host's bean pool is reduced to
 * round(coinCost × receiverBenefitPercent / 100) — that reduced cut funds wins.
 *
 * Win multipliers are drawn from weighted tiers on each win (not a fixed value).
 * Server-authoritative: the client never influences the outcome.
 */

export interface LuckyMultiplierTier {
  multiplier: number;
  weight: number;
}

/** Default payout tiers — mostly low multipliers, rare jackpots. */
export const DEFAULT_WIN_MULTIPLIER_TIERS: LuckyMultiplierTier[] = [
  { multiplier: 2, weight: 50 },
  { multiplier: 3, weight: 25 },
  { multiplier: 5, weight: 15 },
  { multiplier: 10, weight: 7 },
  { multiplier: 50, weight: 2 },
  { multiplier: 100, weight: 1 },
];

export interface LuckyDrawConfig {
  /** Chance of a win per send, 0 ≤ p ≤ 1. */
  winProbability: number;
  /** Weighted payout tiers; falls back to a single tier when empty. */
  winMultiplierTiers: LuckyMultiplierTier[];
  /** Legacy scalar fallback when tiers are empty (admin / migrations). */
  winMultiplier?: number;
  /** Host's % of gift value (0–1.5) replacing the normal bean share. */
  receiverBenefitPercent: number;
}

export interface LuckyDrawResult {
  isWin: boolean;
  /** Multiplier drawn for this send (0 on lose). */
  winMultiplier: number;
  /** Coins credited to the sender (0 on lose). */
  rewardCoins: number;
  /** Bean pool distributed to the receiver side instead of the normal beanValue. */
  receiverBeans: number;
}

export function normalizeWinMultiplierTiers(
  tiers: LuckyMultiplierTier[] | null | undefined,
  fallbackMultiplier = 3,
): LuckyMultiplierTier[] {
  const valid = (tiers ?? []).filter(
    (t) => Number.isFinite(t.multiplier) && t.multiplier > 0 && Number.isFinite(t.weight) && t.weight > 0,
  );
  if (valid.length > 0) return valid;
  const fallback = Number.isFinite(fallbackMultiplier) && fallbackMultiplier > 0 ? fallbackMultiplier : 3;
  return [{ multiplier: fallback, weight: 1 }];
}

export function averageWinMultiplier(tiers: LuckyMultiplierTier[]): number {
  const valid = normalizeWinMultiplierTiers(tiers);
  const totalWeight = valid.reduce((sum, tier) => sum + tier.weight, 0);
  return valid.reduce((sum, tier) => sum + tier.multiplier * tier.weight, 0) / totalWeight;
}

/** Pick a payout multiplier from weighted tiers. */
export function pickWinMultiplier(
  tiers: LuckyMultiplierTier[],
  rng: () => number = Math.random,
): number {
  const valid = normalizeWinMultiplierTiers(tiers);
  const totalWeight = valid.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = rng() * totalWeight;
  for (const tier of valid) {
    roll -= tier.weight;
    if (roll < 0) return tier.multiplier;
  }
  return valid[valid.length - 1]!.multiplier;
}

export function runLuckyDraw(
  config: LuckyDrawConfig,
  coinCost: number,
  rng: () => number = Math.random,
): LuckyDrawResult {
  const tiers = normalizeWinMultiplierTiers(config.winMultiplierTiers, config.winMultiplier);
  const isWin = rng() < config.winProbability;
  const winMultiplier = isWin ? pickWinMultiplier(tiers, rng) : 0;
  return {
    isWin,
    winMultiplier,
    rewardCoins: isWin ? Math.round(coinCost * winMultiplier) : 0,
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

/** Expected sender return (TRP) — must stay < 1.0 for a house edge. */
export function expectedReturn(
  config: Pick<LuckyDrawConfig, 'winProbability' | 'winMultiplierTiers' | 'winMultiplier'>,
): number {
  const tiers = normalizeWinMultiplierTiers(config.winMultiplierTiers, config.winMultiplier);
  return config.winProbability * averageWinMultiplier(tiers);
}

/** Total payout ratio incl. the receiver cut — surfaced to admin. */
export function totalPayoutRatio(config: LuckyDrawConfig): number {
  return expectedReturn(config) + config.receiverBenefitPercent / 100;
}

export function parseWinMultiplierTiersJson(value: unknown): LuckyMultiplierTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const multiplier = Number((row as LuckyMultiplierTier).multiplier);
      const weight = Number((row as LuckyMultiplierTier).weight);
      if (!Number.isFinite(multiplier) || !Number.isFinite(weight)) return null;
      return { multiplier, weight };
    })
    .filter((row): row is LuckyMultiplierTier => row !== null);
}
