import {
  isStateRankingEnabled,
  normalizeCountryCode,
} from './state-ranking.constants';

export type StateRankingHostSnapshot = {
  role: string;
  gender: string;
  faceVerificationStatus: string;
  country: string;
  state: string;
};

export function stateHostsRedisKey(countryCode: string, stateCode: string, dateKey: string): string {
  const country = normalizeCountryCode(countryCode);
  const state = stateCode.trim().toUpperCase();
  return `leaderboard:state:hosts:daily:${country}:${state}:${dateKey}`;
}

export function stateTotalsRedisKey(countryCode: string, dateKey: string): string {
  const country = normalizeCountryCode(countryCode);
  return `leaderboard:state:totals:daily:${country}:${dateKey}`;
}

export function stateRankingKeyPrefix(countryCode: string, dateKey: string): string {
  const country = normalizeCountryCode(countryCode);
  return `leaderboard:state:hosts:daily:${country}:`;
}

export function stateRankingHostsPattern(countryCode: string, dateKey: string): string {
  return `${stateRankingKeyPrefix(countryCode, dateKey)}*`;
}

export function stateRankingTotalsPattern(dateKey: string): string {
  return `leaderboard:state:totals:daily:*:${dateKey}`;
}

/** UTC date string YYYY-MM-DD for daily board keys. */
export function dailyDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isStateRankingEligibleHost(snapshot: StateRankingHostSnapshot): boolean {
  return (
    snapshot.role === 'host' &&
    snapshot.gender === 'female' &&
    snapshot.faceVerificationStatus === 'approved' &&
    snapshot.state.trim() !== '' &&
    isStateRankingEnabled(snapshot.country)
  );
}
