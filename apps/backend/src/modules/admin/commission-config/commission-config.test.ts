import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, mintJwt, mintAdminJwt } from '../../../tests/db-helpers';

let adminToken = '';
beforeEach(async () => {
  await resetDb();
  const admin = await createTestUser({ role: 'normal_user' });    // role irrelevant for admin mint
  adminToken = mintAdminJwt(admin.id, 'super_admin');
});

describe('admin commission-config — tiers', () => {
  it('lists tiers ordered by minHostIncome asc', async () => {
    const res = await request(app).get('/api/v1/admin/commission-tiers').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);
    const mins = res.body.data.map((t: { minHostIncome: string }) => BigInt(t.minHostIncome));
    for (let i = 1; i < mins.length; i++) expect(mins[i]).toBeGreaterThanOrEqual(mins[i - 1]);
  });

  it('creates a new tier and clears tier cache', async () => {
    const res = await request(app)
      .post('/api/v1/admin/commission-tiers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'F', minHostIncome: '40000000', commissionRate: 0.24 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('F');
    const row = await prisma.agencyTier.findFirstOrThrow({ where: { name: 'F' } });
    expect(Number(row.commissionRate)).toBe(0.24);
    // Clean up so subsequent test runs / describes don't see a leftover F tier.
    await prisma.agencyTier.delete({ where: { id: row.id } });
  });

  it('rejects rate out of range', async () => {
    const res = await request(app)
      .post('/api/v1/admin/commission-tiers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Z', minHostIncome: '0', commissionRate: 1.5 });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate name', async () => {
    const res = await request(app)
      .post('/api/v1/admin/commission-tiers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'A', minHostIncome: '0', commissionRate: 0.05 });
    expect(res.status).toBe(409);
  });

  it('rejects deleting the last zero-income tier', async () => {
    const aTier = await prisma.agencyTier.findFirstOrThrow({ where: { name: 'A' } });
    const res = await request(app)
      .delete(`/api/v1/admin/commission-tiers/${aTier.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/zero_income_tier_required/);
  });

  it('rejects update that would remove the last zero-income tier', async () => {
    const aTier = await prisma.agencyTier.findFirstOrThrow({ where: { name: 'A' } });
    const res = await request(app)
      .patch(`/api/v1/admin/commission-tiers/${aTier.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ minHostIncome: '100' });
    expect(res.status).toBe(409);
  });

  it('updates tier name and commission rate', async () => {
    const bTier = await prisma.agencyTier.findFirstOrThrow({ where: { name: 'B' } });
    const originalName = bTier.name;
    const originalRate = Number(bTier.commissionRate);
    try {
      const res = await request(app)
        .patch(`/api/v1/admin/commission-tiers/${bTier.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'B-renamed', commissionRate: 0.12 });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('B-renamed');
      expect(res.body.data.commissionRate).toBe(0.12);
    } finally {
      // Restore original values so other tests / seeds remain intact.
      await prisma.agencyTier.update({
        where: { id: bTier.id },
        data: { name: originalName, commissionRate: originalRate },
      });
    }
  });

  it('deletes a non-zero-income tier', async () => {
    // Create a fresh tier to delete so we don't disturb seed tiers A-E.
    const created = await prisma.agencyTier.create({
      data: {
        name: 'TEMP-DEL',
        minHostIncome: BigInt('99999999'),
        commissionRate: 0.3,
        order: 999,
      },
    });
    try {
      const res = await request(app)
        .delete(`/api/v1/admin/commission-tiers/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      const gone = await prisma.agencyTier.findUnique({ where: { id: created.id } });
      expect(gone).toBeNull();
    } finally {
      await prisma.agencyTier.deleteMany({ where: { id: created.id } });
    }
  });

  it('rejects unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/v1/admin/commission-tiers');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin caller with 403', async () => {
    const normal = await createTestUser();
    const userToken = mintAdminJwt(normal.id, 'moderator');
    const res = await request(app)
      .get('/api/v1/admin/commission-tiers')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

describe('admin commission-config — gift bonus singleton', () => {
  it('returns the singleton', async () => {
    const res = await request(app)
      .get('/api/v1/admin/gift-bonus-setting')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('singleton');
    expect(res.body.data.bonusRate).toBeCloseTo(0.15);
    expect(res.body.data.enabled).toBe(true);
  });

  it('updates bonusRate', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/gift-bonus-setting')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bonusRate: 0.20 });
    expect(res.status).toBe(200);
    expect(res.body.data.bonusRate).toBeCloseTo(0.20);
  });

  it('rejects bonusRate out of range', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/gift-bonus-setting')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bonusRate: 1.2 });
    expect(res.status).toBe(400);
  });

  it('updates enabled only', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/gift-bonus-setting')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
  });

  it('rejects empty patch body', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/gift-bonus-setting')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields via .strict()', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/gift-bonus-setting')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bonusRate: 0.1, extra: 'no' });
    expect(res.status).toBe(400);
  });

  it('rejects non-admin caller with 403', async () => {
    const normal = await createTestUser();
    const userToken = mintAdminJwt(normal.id, 'moderator');
    const res = await request(app)
      .patch('/api/v1/admin/gift-bonus-setting')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bonusRate: 0.1 });
    expect(res.status).toBe(403);
  });
});

