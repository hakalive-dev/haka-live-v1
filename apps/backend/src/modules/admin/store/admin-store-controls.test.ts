import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, createTestAdmin, mintAdminJwt } from '../../../tests/db-helpers';
import { storeService } from '../../store/store.service';
import { setItemSaleStatus } from './admin-store-sale.service';

describe('admin store super-admin controls', () => {
  let superToken = '';
  let superAdminId = '';
  let adminToken = '';
  let userId = '';
  let itemId = '';

  beforeEach(async () => {
    await resetDb();
    const sa = await createTestAdmin({ role: 'super_admin' });
    superAdminId = sa.id;
    superToken = mintAdminJwt(sa.id, 'super_admin');

    const regularAdmin = await createTestAdmin({ role: 'admin', email: 'admin2@test.com' });
    adminToken = mintAdminJwt(regularAdmin.id, 'admin');

    const user = await createTestUser();
    userId = user.id;

    const item = await prisma.storeItem.create({
      data: {
        name: 'Test Frame',
        category: 'frame',
        coinCost: 100,
        durationDays: 7,
        isActive: true,
        isForSale: true,
      },
    });
    itemId = item.id;
  });

  it('blocks purchase when isForSale is false', async () => {
    await prisma.wallet.create({
      data: { userId, coinBalance: 1000 },
    });
    await setItemSaleStatus(itemId, false, superAdminId, '127.0.0.1', { reason: 'test' });

    await expect(storeService.purchase(userId, itemId)).rejects.toMatchObject({
      message: 'This item is not for sale',
    });
  });

  it('super_admin can send item without charging coins', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/store/${itemId}/send`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ userId, quantity: 1, reason: 'Event reward' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const owned = await prisma.userStoreItem.findMany({ where: { userId, itemId } });
    expect(owned.length).toBe(1);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(wallet).toBeNull();

    const dist = await prisma.storeItemDistribution.findFirst({ where: { recipientUserId: userId } });
    expect(dist).toBeTruthy();
    expect(dist?.reason).toBe('Event reward');
  });

  it('records sale status history on patch', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/store/${itemId}/sale-status`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ isForSale: false, reason: 'Maintenance' });

    expect(res.status).toBe(200);

    const logs = await prisma.storeItemSaleStatusLog.findMany({ where: { itemId } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]?.newForSale).toBe(false);
  });

  it('forbids non-super_admin from sending items', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/store/${itemId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId, quantity: 1, reason: 'Nope' });

    expect(res.status).toBe(403);
  });

  it('GET store items includes is_for_sale for mobile', async () => {
    await setItemSaleStatus(itemId, false, superAdminId, '127.0.0.1');
    const items = await storeService.getItems('frame');
    const found = items.find((i) => i.id === itemId);
    expect(found?.is_for_sale).toBe(false);
  });
});
