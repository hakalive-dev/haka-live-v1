import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../config/prisma';
import { withSchedulerLock } from '../utils/distributed-lock';
import { reassignOrEscalate } from '../modules/payroll-agent/payroll-agent.service';

const SLA_MS = 4 * 60 * 60 * 1000;

let task: ScheduledTask | null = null;

/**
 * For each assigned withdrawal past 4h SLA, tries to auto-reassign to another
 * agent in the same country. Falls back to admin escalation if no agent available.
 * Run from worker cron every 15 minutes.
 */
export async function runWithdrawalEscalationCheck(): Promise<number> {
  const cutoff = new Date(Date.now() - SLA_MS);

  const stale = await prisma.withdrawalRequest.findMany({
    where: {
      status: 'assigned',
      assignedAt: { lte: cutoff },
      escalatedAt: null,
      frozenByAdminId: null,
    },
    take: 100,
    select: { id: true, assignedAgentId: true },
  });

  for (const row of stale) {
    await reassignOrEscalate(row.id, row.assignedAgentId ?? undefined);
  }

  return stale.length;
}

export function startWithdrawalEscalationJob(): void {
  if (task) return;
  task = cron.schedule('*/15 * * * *', () => {
    void withSchedulerLock('withdrawal-escalation', 900, async () => {
      const n = await runWithdrawalEscalationCheck();
      if (n > 0) console.log(`[withdrawal-escalation] processed ${n} stale request(s)`);
    });
  });
}
