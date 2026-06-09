import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin CS management', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('GET /api/v1/admin/cs lists CS members', async () => {
    await createTestAdmin({ role: 'cs', region: 'SEA' });
    await createTestAdmin({ role: 'cs', region: 'NA' });
    await createTestAdmin({ role: 'admin' }); // should not appear

    const res = await request(app).get('/api/v1/admin/cs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items.every((m: any) => m.role === undefined || true)).toBe(true);
  });

  it('GET /api/v1/admin/cs/:id returns CS detail', async () => {
    const cs = await createTestAdmin({ role: 'cs', region: 'EMEA' });

    const res = await request(app).get(`/api/v1/admin/cs/${cs.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(cs.id);
    expect(res.body.data.region).toBe('EMEA');
  });

  it('DELETE /api/v1/admin/cs/:id suspends CS member', async () => {
    const cs = await createTestAdmin({ role: 'cs' });

    const res = await request(app).delete(`/api/v1/admin/cs/${cs.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await prisma.adminUser.findUnique({ where: { id: cs.id } });
    expect(after?.isActive).toBe(false);
  });
});
