import cron, { ScheduledTask } from 'node-cron';
import { applyDueSaleSchedules } from '../modules/admin/store/admin-store-sale.service';
import { withSchedulerLock } from '../utils/distributed-lock';

let task: ScheduledTask | null = null;

async function runSweep(): Promise<void> {
  await withSchedulerLock('store-sale-schedule', 55, async () => {
    const count = await applyDueSaleSchedules();
    if (count > 0) {
      console.log(`[store-sale-schedule] applied ${count} schedule(s)`);
    }
  });
}

export function startStoreSaleScheduleJob(): void {
  if (task) return;
  task = cron.schedule('* * * * *', () => {
    void runSweep();
  });
  console.log('⏱️  store-sale-schedule job registered (every minute)');
}
