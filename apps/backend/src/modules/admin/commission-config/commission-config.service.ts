import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { clearTierCache } from '../../gifts/tier-lookup';
import { clearGiftBonusTierCache } from '../../gifts/gift-bonus-tier-lookup';
import { listCommissionLedger, LedgerPage } from '../../gifts/commission-ledger-query';

export interface TierDTO {
  id: string;
  name: string;
  minHostIncome: string;
  commissionRate: number;
  order: number;
}

function toTierDTO(row: {
  id: string; name: string; minHostIncome: bigint;
  commissionRate: unknown; order: number;
}): TierDTO {
  return {
    id: row.id,
    name: row.name,
    minHostIncome: row.minHostIncome.toString(),
    commissionRate: Number(row.commissionRate),
    order: row.order,
  };
}

export async function listTiers(): Promise<TierDTO[]> {
  const rows = await prisma.agencyTier.findMany({ orderBy: { minHostIncome: 'asc' } });
  return rows.map(toTierDTO);
}

export async function createTier(input: {
  name: string; minHostIncome: string; commissionRate: number;
}): Promise<TierDTO> {
  // NOTE: AgencyTier.name is not @unique in the Prisma schema, so we use findFirst
  // to enforce uniqueness application-side. If a unique constraint is later added,
  // this can be switched to findUnique.
  const existing = await prisma.agencyTier.findFirst({ where: { name: input.name } });
  if (existing) throw new AppError('tier_name_exists', 409);

  const maxOrder = await prisma.agencyTier.aggregate({ _max: { order: true } });
  const row = await prisma.agencyTier.create({
    data: {
      name: input.name,
      minHostIncome: BigInt(input.minHostIncome),
      commissionRate: input.commissionRate,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  clearTierCache();
  return toTierDTO(row);
}

export async function updateTier(id: string, input: {
  name?: string; minHostIncome?: string; commissionRate?: number;
}): Promise<TierDTO> {
  const existing = await prisma.agencyTier.findUnique({ where: { id } });
  if (!existing) throw new AppError('not_found', 404);

  if (input.name && input.name !== existing.name) {
    // NOTE: AgencyTier.name is not @unique in the Prisma schema; enforce via findFirst.
    const nameClash = await prisma.agencyTier.findFirst({ where: { name: input.name } });
    if (nameClash) throw new AppError('tier_name_exists', 409);
  }

  // If minHostIncome is being changed and this row is currently the only zero-income tier, reject.
  if (input.minHostIncome !== undefined && existing.minHostIncome === 0n && BigInt(input.minHostIncome) !== 0n) {
    const otherZero = await prisma.agencyTier.count({
      where: { minHostIncome: 0n, id: { not: id } },
    });
    if (otherZero === 0) throw new AppError('zero_income_tier_required', 409);
  }

  const row = await prisma.agencyTier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.minHostIncome !== undefined ? { minHostIncome: BigInt(input.minHostIncome) } : {}),
      ...(input.commissionRate !== undefined ? { commissionRate: input.commissionRate } : {}),
    },
  });
  clearTierCache();
  return toTierDTO(row);
}

export async function deleteTier(id: string): Promise<void> {
  const existing = await prisma.agencyTier.findUnique({ where: { id } });
  if (!existing) throw new AppError('not_found', 404);

  if (existing.minHostIncome === 0n) {
    const otherZero = await prisma.agencyTier.count({
      where: { minHostIncome: 0n, id: { not: id } },
    });
    if (otherZero === 0) throw new AppError('zero_income_tier_required', 409);
  }

  await prisma.agencyTier.delete({ where: { id } });
  clearTierCache();
}

// ---------------------------------------------------------------------------
// Gift-bonus singleton (id = "singleton")
// ---------------------------------------------------------------------------

export interface BonusSettingDTO {
  id: string;
  enabled: boolean;
  bonusRate: number;
  updatedBy: string;
  updatedAt: string;
}

