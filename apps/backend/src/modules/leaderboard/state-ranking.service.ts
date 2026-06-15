import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { userSummarySelect, serializeUserSummary } from '../users/user-summary';
import { hasSuperAdminPower } from '../moderation/super-admin-power';
import { getUserTagNames } from '../moderation/tags.service';
import { creditBeansInTx } from '../wallet/wallet.service';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_HOST_REWARD_SPLITS,
  DEFAULT_STATE_RANK_REWARD_TIERS,
  getStateName,
  getStatesForCountry,
  hostRewardAmount,
  isStateRankingEnabled,
  isValidStateForCountry,
  normalizeCountryCode,
  poolForStateRank,
  STATE_RANKING_COUNTRY_CODES,
  totalDailyPrizePoolForStateCount,
  type StateRankTier,
} from './state-ranking.constants';
import {
  dailyDateKey,
  isStateRankingEligibleHost,
  stateHostsRedisKey,
  stateTotalsRedisKey,
  type StateRankingHostSnapshot,
} from './state-ranking-keys';
import {
  getActiveStateHouseHosts,
  mergeStateTotals,
  houseIncomeByState,
  mergeAndRank,
} from './house-entries.service';

export type { StateRankingHostSnapshot };

export type StateRankingConfigDto = {
  enabled: boolean;
  topHostsPerState: number;
  hostSplitPercentages: number[];
  stateRankTiers: StateRankTier[];
  requireFaceVerification: boolean;
};

export type StateRankingHostPreview = {
  id: string;
  displayName: string;
  avatar: string | null;
  rank: number;
  score: number;
};

export type StateRankingRow = {
  rank: number;
  stateCode: string;
  stateName: string;
  totalGiftScore: number;
  poolReward: number;
  topHosts: StateRankingHostPreview[];
};

function parseWithScores(raw: string[]): Array<{ id: string; score: number }> {
  const entries: Array<{ id: string; score: number }> = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ id: raw[i]!, score: parseFloat(raw[i + 1]!) });
  }
  return entries;
}

export async function canInspectAllStateRankings(userId: string): Promise<boolean> {
  const [power, tagNames] = await Promise.all([
    hasSuperAdminPower(userId),
    getUserTagNames(userId),
  ]);
  return power || tagNames.includes('super_admin');
}

export async function getStateRankingConfig(): Promise<StateRankingConfigDto> {
  let row = await prisma.stateRankingConfig.findUnique({ where: { id: 'singleton' } });
  if (!row) {
    row = await prisma.stateRankingConfig.create({
      data: {
        id: 'singleton',
        stateRankTiers: DEFAULT_STATE_RANK_REWARD_TIERS as unknown as Prisma.InputJsonValue,
      },
    });
  }
  const tiers = (row.stateRankTiers as StateRankTier[] | null)?.length
    ? (row.stateRankTiers as StateRankTier[])
    : DEFAULT_STATE_RANK_REWARD_TIERS;
  const splits = (row.hostSplitPercentages as number[] | null)?.length
    ? (row.hostSplitPercentages as number[])
    : [...DEFAULT_HOST_REWARD_SPLITS];
  return {
    enabled: row.enabled,
    topHostsPerState: row.topHostsPerState,
    hostSplitPercentages: splits,
    stateRankTiers: tiers,
    requireFaceVerification: row.requireFaceVerification,
  };
}

export async function resolveCountryCodeForRequest(
  userId: string,
  userCountry: string,
  requestedCountryCode?: string,
): Promise<string> {
  const normalized = normalizeCountryCode(userCountry);
  if (!requestedCountryCode) return normalized;
  const req = normalizeCountryCode(requestedCountryCode);
  const inspector = await canInspectAllStateRankings(userId);
  if (!inspector) {
    const { AppError } = await import('../../middleware/error.middleware');
    throw new AppError('Cross-country state ranking requires inspector access', 403);
  }
  return req;
}

export async function updateStateHostScore(
  hostUserId: string,
  coinDelta: number,
  snapshot: StateRankingHostSnapshot,
  dateKey: string = dailyDateKey(),
): Promise<void> {
  if (coinDelta <= 0 || !isStateRankingEligibleHost(snapshot)) return;

  const countryCode = normalizeCountryCode(snapshot.country);
  const stateCode = snapshot.state.trim().toUpperCase();
  if (!isValidStateForCountry(countryCode, stateCode)) return;

  const hostsKey = stateHostsRedisKey(countryCode, stateCode, dateKey);
  const totalsKey = stateTotalsRedisKey(countryCode, dateKey);

  const pipeline = redis.pipeline();
  pipeline.zincrby(hostsKey, coinDelta, hostUserId);
  pipeline.zincrby(totalsKey, coinDelta, stateCode);
  await pipeline.exec();
}

