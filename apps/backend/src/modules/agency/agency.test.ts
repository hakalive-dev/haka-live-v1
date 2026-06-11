/**
 * Agency module — integration.
 * After the commission-foundation migration, tier names are A–E and tier lookup
 * uses minHostIncome. Covers: summary, host roster, host stats, agent sales,
 * level tasks (hosts module).
 */
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import {
  resetDb, createTestUser, createTestAgency, mintJwt, getWalletBalance,
  seedRollingAgencyHostBeansSum,
} from '../../tests/db-helpers';

beforeEach(async () => { await resetDb(); });

// ── Agency Summary ─────────────────────────────────────────────────────────────

describe('GET /api/v1/agency/summary', () => {
  it('returns a tier name from the A–E set plus headline counters', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    // Attach a host so totalHosts > 0
    await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const res = await request(app)
      .get('/api/v1/agency/summary')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('commissionTier');
    expect(res.body.data).toHaveProperty('totalHosts', 1);
    expect(res.body.data).toHaveProperty('subAgencyCount');
    expect(res.body.data).toHaveProperty('baseSalaryHostCount');
    expect(typeof res.body.data.subAgencyCount).toBe('number');
    expect(typeof res.body.data.baseSalaryHostCount).toBe('number');
    expect(res.body.data).toHaveProperty('weeklyBeans');
    expect(res.body.data).toHaveProperty('weeklyCommission');
    expect(res.body.data).toHaveProperty('allTimeCommission');
    expect(['A', 'B', 'C', 'D', 'E']).toContain(res.body.data.commissionTier.name);
  });

  it('rejects non-agent users with 403', async () => {
    const normal = await createTestUser();
    const res = await request(app)
      .get('/api/v1/agency/summary')
      .set('Authorization', `Bearer ${mintJwt(normal.id)}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/agency/summary');
    expect(res.status).toBe(401);
  });

  it('exposes today gift_received sum (agent + hosts), host yesterday/sameDayLastWeek beans, commission + ledger split', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const { id: agencyId } = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const hostWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: host.id } });
    const agentWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: agent.id } });

    // Host bean credits (yesterday + same weekday last week); today's gift_received is on agent wallet below (could be host wallets in live rooms)
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const sameDayLastWeek = new Date(today); sameDayLastWeek.setDate(sameDayLastWeek.getDate() - 7);

    for (const [createdAt, amount] of [[yesterday, 300], [sameDayLastWeek, 200]] as const) {
      await prisma.walletTransaction.create({
        data: {
          walletId: hostWallet.id,
          currency: 'beans',
          transactionType: 'credit',
          reference: 'gift_received',
          amount,
          balanceAfter: amount,
          createdAt,
        },
      });
    }

    await prisma.walletTransaction.create({
      data: {
        walletId: agentWallet.id,
        currency: 'beans',
        transactionType: 'credit',
        reference: 'gift_received',
        amount: 500,
        balanceAfter: 500,
        createdAt: today,
      },
    });

    // Agent commission credits (today + earlier in month + outside month)
    const earlierThisMonth = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);

    for (const [createdAt, amount] of [[today, 80], [earlierThisMonth, 50], [lastMonth, 999]] as const) {
      await prisma.walletTransaction.create({
        data: {
          walletId: agentWallet.id,
          currency: 'beans',
          transactionType: 'credit',
          reference: 'gift_commission',
          amount,
          balanceAfter: amount,
          createdAt,
        },
      });
    }

    // Ledger rows for direct / parent_delta split (requires a parent GiftTransaction)
    const gift = await prisma.gift.findFirstOrThrow();
    const sender = await createTestUser();
    for (const [type, amt] of [['direct', 700], ['direct', 400], ['parent_delta', 250]] as const) {
      const gtx = await prisma.giftTransaction.create({
        data: {
          senderId: sender.id,
          recipientId: host.id,
          recipientType: 'user',
          giftId: gift.id,
          qty: 1,
          coinCost: gift.coinCost,
          beanValue: gift.beanValue,
        },
      });
      await prisma.giftCommissionLedger.create({
        data: {
          giftTransactionId: gtx.id,
          agencyId,
          userId: host.id,
          commissionType: type,
          rateApplied: 0.08,
          amount: BigInt(amt),
        },
      });
    }

    const res = await request(app)
      .get('/api/v1/agency/summary')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.todayBeans).toBe(500);
    expect(data.yesterdayBeans).toBe(300);
    expect(data.sameDayLastWeekBeans).toBe(200);
    expect(data.todayCommission).toBe(80);
    expect(data.monthCommission).toBe(130); // 80 today + 50 earlier this month
    expect(data.directCommissionAllTime).toBe(1100); // 700 + 400
    expect(data.inviteAgentCommissionAllTime).toBe(250);
  });
});

// ── Daily Analytics ────────────────────────────────────────────────────────────

describe('GET /api/v1/agency/analytics/daily', () => {
  it('returns zero-filled daily series with host beans + commission', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const hostWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: host.id } });
    const agentWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: agent.id } });

    const today = new Date(); today.setHours(12, 0, 0, 0);
    const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    await prisma.walletTransaction.create({
      data: {
        walletId: hostWallet.id, currency: 'beans', transactionType: 'credit',
        reference: 'gift_received', amount: 400, balanceAfter: 400, createdAt: today,
      },
    });
    await prisma.walletTransaction.create({
      data: {
        walletId: hostWallet.id, currency: 'beans', transactionType: 'credit',
        reference: 'gift_received', amount: 150, balanceAfter: 150, createdAt: twoDaysAgo,
      },
    });
    await prisma.walletTransaction.create({
      data: {
        walletId: agentWallet.id, currency: 'beans', transactionType: 'credit',
        reference: 'gift_commission', amount: 60, balanceAfter: 60, createdAt: today,
      },
    });

    const res = await request(app)
      .get('/api/v1/agency/analytics/daily?days=7')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(7);
    expect(res.body.data.daily).toHaveLength(7);

    const byDate: Record<string, { hostBeans: number; commission: number }> = {};
    for (const d of res.body.data.daily) byDate[d.date] = d;

    const todayKey = today.toISOString().split('T')[0];
    const twoDaysAgoKey = twoDaysAgo.toISOString().split('T')[0];
    expect(byDate[todayKey].hostBeans).toBe(400);
    expect(byDate[todayKey].commission).toBe(60);
    expect(byDate[twoDaysAgoKey].hostBeans).toBe(150);
    expect(byDate[twoDaysAgoKey].commission).toBe(0);
  });

  it('rejects non-agent with 403', async () => {
    const normal = await createTestUser();
    const res = await request(app)
      .get('/api/v1/agency/analytics/daily')
      .set('Authorization', `Bearer ${mintJwt(normal.id)}`);
    expect(res.status).toBe(403);
  });

  it('validates days query param (rejects out-of-range)', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const res = await request(app)
      .get('/api/v1/agency/analytics/daily?days=999')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);
    expect(res.status).toBe(400);
  });
});

// ── Host Roster ────────────────────────────────────────────────────────────────

describe('GET /api/v1/agency/hosts', () => {
  it('returns paginated host roster with wallet balance', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: 'host', hostType: 'agent_host', agentId: agent.id, beanBalance: 5_000,
    });

    const res = await request(app)
      .get('/api/v1/agency/hosts')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].id).toBe(host.id);
    // BigInt wallet columns serialize to strings over JSON (BigInt.toJSON in app.ts)
    expect(Number(res.body.data.items[0].wallet.beanBalance)).toBe(5_000);
    expect(res.body.data.total).toBe(1);
  });

  it('returns an empty list when the agent has no hosts', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });

    const res = await request(app)
      .get('/api/v1/agency/hosts')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });
});

// ── Host Stats ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/agency/hosts/:hostId/stats', () => {
  it('returns host gift stats grouped by date after real gift sends', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: 'host', hostType: 'agent_host', agentId: agent.id,
    });
    const sender = await createTestUser({ coinBalance: 1_000_000 });
    const crown = await prisma.gift.findFirstOrThrow({ where: { name: 'Crown' } });

    // Send two crowns so there is a non-trivial stats payload.
    for (let i = 0; i < 2; i += 1) {
      const res = await request(app)
        .post('/api/v1/gifts/send')
        .set('Authorization', `Bearer ${mintJwt(sender.id)}`)
        .send({ giftId: crown.id, recipientId: host.id });
      expect(res.status).toBe(201);
    }

    const res = await request(app)
      .get(`/api/v1/agency/hosts/${host.id}/stats`)
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.daily).toBeDefined();
    expect(Array.isArray(res.body.data.daily)).toBe(true);
    expect(res.body.data.totals.count).toBe(2);
    expect(res.body.data.totals.totalBeans).toBe(crown.beanValue * 2);
    expect(res.body.data.totals.totalCoins).toBe(crown.coinCost * 2);
    expect(res.body.data.host.id).toBe(host.id);
  });

  it('returns 403 if the host does not belong to this agent', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const otherAgent = await createTestUser({ role: 'agent' });
    const foreignHost = await createTestUser({
      role: 'host', hostType: 'agent_host', agentId: otherAgent.id,
    });

    const res = await request(app)
      .get(`/api/v1/agency/hosts/${foreignHost.id}/stats`)
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);

    expect(res.status).toBe(403);
  });
});

// ── Agent Sales ────────────────────────────────────────────────────────────────

describe('POST /api/v1/agency/sales', () => {
  it('logs a coin sale and credits coins to customer', async () => {
    const agent    = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const customer = await createTestUser();

    // logAgentSale validates the (default GBP) currency against active rates
    await prisma.currencyRate.upsert({
      where: { countryCode: 'GB' },
      update: { isActive: true, currency: 'GBP' },
      create: {
        countryCode: 'GB',
        countryName: 'United Kingdom',
        currency: 'GBP',
        symbol: '£',
        usdRate: 1.27,
        isActive: true,
        source: 'manual',
      },
    });

    const res = await request(app)
      .post('/api/v1/agency/sales')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`)
      .send({ customerId: customer.id, coinsSold: 500, amountCollected: 5.0 });

    expect(res.status).toBe(201);
    // BigInt columns serialize to strings over JSON / stay BigInt from Prisma
    expect(Number(res.body.data.coinsSold)).toBe(500);
    expect(res.body.data.agentId).toBe(agent.id);
    expect(res.body.data.customerId).toBe(customer.id);

    expect(Number((await getWalletBalance(customer.id)).coins)).toBe(500);
  });

  it('rejects missing required fields', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const customer = await createTestUser();

    const res = await request(app)
      .post('/api/v1/agency/sales')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`)
      .send({ customerId: customer.id }); // missing coinsSold and amountCollected

    expect(res.status).toBe(400);
  });

  it('rejects invalid customerId', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });

    const res = await request(app)
      .post('/api/v1/agency/sales')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`)
      .send({ customerId: 'not-a-uuid', coinsSold: 100, amountCollected: 1.0 });

    expect(res.status).toBe(400);
  });
});

