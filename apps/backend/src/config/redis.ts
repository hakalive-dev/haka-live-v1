import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

// Lifecycle visibility — without these the client is silent unless it errors,
// which makes it look like Redis "has no logs" even when it's working fine.
redis.on('connect', () => console.log('Redis: connecting…'));
redis.on('ready', () => console.log('Redis: ready'));
redis.on('reconnecting', (ms: number) => console.log(`Redis: reconnecting in ${ms}ms`));
redis.on('close', () => console.log('Redis: connection closed'));
