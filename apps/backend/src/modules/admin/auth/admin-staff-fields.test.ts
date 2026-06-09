import request from 'supertest';
import app from '../../../app';
import { resetDb, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin staff fields (region / hakaId / managerId)', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('POST /api/v1/admin/auth/admins creates admin with region and hakaId', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'staff_test@haka.test',
        password: 'Password123!',
        displayName: 'Staff Test',
        role: 'admin',
        region: 'SEA',
        hakaId: 'haka_staff_001',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.region).toBe('SEA');
    expect(res.body.data.hakaId).toBe('haka_staff_001');
    expect(res.body.data.managerId).toBeNull();
  });

  it('POST /api/v1/admin/auth/admins auto-generates hakaId when omitted', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'auto_haka@haka.test',
        password: 'Password123!',
        displayName: 'Auto Haka Staff',
        role: 'admin',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.hakaId).toMatch(/^500\d{6}$/);
  });

  it('PATCH /api/v1/admin/auth/admins/:id updates region and managerId', async () => {
    const mgr = await createTestAdmin({ role: 'admin' });
    const bd = await createTestAdmin({ role: 'bd' });

    const res = await request(app)
      .patch(`/api/v1/admin/auth/admins/${bd.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ region: 'NA', managerId: mgr.id });

    expect(res.status).toBe(200);
    expect(res.body.data.region).toBe('NA');
    expect(res.body.data.managerId).toBe(mgr.id);
  });

  it('GET /api/v1/admin/auth/me returns region hakaId managerId fields', async () => {
    const sa = await createTestAdmin({ role: 'super_admin', region: 'EMEA', hakaId: 'hk_sa' });
    const t = mintAdminJwt(sa.id, 'super_admin');

    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.region).toBe('EMEA');
    expect(res.body.data.hakaId).toBe('hk_sa');
  });
});

describe('admin create — username phone country', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('persists username, phone, country on create and returns them', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'newadmin@example.com',
        password: 'password123',
        displayName: 'New Admin',
        role: 'admin',
        username: 'newadmin',
        phone: '+15551230000',
        country: 'US',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.username).toBe('newadmin');
    expect(res.body.data.phone).toBe('+15551230000');
    expect(res.body.data.country).toBe('US');
  });

  it('updates staff fields via PATCH', async () => {
    const target = await createTestAdmin({ role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/admin/auth/admins/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+15559999999', country: 'IN' });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('+15559999999');
    expect(res.body.data.country).toBe('IN');
  });

  it('GET /auth/me returns username phone country', async () => {
    const sa = await createTestAdmin({
      role: 'super_admin',
      username: 'sa_user',
      phone: '+10000000001',
      country: 'GB',
    });
    const meToken = mintAdminJwt(sa.id, 'super_admin');
    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${meToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('sa_user');
    expect(res.body.data.country).toBe('GB');
  });

  it('rejects BD roles on staff create', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'bd@example.com',
        password: 'password123',
        displayName: 'BD',
        role: 'senior_bd',
      });
    expect(res.status).toBe(400);
  });

  it('stores and lists retrievable login password for super admin', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/auth/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'pwstaff@haka.test',
        password: 'StaffPass99',
        displayName: 'PW Staff',
        role: 'moderator',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.loginPasswordDisplay).toBe('StaffPass99');
    expect(createRes.body.data.loginPasswordCopyable).toBe(true);

    const listRes = await request(app)
      .get('/api/v1/admin/auth/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    const row = (listRes.body.data as Array<{ email: string; loginPasswordDisplay?: string }>)
      .find((a) => a.email === 'pwstaff@haka.test');
    expect(row?.loginPasswordDisplay).toBe('StaffPass99');
  });

  it('super admin can change staff password via PATCH', async () => {
    const target = await createTestAdmin({ role: 'moderator' });
    const res = await request(app)
      .patch(`/api/v1/admin/auth/admins/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'NewPass123' });

    expect(res.status).toBe(200);
    expect(res.body.data.loginPasswordDisplay).toBe('NewPass123');
    expect(res.body.data.loginPasswordCopyable).toBe(true);
  });
});