async function fetchTopHostsForState(
  countryCode: string,
  stateCode: string,
  dateKey: string,
  limit: number,
  houseForState: Array<{ userId: string; income: number }> = [],
): Promise<StateRankingHostPreview[]> {
  const key = stateHostsRedisKey(countryCode, stateCode, dateKey);
  const raw = await redis.zrevrange(key, 0, limit + houseForState.length - 1, 'WITHSCORES');
  const real = parseWithScores(raw).map((e) => ({ userId: e.id, score: e.score }));
  const { entries } = mergeAndRank(real, houseForState, limit);
  if (entries.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: entries.map((e) => e.userId) } },
    select: { id: true, displayName: true, avatar: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return entries.map((e) => {
    const u = userMap.get(e.userId);
    return {
      id: e.userId,
      displayName: u?.displayName ?? '',
      avatar: u?.avatar || null,
      rank: e.rank,
      score: e.score,
    };
  });
}

export async function listStateRankings(
  countryCode: string,
  dateKey: string = dailyDateKey(),
  topHostPreview = 5,
): Promise<StateRankingRow[]> {
  const country = normalizeCountryCode(countryCode);
  if (!isStateRankingEnabled(country)) return [];

  const config = await getStateRankingConfig();
  const totalsKey = stateTotalsRedisKey(country, dateKey);
  const raw = await redis.zrevrange(totalsKey, 0, -1, 'WITHSCORES');
  const realTotals = parseWithScores(raw).map((e) => ({ stateCode: e.id.toUpperCase(), score: e.score }));

  // Blend admin-seeded house hosts: their income rolls into their state's total (read-time only).
  const houseHosts = (await getActiveStateHouseHosts()).filter((h) =>
    isValidStateForCountry(country, h.stateCode),
  );
  const houseByStateForHosts = groupHouseHostsByState(houseHosts);
  const totals = houseHosts.length
    ? mergeStateTotals(realTotals, houseIncomeByState(houseHosts))
    : realTotals;

  const rows: StateRankingRow[] = [];
  for (let i = 0; i < totals.length; i++) {
    const stateRank = i + 1;
    const stateCode = totals[i]!.stateCode;
    const stateName = getStateName(country, stateCode) ?? stateCode;
    const poolReward = poolForStateRank(stateRank, config.stateRankTiers);
    const previewLimit = stateRank <= 3 ? topHostPreview : 0;
    const topHosts =
      previewLimit > 0
        ? await fetchTopHostsForState(
            country,
            stateCode,
            dateKey,
            previewLimit,
            houseByStateForHosts.get(stateCode) ?? [],
          )
        : [];

    rows.push({
      rank: stateRank,
      stateCode,
      stateName,
      totalGiftScore: Math.floor(totals[i]!.score),
      poolReward,
      topHosts,
    });
  }

  return rows;
}

/** Group house hosts by state into {stateCode → [{userId, income}]} for per-state host merges. */
function groupHouseHostsByState(
  hosts: Array<{ userId: string; income: number; stateCode: string }>,
): Map<string, Array<{ userId: string; income: number }>> {
  const map = new Map<string, Array<{ userId: string; income: number }>>();
  for (const h of hosts) {
    const list = map.get(h.stateCode) ?? [];
    list.push({ userId: h.userId, income: h.income });
    map.set(h.stateCode, list);
  }
  return map;
}

export async function getStateRankingSummary(
  countryCode: string,
  dateKey: string = dailyDateKey(),
): Promise<{ totalDailyPrizePool: number; activeStateCount: number; dateKey: string }> {
  const country = normalizeCountryCode(countryCode);
  const config = await getStateRankingConfig();
  const totalsKey = stateTotalsRedisKey(country, dateKey);

  // Count distinct active states including any that exist only via house hosts.
  const realStates = new Set((await redis.zrange(totalsKey, 0, -1)).map((s) => s.toUpperCase()));
  const houseHosts = (await getActiveStateHouseHosts()).filter((h) =>
    isValidStateForCountry(country, h.stateCode),
  );
  for (const h of houseHosts) realStates.add(h.stateCode);
  const count = realStates.size;

  return {
    totalDailyPrizePool: totalDailyPrizePoolForStateCount(count, config.stateRankTiers),
    activeStateCount: count,
    dateKey,
  };
}

