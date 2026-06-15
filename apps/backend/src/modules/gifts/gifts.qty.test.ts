/**
 * qty + combo — integration. Combo counter uses ioredis-mock (see tests/setup.ts).
 */
import request from 'supertest';
import app from '../../app';
import { bumpCombo } from './gifts.service';
import { resetDb, createTestUser, mintJwt, getWalletBalance } from '../../tests/db-helpers';
import { prisma } from '../../config/prisma';

beforeEach(async () => { await resetDb(); });

describe('qty multiplier', () => {
  it('5× Rose costs 5×coinCost and credits 5×beanValue × 0.70 to the host', async () => {
    const sender = await createTestUser({ coinBalance: 10_000 });
    const host   = await createTestUser({ role: 'host', hostType: 'independent' });
    const rose = await prisma.gift.findFirstOrThrow({ where: { name: 'Rose' } });

    const res = await request(app)
      .post('/api/v1/gifts/send')
      .set('Authorization', `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: rose.id, recipientId: host.id, qty: 5 });

    expect(res.status).toBe(201);
    expect(res.body.data.coinCost).toBe(rose.coinCost * 5);
    expect(res.body.data.beanValue).toBe(rose.beanValue * 5);
    expect((await getWalletBalance(host.id)).beans).toBe(Math.floor(rose.beanValue * 5 * 0.70));
  });

  it.each([0, -1, 10_000, 1.5])('rejects qty=%s', async (qty) => {
    const sender = await createTestUser({ coinBalance: 10_000 });
    const host   = await createTestUser();
    const rose = await prisma.gift.findFirstOrThrow({ where: { name: 'Rose' } });
    const res = await request(app)
      .post('/api/v1/gifts/send')
      .set('Authorization', `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: rose.id, recipientId: host.id, qty });
    expect(res.status).toBe(400);
  });
});

describe('combo counter (ioredis-mock)', () => {
  it('increments on repeat sends within the 5-second window', async () => {
    const roomId = 'r1', senderId = 's1', giftId = 'g1', recipientId = 'u1';
    expect(await bumpCombo(roomId, senderId, giftId, recipientId)).toBe(1);
    expect(await bumpCombo(roomId, senderId, giftId, recipientId)).toBe(2);
    expect(await bumpCombo(roomId, senderId, giftId, recipientId)).toBe(3);
  });
});
