import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

export interface ResolvedTier {
  id: string;
  name: string;
  minHostIncome: bigint;
  commissionRate: number;
  order: number;
}

// Tiers change rarely (admin edits). We cache them for the lifetime of the
// process; admin-config routes in Plan 2 will call `clearTierCache()` on write.
let cache: ResolvedTier[] | null = null;

export function clearTierCache(): void {
  cache = null;
}

async function loadTiers(): Promise<ResolvedTier[]> {
  if (cache) return cache;
  const rows = await prisma.agencyTier.findMany({ orderBy: { minHostIncome: 'desc' } });
  cache = rows.map((r) => ({
    id: r.id,
    name: r.name,
    minHostIncome: BigInt(r.minHostIncome as unknown as string | number | bigint),
    commissionRate: Number(r.commissionRate),
    order: r.order,
  }));
  return cache;
}

/**
 * Pick the highest tier whose minHostIncome ≤ `income`.
 * `income` is rolling 30-day agency turnover (turnover coins from qualifying gifts)
 * for commission %, or any comparable bigint for tests.
 */
export async function resolveTier(income: bigint): Promise<ResolvedTier> {
  const tiers = await loadTiers();                    // pre-sorted desc
  for (const t of tiers) {
    if (income >= t.minHostIncome) return t;
  }
  throw new AppError(`resolveTier: no tier matched income=${income.toString()}`, 500);
}