export async function getMyStateRankingRow(
  userId: string,
  countryCode: string,
  userStateCode: string,
  dateKey: string = dailyDateKey(),
): Promise<StateRankingRow | null> {
  const country = normalizeCountryCode(countryCode);
  const stateCode = userStateCode.trim().toUpperCase();
  if (!stateCode || !isValidStateForCountry(country, stateCode)) return null;

  const rows = await listStateRankings(country, dateKey, 0);
  const row = rows.find((r) => r.stateCode === stateCode);
  if (row) return row;

  const totalsKey = stateTotalsRedisKey(country, dateKey);
  const [rankIdx, scoreRaw] = await Promise.all([
    redis.zrevrank(totalsKey, stateCode),
    redis.zscore(totalsKey, stateCode),
  ]);
  if (scoreRaw == null) {
    return {
      rank: 0,
      stateCode,
      stateName: getStateName(country, stateCode) ?? stateCode,
      totalGiftScore: 0,
      poolReward: 0,
      topHosts: [],
    };
  }

  const config = await getStateRankingConfig();
  const rank = rankIdx != null ? rankIdx + 1 : 0;
  const poolReward = rank > 0 ? poolForStateRank(rank, config.stateRankTiers) : 0;

  return {
    rank,
    stateCode,
    stateName: getStateName(country, stateCode) ?? stateCode,
    totalGiftScore: Math.floor(parseFloat(scoreRaw)),
    poolReward,
    topHosts: [],
  };
}

export async function listStateHosts(
  countryCode: string,
  stateCode: string,
  dateKey: string,
  page: number,
  limit: number,
) {
  const country = normalizeCountryCode(countryCode);
  const state = stateCode.trim().toUpperCase();
  if (!isValidStateForCountry(country, state)) {
    return { items: [], page, limit, hasMore: false };
  }

  const key = stateHostsRedisKey(country, state, dateKey);
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  // House hosts for this state are merged into the top window (page 1), like the Activity board.
  const houseForState = (await getActiveStateHouseHosts())
    .filter((h) => h.stateCode === state && isValidStateForCountry(country, state))
    .map((h) => ({ userId: h.userId, income: h.income }));

  let ranked: Array<{ userId: string; score: number; rank: number }>;
  let total: number;
  if (houseForState.length > 0 && page === 1) {
    const raw = await redis.zrevrange(key, 0, limit + houseForState.length - 1, 'WITHSCORES');
    const real = parseWithScores(raw).map((e) => ({ userId: e.id, score: e.score }));
    const realIds = new Set(real.map((r) => r.userId));
    ranked = mergeAndRank(real, houseForState, limit).entries.map((e) => ({
      userId: e.userId,
      score: e.score,
      rank: e.rank,
    }));
    total = (await redis.zcard(key)) + houseForState.filter((h) => !realIds.has(h.userId)).length;
  } else {
    const raw = await redis.zrevrange(key, start, end, 'WITHSCORES');
    ranked = parseWithScores(raw).map((e, idx) => ({
      userId: e.id,
      score: e.score,
      rank: start + idx + 1,
    }));
    total = await redis.zcard(key);
  }

  if (ranked.length === 0) {
    return { items: [], page, limit, hasMore: false };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ranked.map((e) => e.userId) } },
    select: userSummarySelect(),
  });
  const userMap = new Map(users.map((u) => [u.id, serializeUserSummary(u)]));

  const items = ranked.map((entry) => ({
    rank: entry.rank,
    score: Math.floor(entry.score),
    user: userMap.get(entry.userId) ?? {
      id: entry.userId,
      username: null,
      displayName: '',
      avatar: '',
      hakaId: null,
      equippedFrame: null,
      activeSpecialId: null,
      activeSpecialIdLevel: null,
      richLevel: 1,
      charmLevel: 1,
    },
  }));

  return { items, page, limit, hasMore: start + limit < total };
}

export async function getMyHostRankInState(
  userId: string,
  countryCode: string,
  stateCode: string,
  dateKey: string,
) {
  const country = normalizeCountryCode(countryCode);
  const state = stateCode.trim().toUpperCase();
  const key = stateHostsRedisKey(country, state, dateKey);
  const rank = await redis.zrevrank(key, userId);
  const score = await redis.zscore(key, userId);
  if (rank == null) return { rank: null, score: null, eligible: false };
  return {
    rank: rank + 1,
    score: score != null ? Math.floor(parseFloat(score)) : null,
    eligible: true,
  };
}

