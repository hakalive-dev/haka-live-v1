import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { userSummarySelect, serializeUserSummary } from '../users/user-summary';
import { mergeAndRank, getActiveHouseEntries } from './house-entries.service';
import type { Period } from './regional-earner-keys';

export type { Period } from './regional-earner-keys';
export {
  buildRegionKeyFromUserCountryCity,
  displayCountryName,
  regionalEarnerKeyPrefix,
  regionalEarnerRedisKey,
} from './regional-earner-keys';
import {
  buildRegionKeyFromUserCountryCity,
  regionalEarnerRedisKey,
} from './regional-earner-keys';
export const KEYS = {
  RICH_ALL: 'leaderboard:rich:all',
  CHARM_ALL: 'leaderboard:charm:all',

  // Periodic gifter / earner leaderboards (reset by leaderboard-reset.job.ts)
  GIFTERS_DAILY:   'leaderboard:gifters:daily',
  GIFTERS_WEEKLY:  'leaderboard:gifters:weekly',
  GIFTERS_MONTHLY: 'leaderboard:gifters:monthly',
  EARNERS_DAILY:   'leaderboard:earners:daily',
  EARNERS_WEEKLY:  'leaderboard:earners:weekly',
  EARNERS_MONTHLY: 'leaderboard:earners:monthly',

  // Agency leaderboard — total beans earned by each agent's host roster
  AGENCY_DAILY:   'leaderboard:agency:daily',
  AGENCY_WEEKLY:  'leaderboard:agency:weekly',
  AGENCY_MONTHLY: 'leaderboard:agency:monthly',

  // Invite leaderboard — weekly top inviters
  INVITES_WEEKLY: 'leaderboard:invites:weekly',

  // Creator leaderboard — beans earned by female hosts (Rank tab)
  CREATOR_DAILY:   'leaderboard:creators:daily',
  CREATOR_WEEKLY:  'leaderboard:creators:weekly',
  CREATOR_MONTHLY: 'leaderboard:creators:monthly',

  // Lucky Winners — total coins WON playing lucky gifts (wins only)
  LUCKY_WINNERS_DAILY:   'leaderboard:lucky_winners:daily',
  LUCKY_WINNERS_WEEKLY:  'leaderboard:lucky_winners:weekly',
  LUCKY_WINNERS_MONTHLY: 'leaderboard:lucky_winners:monthly',
} as const;

export type LeaderboardKey = (typeof KEYS)[keyof typeof KEYS];

export const PERIODIC_KEYS: Record<Period, string[]> = {
  daily:   [KEYS.GIFTERS_DAILY,   KEYS.EARNERS_DAILY,   KEYS.AGENCY_DAILY,   KEYS.CREATOR_DAILY,   KEYS.LUCKY_WINNERS_DAILY],
  weekly:  [KEYS.GIFTERS_WEEKLY,  KEYS.EARNERS_WEEKLY,  KEYS.AGENCY_WEEKLY,  KEYS.INVITES_WEEKLY, KEYS.CREATOR_WEEKLY,  KEYS.LUCKY_WINNERS_WEEKLY],
  monthly: [KEYS.GIFTERS_MONTHLY, KEYS.EARNERS_MONTHLY, KEYS.AGENCY_MONTHLY, KEYS.CREATOR_MONTHLY, KEYS.LUCKY_WINNERS_MONTHLY],
};

function gifterKeys(): string[] {
  return [KEYS.GIFTERS_DAILY, KEYS.GIFTERS_WEEKLY, KEYS.GIFTERS_MONTHLY];
}

function earnerKeys(): string[] {
  return [KEYS.EARNERS_DAILY, KEYS.EARNERS_WEEKLY, KEYS.EARNERS_MONTHLY];
}

function agencyKeys(): string[] {
  return [KEYS.AGENCY_DAILY, KEYS.AGENCY_WEEKLY, KEYS.AGENCY_MONTHLY];
}

