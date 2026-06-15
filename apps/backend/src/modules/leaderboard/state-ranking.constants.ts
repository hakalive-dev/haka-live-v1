/**
 * State ranking constants (mirrors packages/shared-types/state-rankings.ts for backend bundle).
 */

export type StateSubdivision = { code: string; name: string };
export type StateRankTier = { stateRankMin: number; stateRankMax: number; poolTotal: number };

export const INDIA_STATES: StateSubdivision[] = [
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OD', name: 'Odisha' },
  { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UK', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
];

export const STATE_RANKING_COUNTRY_CODES = ['IN'] as const;

export const DEFAULT_STATE_RANK_REWARD_TIERS: StateRankTier[] = [
  { stateRankMin: 1, stateRankMax: 1, poolTotal: 4_000_000 },
  { stateRankMin: 2, stateRankMax: 2, poolTotal: 2_000_000 },
  { stateRankMin: 3, stateRankMax: 3, poolTotal: 1_000_000 },
  { stateRankMin: 4, stateRankMax: 6, poolTotal: 600_000 },
  { stateRankMin: 7, stateRankMax: 10, poolTotal: 300_000 },
  { stateRankMin: 11, stateRankMax: 15, poolTotal: 100_000 },
  { stateRankMin: 16, stateRankMax: 20, poolTotal: 40_000 },
  { stateRankMin: 21, stateRankMax: 30, poolTotal: 20_000 },
  { stateRankMin: 31, stateRankMax: 50, poolTotal: 10_000 },
];

export const DEFAULT_HOST_REWARD_SPLITS = [0.65, 0.2, 0.1, 0.05] as const;

const COUNTRY_ALIASES: Record<string, string> = { india: 'IN', in: 'IN' };

export function normalizeCountryCode(country: string): string {
  const raw = country.trim();
  if (!raw) return '';
  if (raw.length === 2) return raw.toUpperCase();
  const alias = COUNTRY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (raw.toLowerCase() === 'india') return 'IN';
  return raw.toUpperCase();
}

export function isStateRankingEnabled(countryCode: string): boolean {
  return normalizeCountryCode(countryCode) === 'IN';
}

export function getStatesForCountry(countryCode: string): StateSubdivision[] {
  return normalizeCountryCode(countryCode) === 'IN' ? INDIA_STATES : [];
}

export function getStateName(countryCode: string, stateCode: string): string | null {
  const code = stateCode.trim().toUpperCase();
  return getStatesForCountry(countryCode).find((s) => s.code === code)?.name ?? null;
}

export function isValidStateForCountry(countryCode: string, stateCode: string): boolean {
  return getStateName(countryCode, stateCode) != null;
}

export function poolForStateRank(stateRank: number, tiers: StateRankTier[]): number {
  const tier = tiers.find((t) => stateRank >= t.stateRankMin && stateRank <= t.stateRankMax);
  return tier?.poolTotal ?? tiers[tiers.length - 1]!.poolTotal;
}

export function hostRewardAmount(poolTotal: number, hostRank: 1 | 2 | 3 | 4, splits: number[]): number {
  const pct = splits[hostRank - 1] ?? DEFAULT_HOST_REWARD_SPLITS[hostRank - 1]!;
  return Math.floor(poolTotal * pct);
}

export function totalDailyPrizePoolForStateCount(activeStateCount: number, tiers: StateRankTier[]): number {
  let sum = 0;
  for (let rank = 1; rank <= activeStateCount; rank++) {
    sum += poolForStateRank(rank, tiers);
  }
  return sum;
}
