/**
 * Rebuild charmXp / charmLevel from gift history (sum of GiftTransaction.beanValue per host recipient).
 *
 * Charm XP is credited per gift using the full beanValue (not the 70% host wallet share).
 * Run after deploying synchronous addCharmXp in sendGift, or to repair users who missed queue workers.
 *
 *   npx ts-node prisma/backfill-charm-xp.ts
 */
import { PrismaClient } from "@prisma/client";
import { calcCharmLevel } from "../src/modules/levels/levels.service";

const prisma = new PrismaClient();

async function main() {
  const grouped = await prisma.giftTransaction.groupBy({
    by: ["recipientId"],
    _sum: { beanValue: true },
  });

  let updated = 0;
  for (const row of grouped) {
    const userId = row.recipientId;
    const charmXp = row._sum?.beanValue ?? 0;
    if (charmXp <= 0) continue;

    const charmLevel = calcCharmLevel(charmXp);
    await prisma.userLevel.upsert({
      where: { userId },
      create: { userId, charmXp: BigInt(charmXp), charmLevel },
      update: { charmXp: BigInt(charmXp), charmLevel },
    });
    updated += 1;
  }

  console.log(
    `Charm XP backfill: ${updated} user_levels rows upserted from ${grouped.length} gift recipients`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
