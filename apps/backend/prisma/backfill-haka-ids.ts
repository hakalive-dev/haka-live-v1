/**
 * Backfill: regenerate every legacy non-9-digit User.hakaId to the new
 * 9-digit format. New namespace is distinct from the 6-digit Special ID
 * namespace (UserStoreItem.customHakaId), so there is no cross-table
 * collision risk — we only need to stay unique within User.hakaId.
 *
 * Safe to re-run: idempotent. Users whose hakaId is already 9 digits are
 * skipped, so repeated runs are a no-op after the first success.
 *
 * Run:
 *   npx ts-node prisma/backfill-haka-ids.ts
 *   npx ts-node prisma/backfill-haka-ids.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { generateUniqueHakaId } from '../src/utils/hakaId';

const prisma = new PrismaClient();

interface Outcome {
  userId: string;
  displayName: string;
  oldHakaId: string;
  newHakaId: string;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`\n🔧 Haka ID backfill${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Fetch every user with a non-null hakaId; filter by length in-memory
  // (Prisma doesn't expose a length predicate on string fields).
  const candidates = await prisma.user.findMany({
    where: { hakaId: { not: null } },
    select: { id: true, displayName: true, username: true, hakaId: true },
    orderBy: { createdAt: 'asc' },
  });

  const toUpdate = candidates.filter((u) => u.hakaId !== null && u.hakaId.length !== 9);

  console.log(`Scanned ${candidates.length} user(s) with a hakaId.`);
  console.log(`Found ${toUpdate.length} that need regeneration to 9-digit format.\n`);

  if (toUpdate.length === 0) {
    console.log('✓ Nothing to do — all hakaIds are already 9 digits.\n');
    await prisma.$disconnect();
    return;
  }

  const outcomes: Outcome[] = [];
  let failed = 0;

  for (const user of toUpdate) {
    try {
      const newHakaId = await generateUniqueHakaId();

      if (!dryRun) {
        await prisma.user.update({
          where: { id: user.id },
          data: { hakaId: newHakaId },
        });
      }

      outcomes.push({
        userId: user.id,
        displayName: user.displayName || user.username || '(no name)',
        oldHakaId: user.hakaId!,
        newHakaId,
      });

      const arrow = dryRun ? 'would be' : 'now';
      console.log(
        `  ${outcomes.length.toString().padStart(4)}. ${user.displayName || user.username || '(no name)'}` +
        ` — ${user.hakaId} → ${newHakaId} (${arrow} updated)`,
      );
    } catch (err) {
      failed++;
      console.error(`  ✗ FAILED to backfill user ${user.id} (${user.displayName}):`, err instanceof Error ? err.message : err);
    }
  }

  console.log('');
  console.log(`── Summary ${'─'.repeat(50)}`);
  console.log(`  Updated: ${outcomes.length}${dryRun ? ' (dry run, no writes)' : ''}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${candidates.length - toUpdate.length} (already 9 digits)`);
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to apply changes.\n');
  } else {
    console.log('✓ Backfill complete.\n');
    console.log('Note: any dev-login or QA documentation referencing old 8-digit IDs');
    console.log('will need to be updated. Audit logs still reflect the old value at');
    console.log('the moment each action was recorded.\n');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error during backfill:', err);
  process.exit(1);
});
