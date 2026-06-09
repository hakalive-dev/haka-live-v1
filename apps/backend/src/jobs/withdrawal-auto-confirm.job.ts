import cron, { ScheduledTask } from 'node-cron';
import { withSchedulerLock } from '../utils/distributed-lock';
import { runWithdrawalAutoConfirm } from '../modules/wallet/wallet.service';

let task: ScheduledTask | null = null;

/**
 * Auto-confirm withdrawal receipt 2h after payroll proof upload when user has not tapped confirm.
 */
export async function runWithdrawalAutoConfirmJob(): Promise<number> {
  return runWithdrawalAutoConfirm();
}

export function startWithdrawalAutoConfirmJob(): void {
  if (task) return;
  task = cron.schedule('*/10 * * * *', () => {
    void withSchedulerLock('withdrawal-auto-confirm', 600, async () => {
      const n = await runWithdrawalAutoConfirmJob();
      if (n > 0) console.log(`[withdrawal-auto-confirm] auto-confirmed ${n} receipt(s)`);
    });
  });
}
