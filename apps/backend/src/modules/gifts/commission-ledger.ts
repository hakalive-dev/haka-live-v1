import type { prisma } from '../../config/prisma';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type CommissionType =
  | 'direct'
  | 'parent_delta'
  | 'gift_bonus'
  | 'company_share'
  | 'cs_gift_commission'
  | 'cs_income_reward'
  | 'cs_gift_bonus'
  | 'cs_total_commission';

export interface LedgerEntry {
  giftTransactionId: string;
  agencyId: string | null;                 // null for company_share rows
  userId: string | null;                   // null for gift_bonus / company_share
  amount: bigint;
  commissionType: CommissionType;
  rateApplied: number;                     // Decimal in DB; pass a JS number
}

export async function writeLedgerRow(tx: Tx, entry: LedgerEntry): Promise<void> {
  if (entry.amount <= 0n) {
    throw new Error(`writeLedgerRow: amount must be positive, got ${entry.amount.toString()}`);
  }
  await tx.giftCommissionLedger.create({
    data: {
      giftTransactionId: entry.giftTransactionId,
      agencyId: entry.agencyId ?? undefined,
      userId: entry.userId,
      amount: entry.amount,
      commissionType: entry.commissionType,
      rateApplied: entry.rateApplied,
    },
  });
}
