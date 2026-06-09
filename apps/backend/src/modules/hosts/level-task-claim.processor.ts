import { prisma } from '../../config/prisma';
import type { LevelTaskClaimJobData } from '../../queues/level-task-claim.queue';
import {
  executeClaimLevelTaskIncome,
  executeClaimLevelTaskLive,
} from './level-task.service';

export async function processLevelTaskClaimJob(data: LevelTaskClaimJobData): Promise<void> {
  const row = await prisma.hostLevelTaskClaim.findUnique({
    where: { jobId: data.jobId },
  });
  if (!row) {
    throw new Error('Claim record not found');
  }
  if (row.status === 'completed') return;

  try {
    const result =
      data.claimType === 'live'
        ? await executeClaimLevelTaskLive(data.userId)
        : await executeClaimLevelTaskIncome(data.userId);

    await prisma.hostLevelTaskClaim.update({
      where: { jobId: data.jobId },
      data: {
        status: 'completed',
        beansAwarded: result.beansAwarded,
        errorMessage: '',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claim failed';
    await prisma.hostLevelTaskClaim.update({
      where: { jobId: data.jobId },
      data: { status: 'failed', errorMessage: message },
    });
    throw err;
  }
}
