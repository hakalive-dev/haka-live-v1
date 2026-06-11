/**
 * Lucky Gifts draw engine — pure and deterministic under an injected RNG.
 *
 * A Lucky Gift (Gift.category === 'lucky') is a probability-based game:
 *   win  → sender is credited round(coinCost × winMultiplier) coins
 *   lose → no sender reward
 * In both cases the host's bean pool is reduced to
 * round(coinCost × receiverBenefitPercent / 100) — that reduced cut funds wins.
 *
 * Server-authoritative: the client never influences the outcome.
 */

export interface LuckyDrawConfig {
  /** Chance of a win per send, 0 ≤ p ≤ 1. */
  winProbability: number;
  /** Win payout multiplier of the total coin cost. */
  winMultiplier: number;
  /** Host's % of gift value (0–1.5) replacing the normal bean share. */
  receiverBenefitPercent: number;
}

export interface LuckyDrawResult {
  isWin: boolean;
  /** Coins credited to the sender (0 on lose). */
  rewardCoins: number;
  /** Bean pool distributed to the receiver side instead of the normal beanValue. */
  receiverBeans: number;
}

export function runLuckyDraw(
  config: LuckyDrawConfig,
  coinCost: number,
  rng: () => number = Math.random,
): LuckyDrawResult {
  const isWin = rng() < config.winProbability;
  return {
    isWin,
    rewardCoins: isWin ? Math.round(coinCost * config.winMultiplier) : 0,
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
  config: Pick<LuckyDrawConfig, 'winProbability' | 'winMultiplier'>,
): number {
  return config.winProbability * config.winMultiplier;
}

/** Total payout ratio incl. the receiver cut — surfaced to admin. */
export function totalPayoutRatio(config: LuckyDrawConfig): number {
  return expectedReturn(config) + config.receiverBenefitPercent / 100;
}