function creatorKeys(): string[] {
  return [KEYS.CREATOR_DAILY, KEYS.CREATOR_WEEKLY, KEYS.CREATOR_MONTHLY];
}

function luckyWinnerKeys(): string[] {
  return [KEYS.LUCKY_WINNERS_DAILY, KEYS.LUCKY_WINNERS_WEEKLY, KEYS.LUCKY_WINNERS_MONTHLY];
}

export const CREATOR_KEY_BY_PERIOD = {
  daily:   'CREATOR_DAILY',
  weekly:  'CREATOR_WEEKLY',
  monthly: 'CREATOR_MONTHLY',
} as const;

// ── Score update helpers ──────────────────────────────────────────────────────

/**
 * Update a user's rich score (rich XP) on the rich leaderboard.
 */
export async function updateRichScore(userId: string, delta: number): Promise<void> {
  await redis.zincrby(KEYS.RICH_ALL, delta, userId);
}

/**
 * Increment a user's charm score on the charm leaderboard by the delta amount.
 */
export async function updateCharmScore(userId: string, delta: number): Promise<void> {
  await redis.zincrby(KEYS.CHARM_ALL, delta, userId);
}

/**
 * Increment a user's gifter score by coins spent, across all three periods.
 * Reset cadence is handled by leaderboard-reset.job.ts.
 */
export async function updateGifterScore(userId: string, coins: number): Promise<void> {
  const pipeline = redis.pipeline();
  for (const key of gifterKeys()) pipeline.zincrby(key, coins, userId);
  await pipeline.exec();
}

/**
 * Increment a user's earner score by beans received, across all three periods.
 * If the user has an agent, also credit the agent's agency board by the same amount.
 */
export async function updateEarnerScore(userId: string, beans: number): Promise<void> {
  const host = await prisma.user.findUnique({
    where: { id: userId },
    select: { agentId: true, country: true, city: true, role: true, gender: true },
  });

  const pipeline = redis.pipeline();
  for (const key of earnerKeys()) pipeline.zincrby(key, beans, userId);

  if (host?.agentId) {
    for (const key of agencyKeys()) pipeline.zincrby(key, beans, host.agentId);
  }

  if (host?.role === 'host' && host.gender === 'female') {
    for (const key of creatorKeys()) pipeline.zincrby(key, beans, userId);
  }

  const regionKey = buildRegionKeyFromUserCountryCity(host?.country ?? '', host?.city ?? '');
  if (regionKey) {
    const periods: Period[] = ['daily', 'weekly', 'monthly'];
    for (const p of periods) {
      pipeline.zincrby(regionalEarnerRedisKey(p, regionKey), beans, userId);
    }
  }

  await pipeline.exec();
}

/**
 * Increment a user's weekly invite score (+1 per accepted invite).
 */
export async function updateInviteScore(userId: string, count = 1): Promise<void> {
  await redis.zincrby(KEYS.INVITES_WEEKLY, count, userId);
}

/**
 * Increment a user's Lucky Winners score by coins won, across all three periods.
 * Wins only — losses and the host's receiver cut do not score.
 */
export async function updateLuckyWinnerScore(userId: string, rewardCoins: number): Promise<void> {
  if (rewardCoins <= 0) return;
  const pipeline = redis.pipeline();
  for (const key of luckyWinnerKeys()) pipeline.zincrby(key, rewardCoins, userId);
  await pipeline.exec();
}

// ── Leaderboard query helpers ─────────────────────────────────────────────────

/**
 * Parse the flat array returned by ZREVRANGE ... WITHSCORES into typed objects.
 * Redis returns ['userId1', 'score1', 'userId2', 'score2', ...].
 */
function parseWithScores(raw: string[]): Array<{ userId: string; score: number }> {
  const entries: Array<{ userId: string; score: number }> = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ userId: raw[i], score: parseFloat(raw[i + 1]) });
  }
  return entries;
}

