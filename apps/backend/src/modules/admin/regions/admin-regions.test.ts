import request from 'supertest';
import app from '../../../app';
import { resetDb, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';

describe('regions CRUD', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    // resetDb truncates user/content tables but not reference tables; a SEA
    // region left over from a previous run breaks the unique(code) insert.
    const { prisma } = await import('../../../config/prisma');
    await prisma.region.deleteMany({ where: { code: 'SEA' } });
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('creates and lists a region', async () => {
    const c = await request(app).post('/api/v1/admin/regions')
      .set('Authorization', `Bearer ${token}`).send({ code: 'SEA', name: 'Southeast Asia' });
    expect(c.status).toBe(201);
    const l = await request(app).get('/api/v1/admin/regions').set('Authorization', `Bearer ${token}`);
    expect(l.body.data.items.map((r: any) => r.code)).toContain('SEA');
  });
});
