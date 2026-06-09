import { prisma } from '../../../config/prisma';

export type Period = 'week' | 'month';

export interface Window { start: Date; end: Date; prevStart: Date; prevEnd: Date; }

/** UTC period bounds for the bucket containing `at`, plus the immediately preceding bucket. */
export function periodWindow(period: Period, at: Date = new Date()): Window {
  if (period === 'month') {
    const y = at.getUTCFullYear();
    const m = at.getUTCMonth();
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 1));
    const prevStart = new Date(Date.UTC(y, m - 1, 1));
    const prevEnd = start;
    return { start, end, prevStart, prevEnd };
  }
  // week: Monday 00:00 UTC → next Monday
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  const start = new Date(d); start.setUTCDate(d.getUTCDate() - dow);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 7);
  const prevStart = new Date(start); prevStart.setUTCDate(start.getUTCDate() - 7);
  const prevEnd = start;
  return { start, end, prevStart, prevEnd };
}

/** Percentage change cur vs prev. Returns null when prev is 0 (undefined growth). */
export function growthPct(cur: bigint, prev: bigint): number | null {
  if (prev === 0n) return null;
  return Math.round((Number(cur - prev) / Number(prev)) * 1000) / 10;
}

/** Commission beans an agency earned in [start,end) — the agency's "revenue".
 *  Agency-credited ledger rows are those with the agency set AND userId null
 *  (userId null = destination is Agency.beanBalance/company per schema comment).
 *  The bean amount column is `amount` (BigInt); rows are typed by `commissionType`. */
export async function agencyRevenueBeans(agencyId: string, start?: Date, end?: Date): Promise<bigint> {
  const where: any = { agencyId, userId: null };
  if (start || end) where.createdAt = { ...(start && { gte: start }), ...(end && { lt: end }) };
  const r = await prisma.giftCommissionLedger.aggregate({ _sum: { amount: true }, where });
  return (r._sum.amount as bigint | null) ?? 0n;
}

/** Coins gifted through an agency's hosts in [start,end) — "turnover". */
export async function agencyTurnoverCoins(agentOwnerId: string, start?: Date, end?: Date): Promise<bigint> {
  const hosts = await prisma.user.findMany({ where: { agentId: agentOwnerId }, select: { id: true } });
  const ids = hosts.map(h => h.id);
  if (ids.length === 0) return 0n;
  const where: any = { recipientId: { in: ids } };
  if (start || end) where.createdAt = { ...(start && { gte: start }), ...(end && { lt: end }) };
  const r = await prisma.giftTransaction.aggregate({ _sum: { coinCost: true }, where });
  return BigInt(r._sum.coinCost ?? 0);
}

/** Beans an agency's hosts earned in [start,end) — "receiving". */
export async function agencyReceivingBeans(agentOwnerId: string, start?: Date, end?: Date): Promise<bigint> {
  const hosts = await prisma.user.findMany({ where: { agentId: agentOwnerId }, select: { id: true } });
  const ids = hosts.map(h => h.id);
  if (ids.length === 0) return 0n;
  const where: any = { recipientId: { in: ids } };
  if (start || end) where.createdAt = { ...(start && { gte: start }), ...(end && { lt: end }) };
  const r = await prisma.giftTransaction.aggregate({ _sum: { beanValue: true }, where });
  return BigInt(r._sum.beanValue ?? 0);
}