/** Agency owner user IDs excluded from Top Agency board (gift-bonus program active). */
async function excludedAgencyLeaderboardOwnerIds(): Promise<Set<string>> {
  const bonusSetting = await prisma.giftBonusSetting.findUniqueOrThrow({
    where: { id: 'singleton' },
  });
  if (!bonusSetting.enabled) return new Set();

  const rows = await prisma.agency.findMany({
    where: { giftBonusEnabled: true, status: 'active' },
    select: { ownerId: true },
  });
  return new Set(rows.map((r) => r.ownerId));
}

/**
 * Agency leaderboard with gift-bonus-program agencies hidden from the Rank tab.
 */
export async function getAgencyLeaderboard(
  key: string,
  page: number,
  limit: number,
) {
  const excluded = await excludedAgencyLeaderboardOwnerIds();
  const data = await getLeaderboard(key, page, limit);
  data.items = data.items.filter((item) => !excluded.has(item.user.id));
  return data;
}

/** Female-host creator leaderboard (beans earned in period). */
export async function getCreatorLeaderboard(
  key: string,
  page: number,
  limit: number,
) {
  // Activity board blends in admin-seeded house entries (read-time only; real scores untouched).
  const house = await getActiveHouseEntries('creator');
  return getLeaderboard(key, page, limit, house);
}

/**
 * Get paginated leaderboard entries for a given Redis sorted set key.
 * Fetches user profiles in bulk from Postgres.
 */
export async function getLeaderboard(
  key: string,
  page: number,
  limit: number,
  /** Admin-seeded house entries to blend into the top window (page 1 only). Empty for most boards. */
  house: Array<{ userId: string; income: number }> = [],
) {
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  // Each entry as {userId, score, rank}. House entries are merged into the top window only
  // (page 1), where injected ranks must be globally correct; deeper pages read raw.
  let ranked: Array<{ userId: string; score: number; rank: number }>;
  let total: number;

  if (house.length > 0 && page === 1) {
    const raw = await redis.zrevrange(key, 0, limit + house.length - 1, 'WITHSCORES');
    const real = parseWithScores(raw).map((e) => ({ userId: e.userId, score: e.score }));
    const realIds = new Set(real.map((r) => r.userId));
    ranked = mergeAndRank(real, house, limit).entries.map((e) => ({
      userId: e.userId,
      score: e.score,
      rank: e.rank,
    }));
    total = (await redis.zcard(key)) + house.filter((h) => !realIds.has(h.userId)).length;
  } else {
    const raw = await redis.zrevrange(key, start, end, 'WITHSCORES');
    ranked = parseWithScores(raw).map((e, idx) => ({
      userId: e.userId,
      score: e.score,
      rank: start + idx + 1,
    }));
    total = await redis.zcard(key);
  }

  if (ranked.length === 0) {
    return { items: [], total: 0, page, limit, hasMore: false };
  }

  const userIds = ranked.map((e) => e.userId);
  const [users, hiddenSettings] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: userSummarySelect(),
    }),
    prisma.userSettings.findMany({
      where: { userId: { in: userIds }, mysteryManRank: true },
      select: { userId: true },
    }),
  ]);

  const hiddenIds = new Set(hiddenSettings.map((s) => s.userId));
  const userMap = new Map(users.map((u) => [u.id, serializeUserSummary(u)]));

  const items = ranked.map((entry) => {
    const u = userMap.get(entry.userId) ?? {
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
    };
    const masked = hiddenIds.has(entry.userId)
      ? {
          id: u.id,
          username: null,
          displayName: 'Mystery',
          avatar: '',
          hakaId: null,
          equippedFrame: null,
          activeSpecialId: null,
          activeSpecialIdLevel: null,
          richLevel: 1,
          charmLevel: 1,
        }
      : u;
    return {
      rank: entry.rank,
      score: entry.score,
      user: masked,
    };
  });

  return {
    items,
    total,
    page,
    limit,
    hasMore: start + limit < total,
  };
}