function toBonusDTO(row: {
  id: string; enabled: boolean; bonusRate: unknown; updatedBy: string; updatedAt: Date;
}): BonusSettingDTO {
  return {
    id: row.id,
    enabled: row.enabled,
    bonusRate: Number(row.bonusRate),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getBonusSetting(): Promise<BonusSettingDTO> {
  const row = await prisma.giftBonusSetting.findUniqueOrThrow({ where: { id: 'singleton' } });
  return toBonusDTO(row);
}

export async function updateBonusSetting(
  adminUserId: string,
  input: { bonusRate?: number; enabled?: boolean },
): Promise<BonusSettingDTO> {
  const row = await prisma.giftBonusSetting.update({
    where: { id: 'singleton' },
    data: {
      ...(input.bonusRate !== undefined ? { bonusRate: input.bonusRate } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updatedBy: adminUserId,
    },
  });
  return toBonusDTO(row);
}

// ---------------------------------------------------------------------------
// Gift-bonus tiers (rolling 7-day agency income thresholds)
// ---------------------------------------------------------------------------

export interface GiftBonusTierDTO {
  id: string;
  name: string;
  minRollingIncome: string;
  bonusRate: number;
  order: number;
}

function toGiftBonusTierDTO(row: {
  id: string;
  name: string;
  minRollingIncome: bigint | number | string | { toString(): string };
  bonusRate: unknown;
  order: number;
}): GiftBonusTierDTO {
  return {
    id: row.id,
    name: row.name,
    minRollingIncome: BigInt(row.minRollingIncome as bigint | number | string).toString(),
    bonusRate: Number(row.bonusRate),
    order: row.order,
  };
}

export async function listGiftBonusTiers(): Promise<GiftBonusTierDTO[]> {
  const rows = await prisma.giftBonusTier.findMany({ orderBy: { minRollingIncome: 'asc' } });
  return rows.map(toGiftBonusTierDTO);
}

export async function createGiftBonusTier(input: {
  name: string;
  minRollingIncome: string;
  bonusRate: number;
}): Promise<GiftBonusTierDTO> {
  const existing = await prisma.giftBonusTier.findFirst({ where: { name: input.name } });
  if (existing) throw new AppError('gift_bonus_tier_name_exists', 409);

  const maxOrder = await prisma.giftBonusTier.aggregate({ _max: { order: true } });
  const row = await prisma.giftBonusTier.create({
    data: {
      name: input.name,
      minRollingIncome: BigInt(input.minRollingIncome),
      bonusRate: input.bonusRate,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  clearGiftBonusTierCache();
  return toGiftBonusTierDTO(row);
}

export async function updateGiftBonusTier(id: string, input: {
  name?: string;
  minRollingIncome?: string;
  bonusRate?: number;
}): Promise<GiftBonusTierDTO> {
  const existing = await prisma.giftBonusTier.findUnique({ where: { id } });
  if (!existing) throw new AppError('not_found', 404);

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.giftBonusTier.findFirst({ where: { name: input.name } });
    if (clash) throw new AppError('gift_bonus_tier_name_exists', 409);
  }

  const row = await prisma.giftBonusTier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.minRollingIncome !== undefined ? { minRollingIncome: BigInt(input.minRollingIncome) } : {}),
      ...(input.bonusRate !== undefined ? { bonusRate: input.bonusRate } : {}),
    },
  });
  clearGiftBonusTierCache();
  return toGiftBonusTierDTO(row);
}

export async function deleteGiftBonusTier(id: string): Promise<void> {
  const existing = await prisma.giftBonusTier.findUnique({ where: { id } });
  if (!existing) throw new AppError('not_found', 404);
  await prisma.giftBonusTier.delete({ where: { id } });
  clearGiftBonusTierCache();
}

// ---------------------------------------------------------------------------
// Per-agency overrides
// ---------------------------------------------------------------------------

export async function setCommissionOverride(
  agencyId: string,
  input: { rate: number | null; validUntil?: string | null },
) {
  const existing = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!existing) throw new AppError('not_found', 404);

  const validUntilDate =
    input.rate == null
      ? null
      : input.validUntil === undefined
        ? null
        : input.validUntil === null
          ? null
          : new Date(input.validUntil);

  if (input.rate != null && validUntilDate != null && Number.isNaN(validUntilDate.getTime())) {
    throw new AppError('invalid_valid_until', 400);
  }

  const row = await prisma.agency.update({
    where: { id: agencyId },
    data: {
      commissionRateOverride: input.rate,
      commissionRateOverrideValidUntil: input.rate == null ? null : validUntilDate,
    },
  });
  return {
    agencyId: row.id,
    commissionRateOverride: row.commissionRateOverride === null ? null : Number(row.commissionRateOverride),
    commissionRateOverrideValidUntil: row.commissionRateOverrideValidUntil?.toISOString() ?? null,
  };
}

