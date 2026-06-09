import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin hosts', () => {
  let token = '';
  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    token = mintAdminJwt(sa.id, 'super_admin');
  });

  it('GET /api/v1/admin/hosts returns hosts with verified, lastLiveAt, streamingMinutes', async () => {
    const host = await createTestUser({ role: 'host' });
    await prisma.user.update({
      where: { id: host.id },
      data: { lastLiveAt: new Date('2026-05-20T00:00:00Z'), isVerified: true },
    });

    const res = await request(app).get('/api/v1/admin/hosts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((h: any) => h.id === host.id);
    expect(row).toBeTruthy();
    expect(row.isVerified).toBe(true);
    expect(row.lastLiveAt).not.toBeNull();
    expect(row).toHaveProperty('streamingMinutes');
  });

  it('GET /api/v1/admin/hosts/active-count returns a number', async () => {
    await createTestUser({ role: 'host' });
    const res = await request(app).get('/api/v1/admin/hosts/active-count').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.activeHosts).toBe('number');
  });

  it('GET /api/v1/admin/hosts/:hostId/ownership returns history + counts', async () => {
    const host = await createTestUser({ role: 'host' });
    await prisma.hostAgencyOwnershipChange.create({
      data: {
        hostId: host.id,
        fromAgentId: null,
        toAgentId: null,
        changedByAdminId: (await prisma.adminUser.findFirstOrThrow()).id,
        reason: 'seed',
      },
    });

    const res = await request(app)
      .get(`/api/v1/admin/hosts/${host.id}/ownership`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('host');
    expect(res.body.data).toHaveProperty('history');
    expect(res.body.data).toHaveProperty('agencyChangeCount_7d');
  });
});
