/**
 * Idempotent backfill:
 *   User.cumulativeBeansEarned  ← sum of bean wallet transactions where reference='gift_received'
 *   Agency.cumulativeHostIncome ← sum of host beans for agency's direct hosts
 *                                  (plus direct sub-agencies' hosts, which on first run will be zero
 *                                   because parent links don't exist yet).
 *
 * NOTE (spec §8.3): historic gift_received rows were credited at ~49% of coinCost
 * due to the double-70% bug. The counters reflect history-as-it-was, not what it
 * would have been after the migration. Accepted trade-off.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillUsers(): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } });
  let touched = 0;
  for (const { id } of users) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: id }, select: { id: true } });
    if (!wallet) continue;
    const agg = await prisma.walletTransaction.aggregate({
      where: { walletId: wallet.id, currency: 'beans', transactionType: 'credit', reference: 'gift_received' },
      _sum: { amount: true },
    });
    const total = BigInt(agg._sum.amount ?? 0);
    await prisma.user.update({
      where: { id },
      data: { cumulativeBeansEarned: total },
    });
    touched += 1;
  }
  return touched;
}

async function backfillAgencies(): Promise<number> {
  const agencies = await prisma.agency.findMany({ select: { id: true, ownerId: true } });
  let touched = 0;
  for (const { id, ownerId } of agencies) {
    // Hosts directly under this agency's owning agent.
    const hosts = await prisma.user.findMany({ where: { agentId: ownerId }, select: { cumulativeBeansEarned: true } });
    const total = hosts.reduce((acc, h) => acc + BigInt(h.cumulativeBeansEarned as unknown as string | number | bigint), 0n);
    await prisma.agency.update({
      where: { id },
      data: { cumulativeHostIncome: total },
    });
    touched += 1;
  }
  return touched;
}

async function main() {
  console.log('Backfill starting…');
  const u = await backfillUsers();
  console.log(`User.cumulativeBeansEarned: ${u} rows updated`);
  const a = await backfillAgencies();
  console.log(`Agency.cumulativeHostIncome: ${a} rows updated`);
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