/** Settle rewards for a country/day before Redis keys are deleted. */
export async function settleStateRankingRewards(
  countryCode: string,
  periodDate: Date,
  dateKey: string,
): Promise<number> {
  const country = normalizeCountryCode(countryCode);
  if (!isStateRankingEnabled(country)) return 0;

  const config = await getStateRankingConfig();
  if (!config.enabled) return 0;

  const totalsKey = stateTotalsRedisKey(country, dateKey);
  const raw = await redis.zrevrange(totalsKey, 0, -1, 'WITHSCORES');
  const realTotals = parseWithScores(raw).map((e) => ({ stateCode: e.id.toUpperCase(), score: e.score }));

  // Merge house hosts so payouts follow the SAME ranks users see: house income rolls into its
  // state's total (affects state rank → pool) and ranks among that state's hosts — but house
  // hosts are NEVER credited (they occupy ranks, real hosts are paid by their displayed rank).
  const houseHosts = (await getActiveStateHouseHosts()).filter((h) =>
    isValidStateForCountry(country, h.stateCode),
  );
  const houseByState = groupHouseHostsByState(houseHosts);
  const stateTotals = houseHosts.length
    ? mergeStateTotals(realTotals, houseIncomeByState(houseHosts))
    : realTotals;
  if (stateTotals.length === 0) return 0;

  const splits = config.hostSplitPercentages;
  const topN = config.topHostsPerState;
  let credited = 0;

  for (let i = 0; i < stateTotals.length; i++) {
    const stateRank = i + 1;
    const stateCode = stateTotals[i]!.stateCode;
    const poolTotal = poolForStateRank(stateRank, config.stateRankTiers);
    const houseForState = houseByState.get(stateCode) ?? [];
    const hostsKey = stateHostsRedisKey(country, stateCode, dateKey);
    const hostRaw = await redis.zrevrange(hostsKey, 0, topN + houseForState.length - 1, 'WITHSCORES');
    const realHosts = parseWithScores(hostRaw).map((e) => ({ userId: e.id, score: e.score }));
    const { entries: hosts } = mergeAndRank(realHosts, houseForState, topN);

    for (const host of hosts) {
      if (host.rank > splits.length) break; // only the top `splits.length` (4) hosts are paid
      if (host.isHouse) continue; // house hosts occupy the rank but are never credited
      const hostRank = host.rank as 1 | 2 | 3 | 4;
      const rewardAmount = hostRewardAmount(poolTotal, hostRank, splits);

      try {
        await prisma.$transaction(async (tx) => {
          const existing = await tx.stateRankingReward.findUnique({
            where: {
              userId_periodDate_countryCode_stateCode: {
                userId: host.userId,
                periodDate,
                countryCode: country,
                stateCode,
              },
            },
          });
          if (existing) return;

          const walletTx = await creditBeansInTx(
            tx,
            host.userId,
            rewardAmount,
            `state_ranking:${dateKey}:${country}:${stateCode}:${hostRank}`,
            `State ranking reward — ${getStateName(country, stateCode) ?? stateCode} #${hostRank}`,
          );

          await tx.stateRankingReward.create({
            data: {
              userId: host.userId,
              countryCode: country,
              stateCode,
              periodDate,
              stateRank,
              hostRankInState: hostRank,
              giftScore: Math.floor(host.score),
              poolTotal,
              rewardAmount,
              walletTxId: walletTx ? String(walletTx.id) : null,
            },
          });
        });
        credited++;
      } catch (err) {
        console.error('state ranking settlement failed', { country, stateCode, hostId: host.userId, err });
      }
    }
  }

  return credited;
}

export function listStateRankingEnabledCountries(): string[] {
  return [...STATE_RANKING_COUNTRY_CODES];
}

export async function suggestStateFromCoords(
  countryCode: string,
  _lat: number,
  _lng: number,
): Promise<{ stateCode: string | null; stateName: string | null }> {
  // v1: no external geocoder wired — client may map locally; return null
  void countryCode;
  return { stateCode: null, stateName: null };
}

export function getPublicStateConfig(countryCode: string) {
  const country = normalizeCountryCode(countryCode);
  return {
    enabled: isStateRankingEnabled(country),
    countryCode: country,
    states: getStatesForCountry(country),
  };
}
