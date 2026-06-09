import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin BD management', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('GET /api/v1/admin/bd lists bd + bdm with agency counts', async () => {
    const admin = await createTestAdmin({ role: 'admin' });
    const bd = await createTestAdmin({ role: 'bd', managerId: admin.id, region: 'SEA' });
    const owner = await createTestUser();
    await prisma.agency.create({ data: { name: 'A1', ownerId: owner.id, bdId: bd.id } });

    const res = await request(app).get('/api/v1/admin/bd').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((b: any) => b.id === bd.id);
    expect(row.agencyCount).toBe(1);
    expect(row.region).toBe('SEA');
  });

  it('POST /api/v1/admin/bd/assign-agency sets agency.bdId', async () => {
    const bd = await createTestAdmin({ role: 'bd' });
    const owner = await createTestUser();
    const agency = await prisma.agency.create({ data: { name: 'A1', ownerId: owner.id } });

    const res = await request(app).post('/api/v1/admin/bd/assign-agency')
      .set('Authorization', `Bearer ${token}`)
      .send({ agencyId: agency.id, bdId: bd.id });
    expect(res.status).toBe(200);
    const after = await prisma.agency.findUnique({ where: { id: agency.id } });
    expect(after?.bdId).toBe(bd.id);
  });

  it('POST /api/v1/admin/bd/transfer-agency moves agency between BDs', async () => {
    const bd1 = await createTestAdmin({ role: 'bd' });
    const bd2 = await createTestAdmin({ role: 'bd' });
    const owner = await createTestUser();
    const agency = await prisma.agency.create({ data: { name: 'A1', ownerId: owner.id, bdId: bd1.id } });

    const res = await request(app).post('/api/v1/admin/bd/transfer-agency')
      .set('Authorization', `Bearer ${token}`)
      .send({ agencyId: agency.id, toBdId: bd2.id });
    expect(res.status).toBe(200);
    const after = await prisma.agency.findUnique({ where: { id: agency.id } });
    expect(after?.bdId).toBe(bd2.id);
  });
});

describe('POST /api/v1/admin/bd — create BD', () => {
  let token = '';
  let adminId = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
    const admin = await createTestAdmin({ role: 'admin' });
    adminId = admin.id;
  });

  it('creates a senior BD linking an existing app user as the Haka ID', async () => {
    await prisma.user.create({ data: { displayName: 'Sam', hakaId: '500000006' } });
    const res = await request(app)
      .post('/api/v1/admin/bd')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'sam.bd@example.com',
        password: 'password123',
        displayName: 'Sam BD',
        role: 'senior_bd',
        managerId: adminId,
        region: 'SEA',
        appUser: { mode: 'link', hakaId: '500000006' },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('senior_bd');
    expect(res.body.data.hakaId).toBe('500000006');
    expect(res.body.data.managerId).toBe(adminId);
  });

  it('creates a junior BD and a fresh app account for the Haka ID', async () => {
    const senior = await createTestAdmin({ role: 'senior_bd', managerId: adminId });
    const res = await request(app)
      .post('/api/v1/admin/bd')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'junior.bd@example.com',
        password: 'password123',
        displayName: 'Junior BD',
        role: 'bd',
        managerId: senior.id,
        appUser: { mode: 'create', displayName: 'Junior BD', phone: '+15557770000' },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('bd');
    expect(res.body.data.hakaId).toMatch(/^\d{9}$/);
  });

  it('rejects a non-BD role', async () => {
    const res = await request(app)
      .post('/api/v1/admin/bd')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'x@example.com',
        password: 'password123',
        displayName: 'X',
        role: 'admin',
        appUser: { mode: 'create', displayName: 'X' },
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 when link hakaId not found', async () => {
    const res = await request(app)
      .post('/api/v1/admin/bd')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'missing@example.com',
        password: 'password123',
        displayName: 'Missing',
        role: 'senior_bd',
        managerId: adminId,
        appUser: { mode: 'link', hakaId: '999999999' },
      });
    expect(res.status).toBe(404);
  });
});
