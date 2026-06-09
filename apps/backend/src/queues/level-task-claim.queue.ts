import { QueueEvents } from 'bullmq';
import { createBullMqConnection } from '../config/bullmq-redis';
import { prisma } from '../config/prisma';
import { getSystemQueue, SYSTEM_QUEUE_NAME, SystemJobNames } from './system-queue';
import { AppError } from '../middleware/error.middleware';

export type LevelTaskClaimJobData = {
  userId: string;
  claimType: 'live' | 'income';
  jobId: string;
};

let eventsSingleton: QueueEvents | null = null;

function getQueueEvents(): QueueEvents {
  if (!eventsSingleton) {
    eventsSingleton = new QueueEvents(SYSTEM_QUEUE_NAME, {
      connection: createBullMqConnection(),
    });
  }
  return eventsSingleton;
}

export async function enqueueLevelTaskClaim(
  userId: string,
  claimType: 'live' | 'income',
  jobId: string,
): Promise<{ jobId: string; beansAwarded: number }> {
  const queue = getSystemQueue();
  const job = await queue.add(
    SystemJobNames.LEVEL_TASK_CLAIM,
    { userId, claimType, jobId } satisfies LevelTaskClaimJobData,
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  const events = getQueueEvents();
  await job.waitUntilFinished(events, 30_000);

  const row = await prisma.hostLevelTaskClaim.findUnique({
    where: { jobId },
  });
  if (!row || row.status === 'failed') {
    throw new AppError(row?.errorMessage || 'Claim processing failed', 400);
  }
  return { jobId, beansAwarded: row.beansAwarded };
}
