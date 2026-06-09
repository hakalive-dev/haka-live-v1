/**
 * Seeds Redis ZSETs for regional (city) earner leaderboards — same keys as
 * `leaderboard.service` / `listLiveRooms` badge. Used by `seed.ts` and `seed-demo.ts`.
 *
 * Idempotent per shard: deletes the three period keys for each distinct regionKey
 * touched, then ZADDs members with absolute scores.
 */

import Redis from 'ioredis';
import {
  buildRegionKeyFromUserCountryCity,
  regionalEarnerRedisKey,
  type Period,
} from '../src/modules/leaderboard/regional-earner-keys';

const PERIODS: Period[] = ['daily', 'weekly', 'monthly'];

export type RegionalEarnerSeedMember = {
  userId: string;
  country: string;
  city: string;
  /** Absolute bean score for this shard (higher = better rank). */
  beans: number;
};

/**
 * Replace regional earner boards for the given members' shards with ZADD scores.
 * Members sharing the same (country, city) end up on one ZSET per period.
 */
export async function seedRegionalEarnerRedisScores(members: RegionalEarnerSeedMember[]): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('  (skip regional earner Redis: REDIS_URL unset)');
    return;
  }

  const byShard = new Map<
    string,
    { regionKey: string; scores: Array<{ userId: string; beans: number }> }
  >();

  for (const m of members) {
    const regionKey = buildRegionKeyFromUserCountryCity(m.country, m.city);
    if (!regionKey) continue;
    let bucket = byShard.get(regionKey);
    if (!bucket) {
      bucket = { regionKey, scores: [] };
      byShard.set(regionKey, bucket);
    }
    bucket.scores.push({ userId: m.userId, beans: m.beans });
  }

  if (byShard.size === 0) return;

  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    connectTimeout: 5_000,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
  } catch (e) {
    console.log('  (skip regional earner Redis: could not connect)', e);
    redis.disconnect();
    return;
  }

  try {
    const pipe = redis.pipeline();
    for (const { regionKey } of byShard.values()) {
      for (const p of PERIODS) {
        pipe.unlink(regionalEarnerRedisKey(p, regionKey));
      }
    }

    for (const { regionKey, scores } of byShard.values()) {
      for (const p of PERIODS) {
        const key = regionalEarnerRedisKey(p, regionKey);
        const args: (string | number)[] = [];
        for (const { userId, beans } of scores) {
          args.push(beans, userId);
        }
        if (args.length > 0) pipe.zadd(key, ...args);
      }
    }

    await pipe.exec();
    console.log(`  Seeded regional earner Redis (${byShard.size} shard(s))`);
  } finally {
    await redis.quit().catch(() => {});
  }
}
