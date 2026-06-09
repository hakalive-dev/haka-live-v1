import { prisma } from '../src/config/prisma';

async function main() {
  // For every host that has ever started a room, set lastLiveAt to the latest room start.
  const grouped = await prisma.room.groupBy({
    by: ['hostId'],
    _max: { startedAt: true },
    where: { startedAt: { not: null } },
  });

  let updated = 0;
  for (const row of grouped) {
    if (!row._max.startedAt) continue;
    await prisma.user.update({
      where: { id: row.hostId },
      data: { lastLiveAt: row._max.startedAt },
    });
    updated++;
  }
  console.log(`Backfilled lastLiveAt for ${updated} hosts.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
