/**
 * BullMQ worker + optional schedulers (node-cron jobs that do not need Socket.io).
 *
 * Run: `npm run worker` (prod) or `npm run dev:worker` (dev).
 *
 * **Split deploy (e.g. Render):**
 * - Web service: `node dist/server.js` with `ENABLE_SCHEDULER=false` so only HTTP + Socket.io run there.
 * - Worker service: `node dist/worker.js` with `ENABLE_SCHEDULER=true` for cron sweeps + BullMQ.
 *
 * PK matchmaking stays on the web process (`initSocketServer`); it uses Redis locks per tick.
 */
import './config/env';

import { prisma } from './config/prisma';
import { env } from './config/env';
import { startLeaderboardResetJobs } from './jobs/leaderboard-reset.job';
import { startCurrencySyncJob } from './jobs/currency-sync.job';
import { startSpecialIdExpiryJob } from './jobs/special-id-expiry.job';
import { startCalculatorCleanupJob } from './jobs/calculator-cleanup.job';
import { startBanExpiryJob } from './jobs/ban-expiry.job';
import { startWithdrawalEscalationJob } from './jobs/withdrawal-escalation.job';
import { startWithdrawalAutoConfirmJob } from './jobs/withdrawal-auto-confirm.job';
import { startStoreSaleScheduleJob } from './jobs/store-sale-schedule.job';
import { createSystemWorker } from './queues/system-worker';

async function shutdown(worker: import('bullmq').Worker, signal: string) {
  console.log(`Worker received ${signal}, closing…`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

async function main() {
  await prisma.$connect();
  console.log('✅ Worker: database connected');

  if (env.ENABLE_SCHEDULER === 'true') {
    startLeaderboardResetJobs();
    startCurrencySyncJob();
    startSpecialIdExpiryJob();
    startCalculatorCleanupJob();
    startBanExpiryJob();
    startWithdrawalEscalationJob();
    startWithdrawalAutoConfirmJob();
    startStoreSaleScheduleJob();
    console.log('⏱️  Worker: schedulers enabled');
  } else {
    console.log('⏱️  Worker: schedulers disabled (ENABLE_SCHEDULER=false)');
  }

  const worker = createSystemWorker();
  worker.on('failed', (job, err) => {
    console.error('[system-queue] job failed', job?.id, err?.message ?? err);
  });

  console.log('🧰 BullMQ system worker listening');

  const onSignal = (sig: string) => {
    void shutdown(worker, sig);
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}

main().catch((err) => {
  console.error('❌ Worker failed to start:', err);
  process.exit(1);
});
