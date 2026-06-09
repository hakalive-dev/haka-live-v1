import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, mintJwt, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin notifications', () => {
  let adminToken: string;

  beforeEach(async () => {
    await resetDb();
    adminToken = mintAdminJwt(randomUUID(), 'super_admin');
  });

  it('creates a row when a user requests a withdrawal and exposes unread count', async () => {
    const user = await createTestUser({ beanBalance: 50_000 });
    const userToken = mintJwt(user.id);

    await prisma.currencyRate.upsert({
      where: { countryCode: 'US' },
      update: { isActive: true, minWithdrawalBeans: 10000 },
      create: {
        countryCode: 'US',
        countryName: 'United States',
        currency: 'USD',
        symbol: '$',
        usdRate: 1,
        minWithdrawalBeans: 10000,
        isActive: true,
        source: 'manual',
      },
    });

    const res = await request(app)
      .post('/api/v1/wallet/withdraw')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ beans: 15_000, notes: 'Pay me', countryCode: 'US' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const notif = await prisma.adminNotification.findFirst({
      where: { type: 'withdrawal_requested' },
    });
    expect(notif).not.toBeNull();
    expect(notif!.entityType).toBe('WithdrawalRequest');
    expect(notif!.entityId).toBeTruthy();

    const countRes = await request(app)
      .get('/api/v1/admin/notifications/unread-count')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(countRes.status).toBe(200);
    expect(countRes.body.data.count).toBe(1);
  });

  it('lists notifications and marks one read', async () => {
    await prisma.adminNotification.create({
      data: {
        type: 'report_submitted',
        title: 'Test report',
        body: 'Details',
        linkPath: '/moderation',
        entityType: 'Report',
        entityId: randomUUID(),
      },
    });

    const listRes = await request(app)
      .get('/api/v1/admin/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.length).toBe(1);
    const id = listRes.body.data.items[0].id as string;

    const patchRes = await request(app)
      .patch(`/api/v1/admin/notifications/${id}/read`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.readAt).toBeTruthy();

    const countRes = await request(app)
      .get('/api/v1/admin/notifications/unread-count')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(countRes.body.data.count).toBe(0);
  });
});
