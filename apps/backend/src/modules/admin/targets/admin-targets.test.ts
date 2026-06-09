import request from 'supertest';
import app from '../../../app';
import { resetDb, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';

describe('staff targets', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('upserts a target for a BD and reads it back with attainment', async () => {
    const bd = await createTestAdmin({ role: 'bd' });
    const up = await request(app).put('/api/v1/admin/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ staffId: bd.id, period: 'month', periodStart: '2026-05-01', revenueTarget: '1000000', onboardTarget: 5 });
    expect(up.status).toBe(200);

    const get = await request(app)
      .get(`/api/v1/admin/targets?staffId=${bd.id}&period=month&periodStart=2026-05-01`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.target.revenueTarget).toBe('1000000');
    expect(get.body.data.actual).toHaveProperty('revenue');
    expect(get.body.data.attainment).toHaveProperty('revenuePct');
  });
});
