import { listCommissionLedger } from './commission-ledger-query';
import { prisma } from '../../config/prisma';
import { resetDb, createTestUser, createTestAgency } from '../../tests/db-helpers';
import { randomUUID } from 'crypto';

/**
 * Creates `count` ledger rows for the given agency / recipient, spaced 1s apart
 * starting at `baseMs`. Returns the inserted rows.
 *
 * Each ledger row needs a parent GiftTransaction for FK safety, so we create a
 * minimal transaction per row.
 */
async function seedLedgerRows(
  agencyId: string,
  senderId: string,
  recipientUserId: string,
  count: number,
  baseMs: number,
) {
  const gift = await prisma.gift.findFirstOrThrow({ where: { name: 'Crown' } });

  for (let i = 0; i < count; i++) {
    const gtx = await prisma.giftTransaction.create({
      data: {
        senderId,
        recipientId: recipientUserId,
        recipientType: 'user',
        giftId: gift.id,
        qty: 1,
        coinCost: gift.coinCost,
        beanValue: gift.beanValue,
        createdAt: new Date(baseMs + i * 1000),
      },
    });
    await prisma.giftCommissionLedger.create({
      data: {
        id: randomUUID(),
        giftTransactionId: gtx.id,
        agencyId,
        userId: recipientUserId,
        commissionType: 'direct',
        rateApplied: 0.08,
        amount: BigInt(100 + i),
        createdAt: new Date(baseMs + i * 1000),
      },
    });
  }
}

describe('listCommissionLedger', () => {
  beforeEach(async () => { await resetDb(); });

  it('returns rows in createdAt-desc, id-desc order within limit', async () => {
    const owner = await createTestUser();
    const host = await createTestUser({ role: 'host' });
    const sender = await createTestUser({ coinBalance: 10_000 });
    const agency = await createTestAgency({ ownerId: owner.id });
    await seedLedgerRows(agency.id, sender.id, host.id, 5, Date.now() - 60_000);

    const page = await listCommissionLedger({ agencyId: agency.id, limit: 3 });

    expect(page.rows).toHaveLength(3);
    for (let i = 1; i < page.rows.length; i++) {
      const prev = page.rows[i - 1];
      const cur = page.rows[i];
      const prevKey = `${prev.createdAt}_${prev.id}`;
      const curKey  = `${cur.createdAt}_${cur.id}`;
      expect(prevKey > curKey).toBe(true);
    }
    expect(page.nextCursor).not.toBeNull();
  });

  it('paginates deterministically with cursor', async () => {
    const owner = await createTestUser();
    const host = await createTestUser({ role: 'host' });
    const sender = await createTestUser({ coinBalance: 10_000 });
    const agency = await createTestAgency({ ownerId: owner.id });
    await seedLedgerRows(agency.id, sender.id, host.id, 7, Date.now() - 60_000);

    const p1 = await listCommissionLedger({ agencyId: agency.id, limit: 3 });
    const p2 = await listCommissionLedger({ agencyId: agency.id, limit: 3, cursor: p1.nextCursor! });
    const p3 = await listCommissionLedger({ agencyId: agency.id, limit: 3, cursor: p2.nextCursor! });

    const seen = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id);
    expect(new Set(seen).size).toBe(7);      // no duplicates
    expect(p3.nextCursor).toBeNull();        // exhausted
  });

  it('breaks ties deterministically by id when createdAt is equal', async () => {
    const owner = await createTestUser();
    const host = await createTestUser({ role: 'host' });
    const sender = await createTestUser({ coinBalance: 10_000 });
    const agency = await createTestAgency({ ownerId: owner.id });
    const gift = await prisma.gift.findFirstOrThrow({ where: { name: 'Crown' } });
    const now = new Date('2026-04-21T10:00:00Z');

    for (let i = 0; i < 4; i++) {
      const gtx = await prisma.giftTransaction.create({
        data: {
          senderId: sender.id,
          recipientId: host.id,
          recipientType: 'user',
          giftId: gift.id,
          qty: 1,
          coinCost: gift.coinCost,
          beanValue: gift.beanValue,
          createdAt: now,
        },
      });
      await prisma.giftCommissionLedger.create({
        data: {
          id: randomUUID(),
          giftTransactionId: gtx.id,
          agencyId: agency.id,
          userId: host.id,
          commissionType: 'direct',
          rateApplied: 0.08,
          amount: BigInt(100),
          createdAt: now,                  // identical timestamp on all 4 rows
        },
      });
    }

    const p1 = await listCommissionLedger({ agencyId: agency.id, limit: 2 });
    const p2 = await listCommissionLedger({ agencyId: agency.id, limit: 2, cursor: p1.nextCursor! });
    const ids = [...p1.rows, ...p2.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('filters by from and to inclusive', async () => {
    const owner = await createTestUser();
    const host = await createTestUser({ role: 'host' });
    const sender = await createTestUser({ coinBalance: 10_000 });
    const agency = await createTestAgency({ ownerId: owner.id });
    const base = Date.parse('2026-04-01T00:00:00Z');
    await seedLedgerRows(agency.id, sender.id, host.id, 10, base);

    const from = new Date(base + 2000).toISOString();
    const to   = new Date(base + 5000).toISOString();
    const page = await listCommissionLedger({ agencyId: agency.id, limit: 100, from, to });
    expect(page.rows.map((r) => r.beanAmount)).toEqual(
      expect.arrayContaining(['102', '103', '104', '105']),
    );
    expect(page.rows.length).toBe(4);
  });
});
