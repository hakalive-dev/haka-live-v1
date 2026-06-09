import { randomBytes } from 'crypto';
import { redis } from '../config/redis';

const LOCK_PREFIX = 'lock:scheduler:';

const releaseScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

async function releaseLock(key: string, token: string): Promise<void> {
  await redis.eval(releaseScript, 1, key, token);
}

/**
 * Runs `fn` only if this process wins a Redis SET NX lock.
 * Safe across multiple API/worker replicas (see plan: duplicate cron prevention).
 *
 * @param name Short stable id (e.g. `leaderboard:daily`)
 * @param ttlSeconds Lock TTL — must exceed worst-case `fn` duration or another replica may overlap
 * @returns whether work ran (`completed`), lock was held elsewhere (`skipped`), or lock failed to set (`skipped`)
 */
export async function withSchedulerLock(
  name: string,
  ttlSeconds: number,
  fn: () => Promise<void>,
): Promise<'completed' | 'skipped'> {
  const key = `${LOCK_PREFIX}${name}`;
  const token = randomBytes(16).toString('hex');
  const ok = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  if (ok !== 'OK') return 'skipped';
  try {
    await fn();
    await releaseLock(key, token);
    return 'completed';
  } catch (err) {
    await releaseLock(key, token).catch(() => {});
    throw err;
  }
}
