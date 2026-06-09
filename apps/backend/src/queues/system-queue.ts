import { Queue } from "bullmq";
import { createBullMqConnection } from "../config/bullmq-redis";

/** Default queue for durable async tasks (notifications fan-out, exports, etc.). */
export const SYSTEM_QUEUE_NAME = "system";

export const SystemJobNames = {
  /** Smoke / health — processor logs and completes. */
  PING: "ping",
  /** Leaderboards — after gift TX commits (charm XP is updated in the gift transaction). */
  GIFT_SIDE_EFFECTS: "gift.side_effects",
  /** Level task live/income claim — wallet credit + daily counters. */
  LEVEL_TASK_CLAIM: "level_task.claim",
  /** Admin bulk store item distribution to large audiences. */
  STORE_BULK_DISTRIBUTE: "store.bulk_distribute",
} as const;

let queueSingleton: Queue | null = null;

export function getSystemQueue(): Queue {
  if (!queueSingleton) {
    queueSingleton = new Queue(SYSTEM_QUEUE_NAME, {
      connection: createBullMqConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return queueSingleton;
}

/** Enqueue a trivial job to verify workers are consuming (ops smoke tests). */
export async function enqueueSystemPing(message = "ok"): Promise<void> {
  const q = getSystemQueue();
  await q.add(
    SystemJobNames.PING,
    { message },
    { attempts: 2, backoff: { type: "fixed", delay: 2000 } },
  );
}
