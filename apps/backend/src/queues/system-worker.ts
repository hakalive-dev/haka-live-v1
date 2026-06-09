import { Worker, Job } from 'bullmq';
import { createBullMqConnection } from '../config/bullmq-redis';
import { SYSTEM_QUEUE_NAME, SystemJobNames } from './system-queue';
import type { GiftSideEffectsJobData } from './gift-side-effects';
import { processGiftSideEffects } from './gift-side-effects';
import type { LevelTaskClaimJobData } from './level-task-claim.queue';
import { processLevelTaskClaimJob } from '../modules/hosts/level-task-claim.processor';
import type { StoreBulkDistributeJobData } from '../modules/admin/store/admin-store-distribution.service';
import { processStoreBulkDistributeJob } from '../modules/admin/store/admin-store-distribution.service';

async function processSystemJob(job: Job): Promise<void> {
  switch (job.name) {
    case SystemJobNames.PING:
      console.log(`[system-queue] ping job=${job.id} message=${(job.data as { message?: string })?.message ?? ''}`);
      return;
    case SystemJobNames.GIFT_SIDE_EFFECTS:
      await processGiftSideEffects(job.data as GiftSideEffectsJobData);
      return;
    case SystemJobNames.LEVEL_TASK_CLAIM:
      await processLevelTaskClaimJob(job.data as LevelTaskClaimJobData);
      return;
    case SystemJobNames.STORE_BULK_DISTRIBUTE:
      await processStoreBulkDistributeJob(job.data as StoreBulkDistributeJobData);
      return;
    default:
      console.warn(`[system-queue] unknown job name=${job.name}`);
  }
}

export function createSystemWorker(): Worker {
  return new Worker(SYSTEM_QUEUE_NAME, processSystemJob, {
    connection: createBullMqConnection(),
    concurrency: 5,
  });
}