describe('admin commission-config — gift bonus tiers', () => {
  it('lists tiers ordered by minRollingIncome asc', async () => {
    const res = await request(app)
      .get('/api/v1/admin/gift-bonus-tiers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('creates and deletes a tier', async () => {
    const create = await request(app)
      .post('/api/v1/admin/gift-bonus-tiers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'TmpGBT', minRollingIncome: '999999999', bonusRate: 0.08 });
    expect(create.status).toBe(200);
    const id = create.body.data.id as string;
    const del = await request(app)
      .delete(`/api/v1/admin/gift-bonus-tiers/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
  });
});

describe('admin commission-config — per-agency overrides', () => {
  const createdAgencyIds: string[] = [];

  async function makeAgency() {
    const owner = await createTestUser();
    const a = await prisma.agency.create({
      data: { name: 'TestAgency', ownerId: owner.id },
    });
    createdAgencyIds.push(a.id);
    return a;
  }

  afterEach(async () => {
    if (createdAgencyIds.length > 0) {
      await prisma.agency.deleteMany({ where: { id: { in: [...createdAgencyIds] } } });
      createdAgencyIds.length = 0;
    }
  });


  it('sets commission override', async () => {
    const agency = await makeAgency();
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}/commission-override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rate: 0.18 });
    expect(res.status).toBe(200);
    const row = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(Number(row.commissionRateOverride)).toBeCloseTo(0.18);
  });

  it('clears commission override when rate is null', async () => {
    const agency = await makeAgency();
    await prisma.agency.update({
      where: { id: agency.id },
      data: {
        commissionRateOverride: 0.18,
        commissionRateOverrideValidUntil: new Date(Date.now() + 86_400_000),
      },
    });
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}/commission-override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rate: null });
    expect(res.status).toBe(200);
    const row = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(row.commissionRateOverride).toBeNull();
    expect(row.commissionRateOverrideValidUntil).toBeNull();
  });

  it('sets commission override with validUntil', async () => {
    const agency = await makeAgency();
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}/commission-override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rate: 0.12, validUntil: until });
    expect(res.status).toBe(200);
    expect(res.body.data.commissionRateOverrideValidUntil).toBeTruthy();
    const row = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(Number(row.commissionRateOverride)).toBeCloseTo(0.12);
    expect(row.commissionRateOverrideValidUntil).toBeTruthy();
  });

  it('sets gift-bonus override', async () => {
    const agency = await makeAgency();
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}/gift-bonus-override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rate: 0.30 });
    expect(res.status).toBe(200);
    const row = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(Number(row.giftBonusRateOverride)).toBeCloseTo(0.30);
  });

  it('rejects rate outside [0,1]', async () => {
    const agency = await makeAgency();
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}/commission-override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rate: 2.0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown agency', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/00000000-0000-0000-0000-000000000000/commission-override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rate: 0.15 });
    expect(res.status).toBe(404);
  });

  it('rejects non-admin with 403', async () => {
    const agency = await makeAgency();
    const normal = await createTestUser();
    const userToken = mintAdminJwt(normal.id, 'moderator');
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}/commission-override`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rate: 0.15 });
    expect(res.status).toBe(403);
  });
});

describe('admin commission-config — ledger read', () => {
  const createdAgencyIds: string[] = [];

  async function makeAgency() {
    const owner = await createTestUser();
    const a = await prisma.agency.create({
      data: { name: 'LedgerTestAgency', ownerId: owner.id },
    });
    createdAgencyIds.push(a.id);
    return a;
  }

  afterEach(async () => {
    if (createdAgencyIds.length > 0) {
      await prisma.agency.deleteMany({ where: { id: { in: [...createdAgencyIds] } } });
      createdAgencyIds.length = 0;
    }
  });

  it('returns paginated ledger rows for an agency', async () => {
    const agency = await makeAgency();
    const res = await request(app)
      .get(`/api/v1/admin/agencies/${agency.id}/commission-ledger?limit=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('rows');
    expect(res.body.data).toHaveProperty('nextCursor');
    expect(Array.isArray(res.body.data.rows)).toBe(true);
  });

  it('rejects unauthenticated caller with 401', async () => {
    const agency = await makeAgency();
    const res = await request(app)
      .get(`/api/v1/admin/agencies/${agency.id}/commission-ledger`);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin with 403', async () => {
    const agency = await makeAgency();
    const normal = await createTestUser();
    const userToken = mintAdminJwt(normal.id, 'moderator');
    const res = await request(app)
      .get(`/api/v1/admin/agencies/${agency.id}/commission-ledger`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
