import { writeLedgerRow } from './commission-ledger';
import { prisma } from '../../config/prisma';
import { resetDb, createTestUser, createTestAgency } from '../../tests/db-helpers';

describe('writeLedgerRow (real DB)', () => {
  let giftTxId: string;
  let agencyId: string;
  let agentId: string;

  beforeEach(async () => {
    await resetDb();
    const sender = await createTestUser({ role: 'normal_user', coinBalance: 10_000 });
    const agent  = await createTestUser({ role: 'agent' });
    const ag     = await createTestAgency({ ownerId: agent.id });
    agencyId = ag.id;
    agentId  = agent.id;

    // Create a real gift transaction row so FK constraints are satisfied.
    const gift = await prisma.gift.findFirstOrThrow({ where: { name: 'Crown' } });
    const gtx = await prisma.giftTransaction.create({
      data: {
        senderId: sender.id, recipientId: agent.id,
        recipientType: 'agency', recipientAgencyId: agencyId,
        giftId: gift.id, roomId: null, qty: 1,
        coinCost: gift.coinCost, beanValue: gift.beanValue,
      },
    });
    giftTxId = gtx.id;
  });

  it('writes a direct commission row', async () => {
    await prisma.$transaction(async (tx) => {
      await writeLedgerRow(tx, {
        giftTransactionId: giftTxId, agencyId, userId: agentId,
        amount: 14_000n, commissionType: 'direct', rateApplied: 0.20,
      });
    });

    const rows = await prisma.giftCommissionLedger.findMany({ where: { giftTransactionId: giftTxId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].commissionType).toBe('direct');
    expect(BigInt(rows[0].amount as unknown as string | number | bigint)).toBe(14_000n);
    expect(rows[0].userId).toBe(agentId);
    expect(Number(rows[0].rateApplied)).toBeCloseTo(0.20);
  });

  it('allows userId=null for gift_bonus rows', async () => {
    await prisma.$transaction(async (tx) => {
      await writeLedgerRow(tx, {
        giftTransactionId: giftTxId, agencyId, userId: null,
        amount: 10_500n, commissionType: 'gift_bonus', rateApplied: 0.15,
      });
    });
    const [row] = await prisma.giftCommissionLedger.findMany({ where: { giftTransactionId: giftTxId } });
    expect(row.userId).toBeNull();
    expect(row.commissionType).toBe('gift_bonus');
  });

  it('allows agencyId=null for company_share rows', async () => {
    await prisma.$transaction(async (tx) => {
      await writeLedgerRow(tx, {
        giftTransactionId: giftTxId, agencyId: null, userId: null,
        amount: 30_000n, commissionType: 'company_share', rateApplied: 0.30,
      });
    });
    const [row] = await prisma.giftCommissionLedger.findMany({ where: { giftTransactionId: giftTxId } });
    expect(row.agencyId).toBeNull();
    expect(row.userId).toBeNull();
    expect(row.commissionType).toBe('company_share');
    expect(BigInt(row.amount as unknown as string | number | bigint)).toBe(30_000n);
  });

  it('rejects zero or negative amounts', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await writeLedgerRow(tx, {
        giftTransactionId: giftTxId, agencyId, userId: agentId,
        amount: 0n, commissionType: 'direct', rateApplied: 0.20,
      });
    })).rejects.toThrow(/amount must be positive/);
    const count = await prisma.giftCommissionLedger.count({ where: { giftTransactionId: giftTxId } });
    expect(count).toBe(0);
  });
});
