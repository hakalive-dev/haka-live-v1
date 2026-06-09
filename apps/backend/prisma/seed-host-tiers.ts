import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TIERS = [
  { name: 'bronze',   hourlyRateBeans: 300, minWeeklyBeans: 0,     sortOrder: 1 },
  { name: 'silver',   hourlyRateBeans: 450, minWeeklyBeans: 5000,  sortOrder: 2 },
  { name: 'gold',     hourlyRateBeans: 600, minWeeklyBeans: 20000, sortOrder: 3 },
  { name: 'platinum', hourlyRateBeans: 900, minWeeklyBeans: 80000, sortOrder: 4 },
];

async function main() {
  for (const t of TIERS) {
    await prisma.hostTier.upsert({
      where: { name: t.name },
      create: t,
      update: t,
    });
  }
  console.log(`Seeded ${TIERS.length} host tiers`);
}

main().finally(() => prisma.$disconnect());
