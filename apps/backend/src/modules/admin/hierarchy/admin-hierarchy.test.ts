import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestAdmin, createTestUser, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin hierarchy (Admin Management)', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('GET /api/v1/admin/management/admins lists admins with BD counts', async () => {
    const admin = await createTestAdmin({ role: 'admin' });
    await createTestAdmin({ role: 'bd', managerId: admin.id });
    await createTestAdmin({ role: 'bdm', managerId: admin.id });

    const res = await request(app).get('/api/v1/admin/management/admins').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((a: any) => a.id === admin.id);
    expect(row.bdCount).toBe(2);
  });

  it('counts agencies directly under regional admin (Become Agency path)', async () => {
    const admin = await createTestAdmin({ role: 'admin' });
    const agentUser = await createTestUser({ role: 'agent' });
    await prisma.agency.create({
      data: {
        name: 'Direct Under Admin',
        ownerId: agentUser.id,
        status: 'active',
        bdId: admin.id,
      },
    });

    const res = await request(app).get('/api/v1/admin/management/admins').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((a: any) => a.id === admin.id);
    expect(row.agencyCount).toBe(1);
  });

  it('POST /api/v1/admin/management/transfer-bd moves a BD between admins', async () => {
    const a1 = await createTestAdmin({ role: 'admin' });
    const a2 = await createTestAdmin({ role: 'admin' });
    const bd = await createTestAdmin({ role: 'bd', managerId: a1.id });

    const res = await request(app).post('/api/v1/admin/management/transfer-bd')
      .set('Authorization', `Bearer ${token}`)
      .send({ bdId: bd.id, toAdminId: a2.id });
    expect(res.status).toBe(200);
    const after = await prisma.adminUser.findUnique({ where: { id: bd.id } });
    expect(after?.managerId).toBe(a2.id);
  });
});
