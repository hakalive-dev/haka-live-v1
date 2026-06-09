import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../config/prisma';
import { logAdminAction } from '../utils/audit';
import { withSchedulerLock } from '../utils/distributed-lock';

/**
 * Temporary ban auto-expiry sweep (node-cron).
 *
 * Runs every 60 seconds. Finds expired temporary bans / device bans and:
 *   1. Marks the row `isActive = false`.
 *   2. Restores the corresponding flag on the User:
 *        - type='platform' → User.isActive = true
 *        - type='host'     → User.isHostBanned = false
 *      (type='room' bans only block joins; nothing user-level to restore.)
 *   3. For DeviceBan rows, just deactivates them.
 *   4. Writes a `ban.auto_expire` / `device_ban.auto_expire` audit row with
 *      the synthetic 'system' actor so the action is traceable.
 *
 * The lazy expiry checks in moderation.service (`isUserBanned`,
 * `isUserBannedFromRoom`) remain as a backstop in case the cron is delayed.
 */

let task: ScheduledTask | null = null;

async function sweepExpiredBans(): Promise<void> {
  const now = new Date();

  try {
    const expired = await prisma.ban.findMany({
      where: {
        isActive: true,
        banType: 'temporary',
        expiresAt: { not: null, lte: now },
      },
      select: { id: true, userId: true, type: true },
    });

    for (const b of expired) {
      try {
        await prisma.ban.update({ where: { id: b.id }, data: { isActive: false } });

        if (b.type === 'platform') {
          // Only flip isActive back on if the user has no other active platform ban.
          const stillBanned = await prisma.ban.findFirst({
            where: { userId: b.userId, type: 'platform', isActive: true },
            select: { id: true },
          });
          if (!stillBanned) {
            await prisma.user.update({ where: { id: b.userId }, data: { isActive: true } });
          }
        } else if (b.type === 'host') {
          const stillHostBanned = await prisma.ban.findFirst({
            where: { userId: b.userId, type: 'host', isActive: true },
            select: { id: true },
          });
          if (!stillHostBanned) {
            await prisma.user.update({ where: { id: b.userId }, data: { isHostBanned: false } });
          }
        }

        await logAdminAction('system', 'ban.auto_expire', 'Ban', b.id, {
          userId: b.userId,
          type:   b.type,
        });
      } catch (innerErr: any) {
        console.error(`❌ ban-expiry: failed to deactivate ban ${b.id}:`, innerErr?.message ?? innerErr);
      }
    }

    if (expired.length > 0) {
      console.log(`🔄 ban-expiry sweep — deactivated ${expired.length} ban(s)`);
    }
  } catch (err: any) {
    console.error('❌ ban-expiry sweep failed:', err?.message ?? err);
  }

  try {
    const expiredDevice = await prisma.deviceBan.findMany({
      where: {
        isActive: true,
        expiresAt: { not: null, lte: now },
      },
      select: { id: true, deviceId: true },
    });

    for (const d of expiredDevice) {
      try {
        await prisma.deviceBan.update({ where: { id: d.id }, data: { isActive: false } });
        await logAdminAction('system', 'device_ban.auto_expire', 'DeviceBan', d.id, {
          deviceId: d.deviceId,
        });
      } catch (innerErr: any) {
        console.error(`❌ ban-expiry: failed to deactivate device ban ${d.id}:`, innerErr?.message ?? innerErr);
      }
    }

    if (expiredDevice.length > 0) {
      console.log(`🔄 ban-expiry sweep — deactivated ${expiredDevice.length} device ban(s)`);
    }
  } catch (err: any) {
    console.error('❌ device-ban-expiry sweep failed:', err?.message ?? err);
  }
}

export function startBanExpiryJob(): void {
  if (task) return;
  // Every 60 seconds.
  task = cron.schedule('* * * * *', () => {
    void withSchedulerLock('ban:expiry-sweep', 120, sweepExpiredBans);
  });
  console.log('⏱️  ban-expiry sweep scheduled (every 60s)');
  // Run once immediately on boot to clear anything that expired while down.
  void withSchedulerLock('ban:expiry-sweep-boot', 120, sweepExpiredBans).catch(() => {});
}

export function stopBanExpiryJob(): void {
  task?.stop();
  task = null;
}