export async function setGiftBonusOverride(
  agencyId: string,
  input: { rate: number | null; validUntil?: string | null },
) {
  const existing = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!existing) throw new AppError('not_found', 404);

  const validUntilDate =
    input.rate == null
      ? null
      : input.validUntil === undefined
        ? null
        : input.validUntil === null
          ? null
          : new Date(input.validUntil);

  if (input.rate != null && validUntilDate != null && Number.isNaN(validUntilDate.getTime())) {
    throw new AppError('invalid_valid_until', 400);
  }

  const row = await prisma.agency.update({
    where: { id: agencyId },
    data: {
      giftBonusRateOverride: input.rate,
      giftBonusRateOverrideValidUntil: input.rate == null ? null : validUntilDate,
    },
  });
  return {
    agencyId: row.id,
    giftBonusRateOverride: row.giftBonusRateOverride === null ? null : Number(row.giftBonusRateOverride),
    giftBonusRateOverrideValidUntil: row.giftBonusRateOverrideValidUntil?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Commission ledger (Task 7)
// ---------------------------------------------------------------------------

export async function adminListLedger(
  agencyId: string,
  query: { cursor?: string; limit?: number; from?: string; to?: string },
): Promise<LedgerPage> {
  const existing = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!existing) throw new AppError('not_found', 404);
  return listCommissionLedger({
    agencyId,
    cursor: query.cursor,
    limit: query.limit,
    from: query.from,
    to: query.to,
  });
}

// ---------------------------------------------------------------------------
// Platform (company) bean revenue
// ---------------------------------------------------------------------------

export interface PlatformRevenueDTO {
  totalBeans: string;           // BigInt as string
  todayBeans: string;
  thisMonthBeans: string;
}

export interface PlatformRevenueLedgerRow {
  id: string;
  giftTransactionId: string;
  amount: string;               // BigInt as string
  rateApplied: number;
  createdAt: string;            // ISO
}

export interface PlatformRevenueLedgerPage {
  rows: PlatformRevenueLedgerRow[];
  nextCursor: string | null;
}

interface RevenueCursor { createdAt: string; id: string; }

function encodeRevenueCursor(c: RevenueCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeRevenueCursor(s: string): RevenueCursor {
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as Record<string, unknown>).createdAt !== 'string' ||
      typeof (parsed as Record<string, unknown>).id !== 'string'
    ) throw new Error('invalid shape');
    return parsed as RevenueCursor;
  } catch {
    throw new AppError('invalid_cursor', 400);
  }
}

export async function listPlatformRevenueLedger(params: {
  cursor?: string | null;
  limit?: number;
  from?: string | null;
  to?: string | null;
}): Promise<PlatformRevenueLedgerPage> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const cursor = params.cursor ? decodeRevenueCursor(params.cursor) : null;

  const conditions: string[] = [`"commissionType" = 'company_share'`];
  const args: unknown[] = [];
  let i = 1;

  if (params.from) { conditions.push(`"createdAt" >= $${i++}`); args.push(new Date(params.from)); }
  if (params.to)   { conditions.push(`"createdAt" <= $${i++}`); args.push(new Date(params.to)); }

  if (cursor) {
    conditions.push(
      `("createdAt" < $${i}::timestamptz OR ("createdAt" = $${i}::timestamptz AND "id" < $${i + 1}))`,
    );
    args.push(new Date(cursor.createdAt), cursor.id);
    i += 2;
  }

  const where = conditions.join(' AND ');
  const sql = `
    SELECT id, "giftTransactionId", amount, "rateApplied", "createdAt"
    FROM gift_commission_ledger
    WHERE ${where}
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT $${i}
  `;
  args.push(limit + 1);

  const raw = await prisma.$queryRawUnsafe<Array<{
    id: string; giftTransactionId: string;
    amount: bigint; rateApplied: string | number; createdAt: Date;
  }>>(sql, ...args);

  const hasMore = raw.length > limit;
  const pageRows = hasMore ? raw.slice(0, limit) : raw;

  const rows: PlatformRevenueLedgerRow[] = pageRows.map((r) => ({
    id: r.id,
    giftTransactionId: r.giftTransactionId,
    amount: r.amount.toString(),
    rateApplied: Number(r.rateApplied),
    createdAt: r.createdAt.toISOString(),
  }));

  const nextCursor = hasMore
    ? encodeRevenueCursor({ createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id })
    : null;

  return { rows, nextCursor };
}

export async function getPlatformRevenue(): Promise<PlatformRevenueDTO> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalResult, todayResult, monthResult] = await Promise.all([
    prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COALESCE(SUM(amount), 0)::bigint AS total
      FROM gift_commission_ledger
      WHERE "commissionType" = 'company_share'
    `,
    prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COALESCE(SUM(amount), 0)::bigint AS total
      FROM gift_commission_ledger
      WHERE "commissionType" = 'company_share'
        AND "createdAt" >= ${todayStart}
    `,
    prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COALESCE(SUM(amount), 0)::bigint AS total
      FROM gift_commission_ledger
      WHERE "commissionType" = 'company_share'
        AND "createdAt" >= ${monthStart}
    `,
  ]);

  return {
    totalBeans: totalResult[0].total.toString(),
    todayBeans: todayResult[0].total.toString(),
    thisMonthBeans: monthResult[0].total.toString(),
  };
}
