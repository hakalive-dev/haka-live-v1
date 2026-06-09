import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import {
  resetDb,
  createTestUser,
  createTestAdmin,
  mintJwt,
  mintAdminJwt,
} from '../../../tests/db-helpers';

describe('admin designated-become-agency-admins', () => {
  let adminToken = '';

  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin', hakaId: 'HKADMIN001' });
    adminToken = mintAdminJwt(sa.id, 'super_admin');
  });

  it('creates, lists, updates, and deletes a designated admin by hakaId', async () => {
    await createTestAdmin({ role: 'bd', hakaId: 'HKBD0001' });

    const createRes = await request(app)
      .post('/api/v1/admin/designated-become-agency-admins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hakaId: 'HKBD0001', sortOrder: 2 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.admin.hakaId).toBe('HKBD0001');
    const id = createRes.body.data.id as string;

    const listRes = await request(app)
      .get('/api/v1/admin/designated-become-agency-admins')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const patchRes = await request(app)
      .patch(`/api/v1/admin/designated-become-agency-admins/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.isActive).toBe(false);

    const delRes = await request(app)
      .delete(`/api/v1/admin/designated-become-agency-admins/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
  });

  it('rejects admin without hakaId', async () => {
    const staff = await createTestAdmin({ role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/designated-become-agency-admins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ adminId: staff.id });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/agency/designated-admins', () => {
  beforeEach(async () => resetDb());

  it('returns only active designated admins with hakaId', async () => {
    const user = await createTestUser();
    const token = mintJwt(user.id);

    const activeStaff = await createTestAdmin({ role: 'bd', hakaId: 'HKLIST01' });
    const hiddenStaff = await createTestAdmin({ role: 'admin', hakaId: 'HKLIST02' });
    await createTestAdmin({ role: 'admin', hakaId: 'HKLIST03' });

    await prisma.designatedBecomeAgencyAdmin.createMany({
      data: [
        { adminId: activeStaff.id, sortOrder: 1, isActive: true },
        { adminId: hiddenStaff.id, sortOrder: 0, isActive: false },
      ],
    });

    const res = await request(app)
      .get('/api/v1/agency/designated-admins')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].hakaId).toBe('HKLIST01');
  });
});

describe('POST /api/v1/agency/apply-as-agent — designated admin root path', () => {
  beforeEach(async () => resetDb());

  it('auto-approves root agency with bdId when designatedAdminHakaId is valid', async () => {
    const staff = await createTestAdmin({ role: 'bd', hakaId: 'HKROOT01' });
    await prisma.designatedBecomeAgencyAdmin.create({
      data: { adminId: staff.id, sortOrder: 0, isActive: true },
    });
    const applicant = await createTestUser();

    const submit = await request(app)
      .post('/api/v1/agency/apply-as-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({
        proposedName: 'Root Agency Co',
        country: 'GB',
        designatedAdminHakaId: 'HKROOT01',
      });

    expect(submit.status).toBe(201);
    expect(submit.body.data.autoApproved).toBe(true);

    const u = await prisma.user.findUnique({ where: { id: applicant.id }, select: { role: true } });
    expect(u?.role).toBe('agent');

    const agency = await prisma.agency.findUnique({ where: { ownerId: applicant.id } });
    expect(agency?.bdId).toBe(staff.id);
    expect(agency?.parentAgencyId).toBeNull();

    const appRow = await prisma.agentApplication.findFirst({ where: { userId: applicant.id } });
    expect(appRow?.status).toBe('approved');
    expect(appRow?.designatedAdminId).toBe(staff.id);
    expect(appRow?.parentAgentId).toBeNull();
  });

  it('rejects non-designated admin hakaId', async () => {
    await createTestAdmin({ role: 'bd', hakaId: 'HKNOTLISTED' });
    const applicant = await createTestUser();

    const submit = await request(app)
      .post('/api/v1/agency/apply-as-agent')
      .set('Authorization', `Bearer ${mintJwt(applicant.id)}`)
      .send({
        proposedName: 'Fail Agency',
        country: '',
        designatedAdminHakaId: 'HKNOTLISTED',
      });

    expect(submit.status).toBe(400);
  });
});
