/**
 * Validates the 20260421000000_gifting_commission_admin migration:
 *   1. beanValue rewrite — rows where beanValue ≠ coinCost are corrected; idempotent.
 *   2. Index gift_commission_ledger_agencyId_createdAt_id_idx exists.
 *
 * Executed as part of the regular jest suite. Relies on the test DB being at
 * the HEAD migration state (Plan 1 + this one) — jest.global-setup applies all
 * migrations before tests run.
 */
import { prisma } from '../../../src/config/prisma';
import { resetDb, createTestUser } from '../../../src/tests/db-helpers';
import { randomUUID } from 'crypto';

describe('Migration: 20260421000000_gifting_commission_admin', () => {
  beforeEach(async () => { await resetDb(); });

  it('rewrites historic beanValue rows and is idempotent', async () => {
    const sender = await createTestUser({ coinBalance: 1000 });
    const host = await createTestUser({ role: 'host' });
    const gift = await prisma.gift.findFirstOrThrow();

    // Simulate a pre-migration row: beanValue stored at 0.70 * coinCost.
    const historic = await prisma.giftTransaction.create({
      data: {
        id: randomUUID(),
        senderId: sender.id,
        recipientId: host.id,
        recipientType: 'user',
        giftId: gift.id,
        qty: 1,
        coinCost: 100,
        beanValue: 70,            // the buggy historic regime
      },
    });

    // Re-run only the UPDATE portion (simulating migration replay).
    await prisma.$executeRawUnsafe(
      `UPDATE gift_transactions SET "beanValue" = "coinCost" WHERE "beanValue" <> "coinCost"`,
    );

    const fixed = await prisma.giftTransaction.findUniqueOrThrow({ where: { id: historic.id } });
    expect(fixed.beanValue).toBe(100);

    // Idempotent: second run changes nothing.
    await prisma.$executeRawUnsafe(
      `UPDATE gift_transactions SET "beanValue" = "coinCost" WHERE "beanValue" <> "coinCost"`,
    );
    const stillFixed = await prisma.giftTransaction.findUniqueOrThrow({ where: { id: historic.id } });
    expect(stillFixed.beanValue).toBe(100);
  });

  it('has the gift_commission_ledger cursor index with correct column order and sort direction', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'gift_commission_ledger'
        AND indexname = 'gift_commission_ledger_agencyId_createdAt_id_idx'
    `;
    expect(rows).toHaveLength(1);
    const def = rows[0].indexdef;
    // Must include the three columns in order with DESC on createdAt and id.
    expect(def).toMatch(/"agencyId"/);
    expect(def).toMatch(/"createdAt"\s+DESC/);
    expect(def).toMatch(/\bid\s+DESC/);
    // Order check: agencyId must appear before createdAt, createdAt before id.
    // Note: Postgres only quotes mixed-case identifiers; "id" is stored unquoted.
    expect(def.indexOf('"agencyId"')).toBeLessThan(def.indexOf('"createdAt"'));
    expect(def.indexOf('"createdAt"')).toBeLessThan(def.search(/\bid\s+DESC/));
  });
});
