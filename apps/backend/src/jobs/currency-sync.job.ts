import cron, { ScheduledTask } from 'node-cron';
import {
  syncFromPublicApi,
  ensureSeeded,
  bulkImportFromPublicApi,
} from '../modules/payments/currency.service';
import { prisma } from '../config/prisma';
import { withSchedulerLock } from '../utils/distributed-lock';

let task: ScheduledTask | null = null;

export function startCurrencySyncJob(): void {
  if (task) return;

  // Seed defaults on boot if table is empty, then run an initial sync (single winner across replicas).
  void withSchedulerLock('currency:initial-sync', 300, async () => {
    await ensureSeeded();
    const count = await prisma.currencyRate.count();
    if (count < 50) {
      const imp = await bulkImportFromPublicApi();
      console.log(`💱 currency bulk import — created ${imp.created}, updated ${imp.updated}, skipped ${imp.skipped}`);
    }
    const r = await syncFromPublicApi();
    console.log(`💱 currency initial sync — updated ${r.updated}, skipped ${r.skipped}`);
  }).catch((e) => console.error('💱 currency initial sync failed:', e?.message ?? e));

  // Daily at 01:00 server time
  task = cron.schedule('0 1 * * *', () => {
    void withSchedulerLock('currency:daily-sync', 600, async () => {
      const r = await syncFromPublicApi();
      console.log(`💱 currency daily sync — updated ${r.updated}, skipped ${r.skipped}`);
    }).catch((e: any) => console.error('💱 currency daily sync failed:', e?.message ?? e));
  });

  console.log('⏱️  currency sync job scheduled (daily 01:00)');
}