/** Sum of all member scores in a Redis sorted-set leaderboard. */
export async function sumLeaderboardScores(key: string): Promise<number> {
  const raw = await redis.zrevrange(key, 0, -1, 'WITHSCORES');
  return parseWithScores(raw).reduce((sum, e) => sum + e.score, 0);
}

/** Start of the current weekly leaderboard window (Monday 00:00 local). */
export function getWeeklyPeriodStart(): Date {
  return periodStart('weekly');
}

/**
 * Return the start timestamp for a leaderboard period window.
 */
function periodStart(period: Period): Date {
  const now = new Date();
  if (period === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'weekly') {
    const day = now.getDay(); // 0 = Sunday
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(now.getFullYear(), now.getMonth(), diff);
  }
  // monthly
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Top fans (gifters) for a specific recipient, ordered by coins gifted in the period.
 */
export async function getTopFans(recipientId: string, period: Period, limit = 50) {
  const since = periodStart(period);
  const rows = await prisma.giftTransaction.groupBy({
    by: ['senderId'],
    where: { recipientId, createdAt: { gte: since } },
    _sum: { coinCost: true },
    orderBy: { _sum: { coinCost: 'desc' } },
    take: limit,
  });

  if (rows.length === 0) return [];

  const senderIds = rows.map((r) => r.senderId);
  const users = await prisma.user.findMany({
    where: { id: { in: senderIds } },
    select: { id: true, displayName: true, avatar: true, hakaId: true, activeSpecialId: true, activeSpecialIdLevel: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((r, i) => ({
    rank: i + 1,
    user: userMap.get(r.senderId) ?? null,
    coinsGifted: r._sum.coinCost ?? 0,
  }));
}

/**
 * Get the 1-indexed rank of a user on a given leaderboard.
 * Returns null if the user is not ranked.
 */
export async function getMyRank(key: string, userId: string) {
  const rank = await redis.zrevrank(key, userId);
  const score = await redis.zscore(key, userId);

  if (rank === null) {
    return { rank: null, score: null };
  }

  return {
    rank: rank + 1, // Convert 0-indexed to 1-indexed
    score: score !== null ? parseFloat(score) : null,
  };
}

/**
 * Current user's rank on the regional (city) earner board for the given period.
 */
export async function getMyRegionalEarnerRank(userId: string, period: Period) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { country: true, city: true },
  });
  const cityLabel = user?.city?.trim() || null;
  const regionKey = buildRegionKeyFromUserCountryCity(user?.country ?? '', user?.city ?? '');
  if (!regionKey) {
    return { rank: null, score: null, regionKey: null as string | null, cityLabel };
  }
  const key = regionalEarnerRedisKey(period, regionKey);
  const { rank, score } = await getMyRank(key, userId);
  return { rank, score, regionKey, cityLabel };
}

/**
 * Batch 1-indexed ranks on the daily regional earner board (null = not ranked).
 * `pairs` must be deduped by userId if the same id appears only once in the pipeline.
 */
export async function batchRegionalEarnerRanksByUserId(
  pairs: Array<{ userId: string; regionKey: string }>,
  period: Period = 'daily',
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (pairs.length === 0) return out;

  const pipeline = redis.pipeline();
  for (const { userId, regionKey } of pairs) {
    pipeline.zrevrank(regionalEarnerRedisKey(period, regionKey), userId);
  }

  const exec = await pipeline.exec();
  if (!exec) return out;

  for (let i = 0; i < pairs.length; i++) {
    const uid = pairs[i].userId;
    const tuple = exec[i];
    if (!tuple || tuple[0]) {
      out.set(uid, null);
      continue;
    }
    const rank = tuple[1] as number | null;
    if (rank === null || rank === undefined) {
      out.set(uid, null);
    } else {
      out.set(uid, rank + 1);
    }
  }

  return out;
}
