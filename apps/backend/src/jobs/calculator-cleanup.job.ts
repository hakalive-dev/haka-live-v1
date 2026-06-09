import cron, { ScheduledTask } from 'node-cron';
import { endSession } from '../modules/rooms/calculator.service';
import { prisma } from '../config/prisma';
import { withSchedulerLock } from '../utils/distributed-lock';

/**
 * Calculator session expiry sweep (node-cron).
 *
 * Runs every minute. Finds all CalculatorSession records that are
 * status='active' with endsAt <= now, then calls endSession to:
 *   1. Set session status to 'ended'
 *   2. Record endedAt timestamp
 *   3. Emit calculator:ended event via Socket.io
 */

let task: ScheduledTask | null = null;

async function sweepExpiredSessions(): Promise<void> {
  try {
    const now = new Date();
    const expired = await prisma.calculatorSession.findMany({
      where: { status: 'active', endsAt: { lte: now } },
    });

    if (expired.length === 0) return;

    for (const session of expired) {
      await endSession(session.id);
    }

    console.log(`⏱️  calculator cleanup sweep — ended ${expired.length} session(s)`);
  } catch (err: any) {
    console.error('❌ calculator cleanup sweep failed:', err?.message ?? err);
  }
}

export function startCalculatorCleanupJob(): void {
  if (task) return;
  task = cron.schedule('* * * * *', () => {
    void withSchedulerLock('calculator:cleanup-sweep', 90, sweepExpiredSessions);
  });
  console.log('⏱️  calculator cleanup scheduled (every minute)');
}

export function stopCalculatorCleanupJob(): void {
  task?.stop();
  task = null;
}
