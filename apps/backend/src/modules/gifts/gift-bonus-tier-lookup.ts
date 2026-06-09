import { prisma } from '../../config/prisma';

export interface ResolvedGiftBonusTier {
  id: string;
  name: string;
  minRollingIncome: bigint;
  bonusRate: number;
  order: number;
}

let cache: ResolvedGiftBonusTier[] | null = null;

export function clearGiftBonusTierCache(): void {
  cache = null;
}

async function loadTiers(): Promise<ResolvedGiftBonusTier[]> {
  if (cache) return cache;
  const rows = await prisma.giftBonusTier.findMany({ orderBy: { minRollingIncome: 'desc' } });
  cache = rows.map((r) => ({
    id: r.id,
    name: r.name,
    minRollingIncome: BigInt(r.minRollingIncome as unknown as string | number | bigint),
    bonusRate: Number(r.bonusRate),
    order: r.order,
  }));
  return cache;
}

/**
 * Highest gift-bonus tier whose minRollingIncome ≤ rollingIncome (PRE-update convention).
 * Returns null when income is below the smallest tier threshold (effective rate 0).
 */
export async function resolveGiftBonusTier(
  rollingIncome: bigint,
): Promise<ResolvedGiftBonusTier | null> {
  const tiers = await loadTiers();
  for (const t of tiers) {
    if (rollingIncome >= t.minRollingIncome) return t;
  }
  return null;
}

export async function listGiftBonusTiersAsc(): Promise<ResolvedGiftBonusTier[]> {
  const rows = await prisma.giftBonusTier.findMany({ orderBy: { minRollingIncome: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    minRollingIncome: BigInt(r.minRollingIncome as unknown as string | number | bigint),
    bonusRate: Number(r.bonusRate),
    order: r.order,
  }));
}

/** Next tier above current rolling income (for Agency Center progress UI). */
export async function nextGiftBonusTierAfter(
  rollingIncome: bigint,
): Promise<ResolvedGiftBonusTier | null> {
  const rows = await prisma.giftBonusTier.findMany({
    where: { minRollingIncome: { gt: rollingIncome } },
    orderBy: { minRollingIncome: 'asc' },
    take: 1,
  });
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    minRollingIncome: BigInt(r.minRollingIncome as unknown as string | number | bigint),
    bonusRate: Number(r.bonusRate),
    order: r.order,
  };
}
