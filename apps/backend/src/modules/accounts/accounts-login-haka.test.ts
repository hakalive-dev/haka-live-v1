/**
 * POST /api/v1/auth/login — Haka ID + password (production path)
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../../app';
import { resetDb, createTestUser } from '../../tests/db-helpers';
import { prisma } from '../../config/prisma';

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/v1/auth/login', () => {
  it('returns tokens when hakaId and bcrypt password match', async () => {
    const { id } = await createTestUser();
    const hakaId = '87654321';
    const plainPassword = 'MyPass123';
    const hash = await bcrypt.hash(plainPassword, 12);
    await prisma.user.update({
      where: { id },
      data: { hakaId, password: hash, onboardingComplete: true },
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ hakaId, password: plainPassword });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.user.hakaId).toBe(hakaId);
  });

  it('rejects wrong password', async () => {
    const { id } = await createTestUser();
    const hakaId = '11112222';
    await prisma.user.update({
      where: { id },
      data: { hakaId, password: await bcrypt.hash('correct', 12) },
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ hakaId, password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('rejects accounts without a password hash', async () => {
    const { id } = await createTestUser();
    const hakaId = '33334444';
    await prisma.user.update({ where: { id }, data: { hakaId } });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ hakaId, password: 'anything' });

    expect(res.status).toBe(401);
  });

  it('accepts active 6-digit VIP special ID as login identifier', async () => {
    const { id } = await createTestUser();
    const hakaId = '500123456';
    const vipId = '654321';
    const plainPassword = 'VipPass99';
    const hash = await bcrypt.hash(plainPassword, 12);
    await prisma.user.update({
      where: { id },
      data: {
        hakaId,
        password: hash,
        activeSpecialId: vipId,
        activeSpecialIdLevel: 'A',
        activeSpecialIdExpiresAt: null,
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ hakaId: vipId, password: plainPassword });

    expect(res.status).toBe(201);
    expect(res.body.data.user.hakaId).toBe(hakaId);
  });

  it('rejects expired VIP special ID as login identifier', async () => {
    const { id } = await createTestUser();
    const vipId = '111222';
    const hash = await bcrypt.hash('secret12', 12);
    await prisma.user.update({
      where: { id },
      data: {
        hakaId: '500999888',
        password: hash,
        activeSpecialId: vipId,
        activeSpecialIdExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ hakaId: vipId, password: 'secret12' });

    expect(res.status).toBe(401);
  });

});
