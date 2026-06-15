/**
 * CLI: Haka Team welcome DM backfill.
 *
 *   npm run backfill:welcome-dm -- --dry-run
 *   node dist/scripts/backfill-welcome-dm.js
 *
 * Staging deploy hook: set RUN_WELCOME_DM_BACKFILL=true on the Render staging
 * service — server.ts runs this idempotently on boot (inbox only, no push).
 */

import '../config/env';
import { prisma } from '../config/prisma';
import { runWelcomeDmBackfill } from '../modules/chat/backfill-welcome-dm.service';

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const notify = argv.includes('--notify');
  const limitIdx = argv.indexOf('--limit');
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1] ? Math.max(1, parseInt(argv[limitIdx + 1], 10) || 0) : undefined;
  return { dryRun, notify, limit };
}

async function main() {
  const { dryRun, notify, limit } = parseArgs();

  console.log(`\nHaka Team welcome DM backfill${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`  Push notify: ${notify ? 'yes' : 'no (inbox only)'}`);
  if (limit) console.log(`  Limit: ${limit}`);
  console.log('');

  const result = await runWelcomeDmBackfill({ dryRun, notify, limit });

  console.log(`Onboarded users:      ${result.onboardedCount}`);
  console.log(`Already have welcome: ${result.alreadySentCount}`);
  console.log(`To send:              ${result.candidateCount}\n`);

  if (result.candidateCount === 0) {
    console.log('Nothing to do.\n');
    return;
  }

  console.log('');
  console.log(`── Summary ${'─'.repeat(50)}`);
  console.log(`  Sent:   ${result.sent}${dryRun ? ' (dry run, no writes)' : ''}`);
  console.log(`  Failed: ${result.failed}`);
  console.log('');

  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to apply.\n');
  } else {
    console.log('Backfill complete.\n');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error during backfill:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
