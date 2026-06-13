import cron, { ScheduledTask } from 'node-cron';
import { redis } from '../config/redis';
import {
  PERIODIC_KEYS,
  regionalEarnerKeyPrefix,
  type Period,
} from '../modules/leaderboard/leaderboard.service';
import {
  settleStateRankingRewards,
  listStateRankingEnabledCountries,
} from '../modules/leaderboard/state-ranking.service';
import { dailyDateKey } from '../modules/leaderboard/state-ranking-keys';
import { withSchedulerLock } from '../utils/distributed-lock';

/**
 * Leaderboard reset scheduler (node-cron).
 *
 * Resets periodic Redis sorted sets at the start of each boundary:
 *   daily   — every day at 00:00
 *   weekly  — every Monday at 00:00
 *   monthly — 1st of each month at 00:00
 *
 * Server timezone is used (process.env.TZ, default UTC).
 *
 * Each run is wrapped in a Redis SET NX lock so multiple replicas do not double-delete keys.
 */

let tasks: ScheduledTask[] = [];

/** Delete all Redis keys matching `pattern` (SCAN + UNLINK), e.g. regional earner shards. */
async function deleteKeysMatching(pattern: string): Promise<number> {
  let deleted = 0;
  const batch: string[] = [];
  const stream = redis.scanStream({ match: pattern, count: 500 });
  try {
    for await (const keys of stream) {
      for (const k of keys as string[]) {
        batch.push(k);
        if (batch.length >= 500) {
          deleted += await redis.unlink(...batch);
          batch.length = 0;
        }
      }
    }
  } catch (err: any) {
    console.error('❌ leaderboard SCAN delete failed:', err?.message ?? err);
  }
  if (batch.length > 0) {
    deleted += await redis.unlink(...batch);
  }
  return deleted;
}

async function settleAndClearStateRankings(settlingDateKey: string): Promise<void> {
  const periodDate = new Date(`${settlingDateKey}T00:00:00.000Z`);
  for (const countryCode of listStateRankingEnabledCountries()) {
    try {
      const n = await settleStateRankingRewards(countryCode, periodDate, settlingDateKey);
      if (n > 0) {
        console.log(`🏆 state ranking settlement [${countryCode}] — credited ${n} host(s) for ${settlingDateKey}`);
      }
    } catch (err: any) {
      console.error(`❌ state ranking settlement [${countryCode}] failed:`, err?.message ?? err);
    }
  }
  const hostsDeleted = await deleteKeysMatching(
    `leaderboard:state:hosts:daily:*:*:${settlingDateKey}`,
  );
  const totalsDeleted = await deleteKeysMatching(
    `leaderboard:state:totals:daily:*:${settlingDateKey}`,
  );
  console.log(
    `🔄 state ranking keys cleared for ${settlingDateKey} — ${hostsDeleted} host shard(s), ${totalsDeleted} total key(s)`,
  );
}

async function resetKeys(keys: string[], label: string, regionalPeriod?: Period): Promise<void> {
  if (keys.length === 0) return;
  try {
    if (label === 'daily') {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const settlingDateKey = dailyDateKey(yesterday);
      await settleAndClearStateRankings(settlingDateKey);
    }

    const count = await redis.del(...keys);
    let regional = 0;
    if (regionalPeriod) {
      regional = await deleteKeysMatching(`${regionalEarnerKeyPrefix(regionalPeriod)}*`);
    }
    console.log(
      `🔄 leaderboard reset [${label}] — cleared ${count} fixed key(s)` +
        (regionalPeriod ? `, ${regional} regional earner key(s)` : ''),
    );
  } catch (err: any) {
    console.error(`❌ leaderboard reset [${label}] failed:`, err?.message ?? err);
  }
}

export function startLeaderboardResetJobs(): void {
  if (tasks.length > 0) return; // idempotent

  tasks.push(
    cron.schedule('0 0 * * *', () => {
      void withSchedulerLock('leaderboard:reset:daily', 120, () =>
        resetKeys(PERIODIC_KEYS.daily, 'daily', 'daily'),
      );
    }),
    cron.schedule('0 0 * * 1', () => {
      void withSchedulerLock('leaderboard:reset:weekly', 120, () =>
        resetKeys(PERIODIC_KEYS.weekly, 'weekly', 'weekly'),
      );
    }),
    cron.schedule('0 0 1 * *', () => {
      void withSchedulerLock('leaderboard:reset:monthly', 120, () =>
        resetKeys(PERIODIC_KEYS.monthly, 'monthly', 'monthly'),
      );
    }),
  );

  console.log('⏱️  leaderboard reset jobs scheduled (daily / weekly / monthly)');
}

export function stopLeaderboardResetJobs(): void {
  for (const t of tasks) t.stop();
  tasks = [];
}

export { settleAndClearStateRankings, deleteKeysMatching };
