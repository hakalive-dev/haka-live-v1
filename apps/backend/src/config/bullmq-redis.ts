/**
 * Dedicated ioredis connections for BullMQ.
 *
 * ## Render Redis vs Upstash (or other serverless Redis)
 *
 * BullMQ relies on **blocking reads**, **Lua scripts**, and **long-lived connections**.
 * Use a **TCP Redis** that fully supports those primitives (Render’s managed Redis, ElastiCache,
 * Redis Cloud, etc.) in the **same region** as your API/worker processes to keep latency low.
 *
 * **Upstash** and similar HTTP/serverless offerings may work on some tiers but are **not
 * automatically equivalent**: validate against BullMQ’s requirements (blocking commands,
 * connection limits, TLS). If you migrate brokers, re-run integration tests against the
 * `system` queue and Socket.io (both may share `REDIS_URL` — key namespaces differ; no conflict
 * expected).
 *
 * **Required for BullMQ:** `maxRetriesPerRequest: null` (BullMQ sets blocking mode on ioredis).
 *
 * @see https://docs.bullmq.io/
 */
import Redis from 'ioredis';
import { env } from './env';

export function createBullMqConnection(): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  // Without an 'error' listener ioredis logs "missing 'error' handler" and an
  // emitted error can surface as an unhandled exception. Keep it quiet + safe.
  connection.on('error', (err) => {
    console.error('BullMQ Redis error:', err.message);
  });
  return connection;
}
