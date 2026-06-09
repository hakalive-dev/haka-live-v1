import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

export interface LedgerRow {
  id: string;
  giftTransactionId: string;
  agencyId: string;
  recipientUserId: string | null;
  kind: 'direct' | 'parent_delta' | 'gift_bonus';
  rateApplied: number;
  beanAmount: string;            // BigInt serialized as string
  createdAt: string;             // ISO
}

export interface LedgerPage {
  rows: LedgerRow[];
  nextCursor: string | null;
}

export interface ListParams {
  agencyId: string;
  cursor?: string | null;
  limit?: number;
  from?: string | null;          // ISO
  to?: string | null;            // ISO
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

interface Cursor { createdAt: string; id: string; }

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(s: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).createdAt !== 'string' ||
      typeof (parsed as Record<string, unknown>).id !== 'string'
    ) {
      throw new Error('invalid shape');
    }
    return parsed as Cursor;
  } catch {
    throw new AppError('invalid_cursor', 400);
  }
}

export async function listCommissionLedger(p: ListParams): Promise<LedgerPage> {
  const limit = Math.min(Math.max(p.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursor = p.cursor ? decodeCursor(p.cursor) : null;

  const conditions: string[] = [`"agencyId" = $1`];
  const args: unknown[] = [p.agencyId];
  let i = 2;

  // NOTE: createdAt is stored as `timestamp without time zone` (UTC values, no tz marker).
  // Prisma sends Date params as `timestamptz`. Comparing timestamp vs timestamptz causes
  // PostgreSQL to interpret the stored value using the session timezone (Asia/Manila, UTC+8),
  // shifting all rows 8 hours earlier than reality. Fix: use AT TIME ZONE 'UTC' on the column
  // to force correct UTC interpretation before any timestamptz comparison.
  if (p.from) { conditions.push(`("createdAt" AT TIME ZONE 'UTC') >= $${i++}::timestamptz`); args.push(new Date(p.from)); }
  if (p.to)   { conditions.push(`("createdAt" AT TIME ZONE 'UTC') <= $${i++}::timestamptz`); args.push(new Date(p.to)); }

  if (cursor) {
    // Keyset pagination: rows strictly before (createdAt, id) in DESC order.
    conditions.push(
      `(("createdAt" AT TIME ZONE 'UTC') < $${i}::timestamptz OR (("createdAt" AT TIME ZONE 'UTC') = $${i}::timestamptz AND "id" < $${i + 1}))`,
    );
    args.push(new Date(cursor.createdAt), cursor.id);
    i += 2;
  }

  const where = conditions.join(' AND ');
  const sql = `
    SELECT id, "giftTransactionId", "agencyId", "userId",
           "commissionType", "rateApplied", amount, "createdAt"
    FROM gift_commission_ledger
    WHERE ${where}
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT $${i}
  `;
  args.push(limit + 1);

  const raw = await prisma.$queryRawUnsafe<
    Array<{
      id: string; giftTransactionId: string; agencyId: string;
      userId: string | null;
      commissionType: 'direct' | 'parent_delta' | 'gift_bonus';
      rateApplied: string | number;
      amount: bigint;
      createdAt: Date;
    }>
  >(sql, ...args);

  const hasMore = raw.length > limit;
  const pageRows = hasMore ? raw.slice(0, limit) : raw;

  const rows: LedgerRow[] = pageRows.map((r) => ({
    id: r.id,
    giftTransactionId: r.giftTransactionId,
    agencyId: r.agencyId,
    recipientUserId: r.userId,
    kind: r.commissionType,
    rateApplied: Number(r.rateApplied),
    beanAmount: r.amount.toString(),
    createdAt: r.createdAt.toISOString(),
  }));

  const nextCursor = hasMore
    ? encodeCursor({ createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id })
    : null;

  return { rows, nextCursor };
}
