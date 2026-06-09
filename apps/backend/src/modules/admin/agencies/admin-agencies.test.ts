import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin-agencies — dead fields rejected', () => {
  let adminToken = '';
  beforeEach(async () => {
    await resetDb();
    const admin = await createTestAdmin({ role: 'super_admin' });
    adminToken = mintAdminJwt(admin.id, 'super_admin');
  });

  it('POST /api/v1/admin/agencies rejects hostRevenueShare via strict zod', async () => {
    const owner = await createTestUser();
    const res = await request(app)
      .post('/api/v1/admin/agencies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', ownerId: owner.id, hostRevenueShare: 0.7 });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/v1/admin/agencies/:id rejects companyShare via strict zod', async () => {
    const owner = await createTestUser();
    const agency = await prisma.agency.create({ data: { name: 'X', ownerId: owner.id } });
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyShare: 0.1 });
    expect(res.status).toBe(400);
  });

  it('GET /api/v1/admin/agencies/:id response omits the three dead fields', async () => {
    const owner = await createTestUser();
    const agency = await prisma.agency.create({ data: { name: 'X', ownerId: owner.id } });
    const res = await request(app)
      .get(`/api/v1/admin/agencies/${agency.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.hostRevenueShare).toBeUndefined();
    expect(res.body.data.agentRevenueShare).toBeUndefined();
    expect(res.body.data.companyShare).toBeUndefined();
  });

  it('PATCH /api/v1/admin/agencies/:id updates giftBonusEnabled', async () => {
    const owner = await createTestUser();
    const agency = await prisma.agency.create({
      data: { name: 'Toggle Agency', ownerId: owner.id, giftBonusEnabled: true },
    });
    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agency.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ giftBonusEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.giftBonusEnabled).toBe(false);
    const row = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(row.giftBonusEnabled).toBe(false);
  });
});

describe('POST /api/v1/admin/agencies — create with owner union + limits', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('creates an agency and a new owner account, persisting limits + commission', async () => {
    const res = await request(app)
      .post('/api/v1/admin/agencies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Nova Agency',
        owner: { mode: 'create', displayName: 'Nova Owner', phone: '+15553334444', country: 'US' },
        region: 'SEA',
        country: 'US',
        commissionPct: 12,
        hostLimit: 50,
        withdrawalLimitMonthly: '1000000',
      });
    expect(res.status).toBe(201);
    const agency = await prisma.agency.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(agency.hostLimit).toBe(50);
    expect(String(agency.withdrawalLimitMonthly)).toBe('1000000');
    expect(agency.country).toBe('US');
    expect(Number(agency.commissionRateOverride)).toBeCloseTo(0.12);
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: agency.ownerId } });
    expect(owner.role).toBe('agent');
    expect(owner.hakaId).toMatch(/^\d{9}$/);
  });

  it('still supports the legacy ownerId form', async () => {
    const owner = await createTestUser({ role: 'normal_user' });
    await prisma.user.update({
      where: { id: owner.id },
      data: { hakaId: '500000777' },
    });
    const res = await request(app)
      .post('/api/v1/admin/agencies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Legacy Agency', ownerId: owner.id });
    expect(res.status).toBe(201);
    expect(res.body.data.ownerId).toBe(owner.id);
  });

  it('links an existing owner by Haka ID', async () => {
    const user = await prisma.user.create({
      data: { displayName: 'Linked Owner', hakaId: '500000888', role: 'normal_user' },
    });
    const res = await request(app)
      .post('/api/v1/admin/agencies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Linked Agency',
        owner: { mode: 'link', hakaId: '500000888' },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.ownerId).toBe(user.id);
  });
});