// ── Plan 2 extensions: getAgencySummary new fields ────────────────────────────

describe('agency.getAgencySummary — Plan 2 extensions', () => {
  it('includes cumulativeHostIncome, pot balance, parent fields, tier, effective rates', async () => {
    const parentOwner = await createTestUser({ role: 'agent' });
    const parent = await createTestAgency({ ownerId: parentOwner.id });
    await prisma.agency.update({
      where: { id: parent.id }, data: { name: 'The Parent' },
    });

    const owner = await createTestUser({ role: 'agent' });
    await prisma.agency.create({
      data: {
        name: 'Sub',
        ownerId: owner.id,
        parentAgencyId: parent.id,
        cumulativeHostIncome: BigInt(1500000),
        beanBalance: BigInt(40000),
      },
    });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: owner.id });
    const crown = await prisma.gift.findFirstOrThrow();
    const filler = await createTestUser({ coinBalance: 1 });
    await seedRollingAgencyHostBeansSum({
      senderId: filler.id,
      giftId: crown.id,
      targetHostBeans: 2_000_000n,
      recipient: { kind: 'host', recipientId: host.id },
    });

    const res = await request(app)
      .get('/api/v1/agency/summary')
      .set('Authorization', `Bearer ${mintJwt(owner.id, 'agent')}`);

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.cumulativeHostIncome).toBe('1500000');
    expect(d.agencyPotBalance).toBe('40000');
    expect(d.parentAgencyId).toBe(parent.id);
    expect(d.parentAgencyName).toBe('The Parent');
    expect(d.rollingThirtyDayAgencyHostIncome).toBe('2000000');
    expect(d.rollingThirtyDayWindowStart).toBeTruthy();
    expect(d.rollingThirtyDayWindowEnd).toBeTruthy();
    expect(d.currentTier.name).toBe('B');
    expect(d.effectiveCommissionRate).toBeCloseTo(0.08);
    // Rolling gift income crosses seeded bonus tiers → effective rate from ladder (not global disable).
    expect(d.effectiveGiftBonusRate).toBeCloseTo(0.15);
  });

  it('parent agency 30d rolling turnover includes sub-agency host gifts', async () => {
    const parentOwner = await createTestUser({ role: 'agent' });
    const parent = await createTestAgency({ ownerId: parentOwner.id });
    const subOwner = await createTestUser({ role: 'agent' });
    await prisma.agency.create({
      data: { name: 'SubOnly', ownerId: subOwner.id, parentAgencyId: parent.id },
    });
    const subHost = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: subOwner.id });
    const crown = await prisma.gift.findFirstOrThrow();
    const filler = await createTestUser({ coinBalance: 1 });
    await seedRollingAgencyHostBeansSum({
      senderId: filler.id,
      giftId: crown.id,
      targetHostBeans: 2_000_000n,
      recipient: { kind: 'host', recipientId: subHost.id },
    });

    const res = await request(app)
      .get('/api/v1/agency/summary')
      .set('Authorization', `Bearer ${mintJwt(parentOwner.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rollingThirtyDayAgencyHostIncome).toBe('2000000');
  });

  it('applies commission override when set', async () => {
    const owner = await createTestUser({ role: 'agent' });
    await prisma.agency.create({
      data: { name: 'X', ownerId: owner.id, commissionRateOverride: 0.14 },
    });

    const res = await request(app)
      .get('/api/v1/agency/summary')
      .set('Authorization', `Bearer ${mintJwt(owner.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.effectiveCommissionRate).toBeCloseTo(0.14);
  });

  it('applies gift-bonus override when override set on agency', async () => {
    const owner = await createTestUser({ role: 'agent' });
    await prisma.agency.create({
      data: { name: 'X', ownerId: owner.id, giftBonusRateOverride: 0.22 },
    });

    const res = await request(app)
      .get('/api/v1/agency/summary')
      .set('Authorization', `Bearer ${mintJwt(owner.id, 'agent')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.effectiveGiftBonusRate).toBeCloseTo(0.22);
  });
});

// ── Owner commission-ledger ───────────────────────────────────────────────────

describe('agency — owner commission-ledger', () => {
  it('returns the caller agency ledger, paginated', async () => {
    const owner = await createTestUser({ role: 'agent' });
    const sender = await createTestUser({ coinBalance: 10_000 });
    const host = await createTestUser({ role: 'host' });
    const agency = await prisma.agency.create({ data: { name: 'X', ownerId: owner.id } });
    const gift = await prisma.gift.findFirstOrThrow({ where: { name: 'Crown' } });
    const now = Date.now();
    // Create 4 ledger rows via parent GiftTransactions (FK requirement)
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
          createdAt: new Date(now - i * 1000),
        },
      });
      await prisma.giftCommissionLedger.create({
        data: {
          giftTransactionId: gtx.id,
          agencyId: agency.id,
          userId: host.id,
          commissionType: 'direct',
          rateApplied: 0.08,
          amount: BigInt(100),
          createdAt: new Date(now - i * 1000),
        },
      });
    }
    const token = mintJwt(owner.id, 'agent');
    const res = await request(app)
      .get('/api/v1/agency/commission-ledger?limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(2);
    expect(res.body.data.nextCursor).not.toBeNull();
  });

  it('returns 404 when caller owns no agency', async () => {
    const loner = await createTestUser({ role: 'agent' });
    const token = mintJwt(loner.id, 'agent');
    const res = await request(app)
      .get('/api/v1/agency/commission-ledger')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/agency/search', () => {
  beforeEach(async () => { await resetDb(); });

  it('returns agencies matching name, owner displayName, or hakaId', async () => {
    const owner1 = await createTestUser();
    const owner2 = await createTestUser();
    const owner3 = await createTestUser();
    await prisma.user.update({ where: { id: owner1.id }, data: { displayName: 'Alice Smith', hakaId: 'alice001' } });
    await prisma.user.update({ where: { id: owner2.id }, data: { displayName: 'Bob Jones',  hakaId: 'bob002'   } });
    await prisma.user.update({ where: { id: owner3.id }, data: { displayName: 'Charlie',    hakaId: 'charlie'  } });
    await prisma.agency.create({ data: { name: 'Starlight Agency', ownerId: owner1.id } });
    await prisma.agency.create({ data: { name: 'Moonbeam Agency',  ownerId: owner2.id } });
    await prisma.agency.create({ data: { name: 'Galaxy Agency',    ownerId: owner3.id } });

    const agent = await createTestUser({ role: 'agent' });
    const token = mintJwt(agent.id, 'agent');

    // search by agency name
    const r1 = await request(app)
      .get('/api/v1/agency/search?q=Starlight')
      .set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(200);
    expect(r1.body.data.length).toBe(1);
    expect(r1.body.data[0].name).toBe('Starlight Agency');
    expect(r1.body.data[0].owner.displayName).toBe('Alice Smith');
    expect(r1.body.data[0].owner.hakaId).toBe('alice001');

    // search by owner hakaId
    const r2 = await request(app)
      .get('/api/v1/agency/search?q=bob002')
      .set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(200);
    expect(r2.body.data.length).toBe(1);
    expect(r2.body.data[0].name).toBe('Moonbeam Agency');

    // search by owner displayName
    const r3 = await request(app)
      .get('/api/v1/agency/search?q=Charlie')
      .set('Authorization', `Bearer ${token}`);
    expect(r3.status).toBe(200);
    expect(r3.body.data.length).toBe(1);
    expect(r3.body.data[0].name).toBe('Galaxy Agency');
  });

  it('returns at most 10 results', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const token = mintJwt(agent.id, 'agent');
    for (let i = 0; i < 12; i++) {
      const owner = await createTestUser();
      await prisma.agency.create({ data: { name: `TestAgency${i}`, ownerId: owner.id } });
    }
    const res = await request(app)
      .get('/api/v1/agency/search?q=TestAgency')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
  });

  it('requires agent role', async () => {
    const user = await createTestUser();
    const token = mintJwt(user.id);
    const res = await request(app)
      .get('/api/v1/agency/search?q=test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ── Host leave / change agency (agent approves) ───────────────────────────────

describe('Host agency change requests', () => {
  it('host submits leave; agent lists pending and approves; host agentId cleared', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const leaveRes = await request(app)
      .post('/api/v1/hosts/me/agency/leave')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`)
      .send({ reason: 'test leave' });
    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.success).toBe(true);
    const requestId = leaveRes.body.data.id as string;

    const listRes = await request(app)
      .get('/api/v1/agency/host-change-requests/pending')
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(requestId);

    const appr = await request(app)
      .post(`/api/v1/agency/host-change-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${mintJwt(agent.id, 'agent')}`)
      .send({});
    expect(appr.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: host.id }, select: { agentId: true } });
    expect(updated?.agentId).toBeNull();
  });

  it('wrong agent cannot approve another agency host request', async () => {
    const agent1 = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent1.id });
    const agent2 = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent2.id });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent1.id });

    const leaveRes = await request(app)
      .post('/api/v1/hosts/me/agency/leave')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`)
      .send({ reason: 'x' });
    expect(leaveRes.status).toBe(200);
    const requestId = leaveRes.body.data.id as string;

    const appr = await request(app)
      .post(`/api/v1/agency/host-change-requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${mintJwt(agent2.id, 'agent')}`)
      .send({});
    expect(appr.status).toBe(403);
  });
});

// ── Agency-owner approvals (bind-search, agent applications, sub-agent invites,
//    agent-scoped host applications, change-request notifications) ────────────

describe('GET /api/v1/agency/bind-search', () => {
  it('allows any authenticated user (not only agents)', async () => {
    const owner = await createTestUser({ role: 'agent' });
    const { id: agencyId } = await createTestAgency({ ownerId: owner.id });
    await prisma.agency.update({ where: { id: agencyId }, data: { name: 'Bindable Alpha' } });
    const applicant = await createTestUser();

    const res = await request(app)
      .get('/api/v1/agency/bind-search?q=Bindable')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const row = res.body.data.find((r: { name: string }) => r.name === 'Bindable Alpha');
    expect(row).toBeTruthy();
    expect(row.owner.id).toBe(owner.id);
    expect(typeof row.owner.avatar).toBe('string');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/agency/bind-search');
    expect(res.status).toBe(401);
  });

  it('returns agency directory when q is missing or blank (existing agencies only)', async () => {
    const owner = await createTestUser({ role: 'agent' });
    const { id: agencyId } = await createTestAgency({ ownerId: owner.id });
    await prisma.agency.update({
      where: { id: agencyId },
      data: { name: 'Initial Directory Agency' },
    });
    const applicant = await createTestUser();
    const auth = { Authorization: `Bearer ${mintJwt(applicant.id)}` };

    const noParam = await request(app).get('/api/v1/agency/bind-search').set(auth);
    expect(noParam.status).toBe(200);
    expect(
      noParam.body.data.some((r: { name: string }) => r.name === 'Initial Directory Agency'),
    ).toBe(true);

    const blank = await request(app)
      .get('/api/v1/agency/bind-search?q=')
      .set(auth);
    expect(blank.status).toBe(200);
    expect(
      blank.body.data.some((r: { name: string }) => r.name === 'Initial Directory Agency'),
    ).toBe(true);
  });

  it('resolves parent agent by UUID, hakaId, and username in bind-search', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'Bind Search Exact' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hakaId: 'HKBINDEX01', username: 'bind_search_exact_agent' },
    });
    const { id: agencyId } = await createTestAgency({ ownerId: owner.id });
    await prisma.agency.update({ where: { id: agencyId }, data: { name: 'Bind Search Exact Agency' } });
    const applicant = await createTestUser();
    const auth = { Authorization: `Bearer ${mintJwt(applicant.id)}` };

    const byUuid = await request(app)
      .get(`/api/v1/agency/bind-search?q=${owner.id}`)
      .set(auth);
    expect(byUuid.status).toBe(200);
    expect(byUuid.body.data.some((r: { owner: { id: string } }) => r.owner.id === owner.id)).toBe(
      true,
    );

    const byHaka = await request(app)
      .get('/api/v1/agency/bind-search?q=HKBINDEX01')
      .set(auth);
    expect(byHaka.status).toBe(200);
    expect(
      byHaka.body.data.some((r: { owner: { hakaId: string | null } }) => r.owner.hakaId === 'HKBINDEX01'),
    ).toBe(true);

    const byUsername = await request(app)
      .get('/api/v1/agency/bind-search?q=bind_search_exact_agent')
      .set(auth);
    expect(byUsername.status).toBe(200);
    const row = byUsername.body.data.find(
      (r: { name: string }) => r.name === 'Bind Search Exact Agency',
    );
    expect(row).toBeTruthy();
    expect(typeof row.owner.avatar).toBe('string');
  });

  it('finds agent by partial username via bind-search', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'Username Search Agent' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { username: 'bind_search_partial_user' },
    });
    const { id: agencyId } = await createTestAgency({ ownerId: owner.id });
    await prisma.agency.update({
      where: { id: agencyId },
      data: { name: 'Username Search Agency' },
    });
    const applicant = await createTestUser();

    const res = await request(app)
      .get('/api/v1/agency/bind-search?q=partial_user')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(
      res.body.data.some((r: { owner: { id: string } }) => r.owner.id === owner.id),
    ).toBe(true);
  });

  it('resolves agent Haka ID case-insensitively in bind-search', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'Case Haka Agent' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hakaId: 'HKCASE01' },
    });
    await createTestAgency({ ownerId: owner.id });
    const applicant = await createTestUser();

    const res = await request(app)
      .get('/api/v1/agency/bind-search?q=hkcase01')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(
      res.body.data.some((r: { owner: { hakaId: string | null } }) => r.owner.hakaId === 'HKCASE01'),
    ).toBe(true);
  });

  it('includes agents with suspended agencies in bind-search', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'Suspended Agency Agent' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hakaId: 'HKSUSPEND01' },
    });
    const { id: agencyId } = await createTestAgency({ ownerId: owner.id });
    await prisma.agency.update({
      where: { id: agencyId },
      data: { name: 'Suspended Bind Agency', status: 'suspended' },
    });
    const applicant = await createTestUser();

    const res = await request(app)
      .get('/api/v1/agency/bind-search?q=HKSUSPEND01')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { owner: { hakaId: string | null } }) => r.owner.hakaId === 'HKSUSPEND01')).toBe(
      true,
    );
  });

  it('returns fuzzy results only when exact owner lookup misses', async () => {
    const normal = await createTestUser({ role: 'normal_user' });
    await prisma.user.update({
      where: { id: normal.id },
      data: { hakaId: 'HKBINDNONAGENT' },
    });
    const applicant = await createTestUser();
    const res = await request(app)
      .get('/api/v1/agency/bind-search?q=HKBINDNONAGENT')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('bind-search does not return or create agency for agent without agency row', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'The owner of the throne' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hakaId: '500000004' },
    });
    const applicant = await createTestUser();

    const res = await request(app)
      .get('/api/v1/agency/bind-search?q=500000004')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    const agency = await prisma.agency.findUnique({ where: { ownerId: owner.id } });
    expect(agency).toBeNull();
  });

  it('bind-search fuzzy name does not surface agent without agency', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'Throne Owner Browse' });
    const applicant = await createTestUser();

    const res = await request(app)
      .get('/api/v1/agency/bind-search?q=Throne Owner')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { owner: { id: string } }) => r.owner.id === owner.id)).toBe(
      false,
    );
  });
});

describe('GET /api/v1/agency/lookup-parent-agent', () => {
  it('resolves parent agent by UUID, hakaId, and username', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'Lookup Parent' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hakaId: 'HKLOOKUP01', username: 'lookup_parent_agent' },
    });
    const { id: agencyId } = await createTestAgency({ ownerId: owner.id });
    await prisma.agency.update({ where: { id: agencyId }, data: { name: 'Lookup Agency' } });
    const applicant = await createTestUser();
    const auth = { Authorization: `Bearer ${mintJwt(applicant.id)}` };

    const byUuid = await request(app)
      .get(`/api/v1/agency/lookup-parent-agent?q=${owner.id}`)
      .set(auth);
    expect(byUuid.status).toBe(200);
    expect(byUuid.body.data.owner.id).toBe(owner.id);

    const byHaka = await request(app)
      .get('/api/v1/agency/lookup-parent-agent?q=HKLOOKUP01')
      .set(auth);
    expect(byHaka.status).toBe(200);
    expect(byHaka.body.data.owner.hakaId).toBe('HKLOOKUP01');

    const byUsername = await request(app)
      .get('/api/v1/agency/lookup-parent-agent?q=lookup_parent_agent')
      .set(auth);
    expect(byUsername.status).toBe(200);
    expect(byUsername.body.data.name).toBe('Lookup Agency');
    expect(typeof byUsername.body.data.owner.avatar).toBe('string');
  });

  it('returns 404 for unknown agent ID', async () => {
    const applicant = await createTestUser();
    const res = await request(app)
      .get('/api/v1/agency/lookup-parent-agent?q=unknown-agent-id')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when user is not an agent', async () => {
    const normal = await createTestUser({ role: 'normal_user' });
    await prisma.user.update({
      where: { id: normal.id },
      data: { hakaId: 'HKNONAGENT' },
    });
    const applicant = await createTestUser();
    const res = await request(app)
      .get('/api/v1/agency/lookup-parent-agent?q=HKNONAGENT')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not an agent/i);
  });

  it('auto-creates agency when agent has role but no agency row (production repair)', async () => {
    const owner = await createTestUser({ role: 'agent', displayName: 'The owner of the throne' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hakaId: '500000004' },
    });
    const applicant = await createTestUser();

    const res = await request(app)
      .get('/api/v1/agency/lookup-parent-agent?q=500000004')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.owner.hakaId).toBe('500000004');
    expect(res.body.data.owner.displayName).toBe('The owner of the throne');
    expect(res.body.data.name).toMatch(/Agency$/);

    const agency = await prisma.agency.findUnique({ where: { ownerId: owner.id } });
    expect(agency).toBeTruthy();
    expect(agency?.status).not.toBe('banned');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/agency/lookup-parent-agent?q=x');
    expect(res.status).toBe(401);
  });
});

describe('Agent applications — pending + parent approve + DM', () => {
  it('apply-as-agent succeeds when parent agent has no agency before submit (auto-provision)', async () => {
    const parent = await createTestUser({ role: 'agent', displayName: 'Parent No Agency' });
    const applicant = await createTestUser();

    const before = await prisma.agency.findUnique({ where: { ownerId: parent.id } });
    expect(before).toBeNull();

    const submit = await request(app)
      .post('/api/v1/agency/apply-as-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({
        proposedName: 'Under Parent No Agency',
        country: 'GB',
        parentAgentId: parent.id,
      });

    expect(submit.status).toBe(201);
    expect(submit.body.data.parentAgent?.id).toBe(parent.id);

    const parentAgency = await prisma.agency.findUnique({ where: { ownerId: parent.id } });
    expect(parentAgency).toBeTruthy();
    expect(parentAgency?.name).toMatch(/Agency$/);
  });

  it('creates pending application, DM to owner, user notification; no admin queue row', async () => {
    const parent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: parent.id });
    const applicant = await createTestUser();

    const submit = await request(app)
      .post('/api/v1/agency/apply-as-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({
        proposedName: 'My Sub Agency',
        country: 'GB',
        parentAgentId: parent.id,
      });

    expect(submit.status).toBe(201);
    const appId = submit.body.data.id as string;

    const appRow = await prisma.agentApplication.findUnique({ where: { id: appId } });
    expect(appRow?.status).toBe('pending');
    expect(appRow?.parentAgentId).toBe(parent.id);

    const dm = await prisma.directMessage.findFirst({
      where: {
        senderId: applicant.id,
        recipientId: parent.id,
        messageType: 'agent_application',
      },
    });
    expect(dm).toBeTruthy();
    const payload = JSON.parse(dm!.content) as { kind: string; applicationId: string };
    expect(payload.kind).toBe('agent_application');
    expect(payload.applicationId).toBe(appId);

    const n = await prisma.notification.findFirst({
      where: { userId: parent.id, type: 'agent_application_request' },
    });
    expect(n).toBeTruthy();

    const adminRows = await prisma.adminNotification.findMany({
      where: { entityType: 'AgentApplication', entityId: appId },
    });
    expect(adminRows).toHaveLength(0);
  });

  it('parent approves → applicant becomes agent with child agency', async () => {
    const parent = await createTestUser({ role: 'agent' });
    const { id: parentAgencyId } = await createTestAgency({ ownerId: parent.id });
    const applicant = await createTestUser();

    const submit = await request(app)
      .post('/api/v1/agency/apply-as-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({ proposedName: 'Child Co', country: '', parentAgentId: parent.id });
    expect(submit.status).toBe(201);
    const appId = submit.body.data.id as string;

    const appr = await request(app)
      .post(`/api/v1/agency/agent-applications/${appId}/approve`)
      .set('Authorization', `Bearer ${mintJwt(parent.id, 'agent')}`)
      .send({ note: 'ok' });
    expect(appr.status).toBe(200);

    const u = await prisma.user.findUnique({ where: { id: applicant.id }, select: { role: true } });
    expect(u?.role).toBe('agent');
    const child = await prisma.agency.findUnique({ where: { ownerId: applicant.id } });
    expect(child?.parentAgencyId).toBe(parentAgencyId);
  });

  it('returns 403 when another agent tries to approve', async () => {
    const parent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: parent.id });
    const otherAgent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: otherAgent.id });
    const applicant = await createTestUser();

    const submit = await request(app)
      .post('/api/v1/agency/apply-as-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({ proposedName: 'X', country: '', parentAgentId: parent.id });
    const appId = submit.body.data.id as string;

    const appr = await request(app)
      .post(`/api/v1/agency/agent-applications/${appId}/approve`)
      .set('Authorization', `Bearer ${mintJwt(otherAgent.id, 'agent')}`)
      .send({});
    expect(appr.status).toBe(403);
  });
});

describe('Sub-agent invitations', () => {
  it('accept creates child agency for invitee', async () => {
    const inviter = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: inviter.id });
    const invitee = await createTestUser();

    const inv = await request(app)
      .post('/api/v1/agency/sub-agent-invitations')
      .set('Authorization', `Bearer ${mintJwt(inviter.id, 'agent')}`)
      .send({ targetUserIdOrHaka: invitee.id, proposedAgencyName: 'Invited Sub' });
    expect(inv.status).toBe(201);
    const invitationId = inv.body.data.id as string;

    const dm = await prisma.directMessage.findFirst({
      where: {
        senderId: inviter.id,
        recipientId: invitee.id,
        messageType: 'sub_agent_invite',
      },
    });
    expect(dm).toBeTruthy();

    const acc = await request(app)
      .post(`/api/v1/agency/sub-agent-invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${mintJwt(invitee.id)}`)
      .send({});
    expect(acc.status).toBe(200);

    const u = await prisma.user.findUnique({ where: { id: invitee.id }, select: { role: true } });
    expect(u?.role).toBe('agent');
    const invRow = await prisma.subAgentInvitation.findUnique({ where: { id: invitationId } });
    expect(invRow?.status).toBe('accepted');
  });

  it('returns 403 when wrong user accepts', async () => {
    const inviter = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: inviter.id });
    const invitee = await createTestUser();
    const stranger = await createTestUser();

    const inv = await request(app)
      .post('/api/v1/agency/sub-agent-invitations')
      .set('Authorization', `Bearer ${mintJwt(inviter.id, 'agent')}`)
      .send({ targetUserIdOrHaka: invitee.id });
    const invitationId = inv.body.data.id as string;

    const acc = await request(app)
      .post(`/api/v1/agency/sub-agent-invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${mintJwt(stranger.id)}`)
      .send({});
    expect(acc.status).toBe(403);
  });
});

describe('Host application — agent path (no admin notification)', () => {
  it('apply-with-agent auto-approves, promotes the host, and notifies the agent only', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const applicant = await createTestUser();

    const res = await request(app)
      .post('/api/v1/host-application/apply-with-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({ agentId: agent.id });
    expect(res.status).toBe(201);
    const applicationId = res.body.data.id as string;

    // No admin notification on the agent path
    const adminRows = await prisma.adminNotification.findMany({
      where: { entityType: 'HostApplication', entityId: applicationId },
    });
    expect(adminRows).toHaveLength(0);

    // The flow is now auto-approved in one transaction — no separate agent
    // approval step. The applicant is promoted immediately.
    const application = await prisma.hostApplication.findUniqueOrThrow({
      where: { id: applicationId },
      select: { status: true, path: true },
    });
    expect(application.status).toBe('approved');
    expect(application.path).toBe('self_apply_with_agent');

    const promoted = await prisma.user.findUnique({
      where: { id: applicant.id },
      select: { role: true, hostType: true, agentId: true },
    });
    expect(promoted?.role).toBe('host');
    expect(promoted?.hostType).toBe('agent_host');
    expect(promoted?.agentId).toBe(agent.id);

    // The agent is informed via a fire-and-forget `host_joined_agency`
    // notification; poll briefly since it's not awaited by the request.
    let agentNotif = null;
    for (let i = 0; i < 10 && !agentNotif; i++) {
      agentNotif = await prisma.notification.findFirst({
        where: { userId: agent.id, type: 'host_joined_agency' },
      });
      if (!agentNotif) await new Promise((r) => setTimeout(r, 100));
    }
    expect(agentNotif).toBeTruthy();
  });

  it('returns 403 when another agent tries to approve', async () => {
    const agent1 = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent1.id });
    const agent2 = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent2.id });
    const applicant = await createTestUser();

    const res = await request(app)
      .post('/api/v1/host-application/apply-with-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({ agentId: agent1.id });
    const applicationId = res.body.data.id as string;

    const appr = await request(app)
      .post(`/api/v1/agency/host-applications/${applicationId}/approve`)
      .set('Authorization', `Bearer ${mintJwt(agent2.id, 'agent')}`)
      .send({});
    expect(appr.status).toBe(403);
  });
});

describe('Agency change request — owner in-app notification, no admin row', () => {
  it('creates Notification for current agent, not AdminNotification', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const beforeAdmin = await prisma.adminNotification.count();

    const leaveRes = await request(app)
      .post('/api/v1/hosts/me/agency/leave')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`)
      .send({ reason: 'notify test' });
    expect(leaveRes.status).toBe(200);
    const requestId = leaveRes.body.data.id as string;

    const afterAdmin = await prisma.adminNotification.count();
    expect(afterAdmin).toBe(beforeAdmin);

    // The notification is fire-and-forget on the server; poll briefly so a
    // slow full-suite run doesn't race it (passes-alone / flakes-together).
    let n = null;
    for (let i = 0; i < 10 && !n; i++) {
      n = await prisma.notification.findFirst({
        where: { userId: agent.id, type: 'agency_change_request' },
      });
      if (!n) await new Promise((r) => setTimeout(r, 100));
    }
    expect(n).toBeTruthy();
    expect((n?.data as { requestId?: string })?.requestId).toBe(requestId);
  });
});
