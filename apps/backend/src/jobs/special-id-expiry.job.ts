import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../config/prisma';
import { withSchedulerLock } from '../utils/distributed-lock';

/**
 * Special ID expiration sweep (node-cron).
 *
 * Runs every hour. Finds all SpecialIdInventory records that are
 * status='active' with expiresAt <= now, then:
 *   1. Sets inventory status to 'expired'
 *   2. Clears User.activeSpecialId + activeSpecialIdExpiresAt
 *   3. Sets the SpecialId record back to 'available' (can be repurchased)
 */

let task: ScheduledTask | null = null;

async function sweepExpiredSpecialIds(): Promise<void> {
  try {
    const now = new Date();
    const expired = await prisma.specialIdInventory.findMany({
      where: { status: 'active', expiresAt: { lte: now } },
      include: { specialId: true },
    });

    if (expired.length === 0) return;

    for (const inv of expired) {
      await prisma.$transaction(async (tx) => {
        // Mark inventory as expired
        await tx.specialIdInventory.update({
          where: { id: inv.id },
          data: { status: 'expired' },
        });
        // Clear user's active special ID
        await tx.user.update({
          where: { id: inv.userId },
          data: { activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null },
        });
        // Return the SpecialId to the store
        await tx.specialId.update({
          where: { id: inv.specialIdId },
          data: { status: 'available' },
        });
      });
    }

    console.log(`🔄 special-id expiry sweep — expired ${expired.length} record(s)`);
  } catch (err: any) {
    console.error('❌ special-id expiry sweep failed:', err?.message ?? err);
  }
}

export function startSpecialIdExpiryJob(): void {
  if (task) return;
  // Run every hour at minute 15
  task = cron.schedule('15 * * * *', () => {
    void withSchedulerLock('special-id:expiry-sweep', 3_600, sweepExpiredSpecialIds);
  });
  console.log('⏱️  special-id expiry sweep scheduled (hourly)');
}

export function stopSpecialIdExpiryJob(): void {
  task?.stop();
  task = null;
}
