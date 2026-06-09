/**
 * WhatsApp phone-login OTP — /api/v1/auth/whatsapp/{send,verify,bind}
 *
 * The Meta Cloud API send is mocked (no real network / creds needed); every other
 * layer (routes → controller → phone-otp.service → Postgres) runs for real.
 * The OTP code is read back from the mocked sendOtp call args.
 */
import request from 'supertest';

// Mock only the outbound WhatsApp send; the rest of the OTP service is exercised.
jest.mock('./whatsapp.service', () => ({
  sendOtp: jest.fn().mockResolvedValue(undefined),
  isWhatsAppConfigured: jest.fn().mockReturnValue(true),
}));

import app from '../../app';
import { resetDb, createTestUser, mintJwt } from '../../tests/db-helpers';
import { prisma } from '../../config/prisma';
import { sendOtp } from './whatsapp.service';

const mockedSendOtp = sendOtp as jest.MockedFunction<typeof sendOtp>;

const PHONE = '+447700900123';

/** Trigger a send and return the 6-digit code captured from the mocked WhatsApp call. */
async function requestCode(phone = PHONE): Promise<string> {
  mockedSendOtp.mockClear();
  const res = await request(app).post('/api/v1/auth/whatsapp/send').send({ phone });
  expect(res.status).toBe(200);
  const code = mockedSendOtp.mock.calls[0][1];
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

beforeEach(async () => {
  await resetDb();
  mockedSendOtp.mockClear();
});

describe('POST /api/v1/auth/whatsapp/send', () => {
  it('stores a bcrypt-hashed code (never plaintext) and sends via WhatsApp', async () => {
    const res = await request(app).post('/api/v1/auth/whatsapp/send').send({ phone: PHONE });

    expect(res.status).toBe(200);
    expect(mockedSendOtp).toHaveBeenCalledTimes(1);

    const row = await prisma.phoneOtp.findFirst({ where: { phone: PHONE } });
    expect(row).toBeTruthy();
    const sentCode = mockedSendOtp.mock.calls[0][1];
    expect(row!.codeHash).not.toBe(sentCode); // hashed, not raw
    expect(row!.codeHash.startsWith('$2')).toBe(true); // bcrypt
    expect(row!.usedAt).toBeNull();
  });

  it('rejects an invalid phone number', async () => {
    const res = await request(app).post('/api/v1/auth/whatsapp/send').send({ phone: 'abc' });
    expect(res.status).toBe(400);
    expect(mockedSendOtp).not.toHaveBeenCalled();
  });

  it('enforces a resend cooldown', async () => {
    await request(app).post('/api/v1/auth/whatsapp/send').send({ phone: PHONE });
    const second = await request(app).post('/api/v1/auth/whatsapp/send').send({ phone: PHONE });
    expect(second.status).toBe(429);
  });
});

describe('POST /api/v1/auth/whatsapp/verify', () => {
  it('creates a new onboarding-pending account and returns JWTs', async () => {
    const code = await requestCode();

    const res = await request(app)
      .post('/api/v1/auth/whatsapp/verify')
      .send({ phone: PHONE, code });

    expect(res.status).toBe(201);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    expect(res.body.data.user.onboardingComplete).toBe(false);

    const user = await prisma.user.findUnique({ where: { phone: PHONE } });
    expect(user).toBeTruthy();

    // OTP is single-use.
    const row = await prisma.phoneOtp.findFirst({ where: { phone: PHONE } });
    expect(row!.usedAt).not.toBeNull();
  });

  it('logs into the SAME account for an existing phone user', async () => {
    const { id } = await createTestUser();
    await prisma.user.update({ where: { id }, data: { phone: PHONE } });

    const code = await requestCode();
    const res = await request(app)
      .post('/api/v1/auth/whatsapp/verify')
      .send({ phone: PHONE, code });

    expect(res.status).toBe(201);
    expect(res.body.data.user.id).toBe(id);
  });

  it('rejects a wrong code, increments attempts, and locks after 5 tries', async () => {
    await requestCode();

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/v1/auth/whatsapp/verify')
        .send({ phone: PHONE, code: '000000' });
      expect(res.status).toBe(401);
    }

    const row = await prisma.phoneOtp.findFirst({ where: { phone: PHONE } });
    expect(row!.attempts).toBe(5);

    // 6th attempt is locked out (429), even with the right code.
    const locked = await request(app)
      .post('/api/v1/auth/whatsapp/verify')
      .send({ phone: PHONE, code: '000000' });
    expect(locked.status).toBe(429);
  });

  it('rejects an expired code', async () => {
    const code = await requestCode();
    await prisma.phoneOtp.updateMany({
      where: { phone: PHONE },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/v1/auth/whatsapp/verify')
      .send({ phone: PHONE, code });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/auth/whatsapp/bind', () => {
  it('binds a verified phone to the authenticated account', async () => {
    const { id } = await createTestUser();
    const token = mintJwt(id);
    const code = await requestCode();

    const res = await request(app)
      .patch('/api/v1/auth/whatsapp/bind')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: PHONE, code });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe(PHONE);

    const user = await prisma.user.findUnique({ where: { id } });
    expect(user!.phone).toBe(PHONE);
  });

  it('rejects binding a phone already owned by another account (409)', async () => {
    const other = await createTestUser();
    await prisma.user.update({ where: { id: other.id }, data: { phone: PHONE } });

    const { id } = await createTestUser();
    const token = mintJwt(id);
    const code = await requestCode();

    const res = await request(app)
      .patch('/api/v1/auth/whatsapp/bind')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: PHONE, code });

    expect(res.status).toBe(409);
  });

  it('requires authentication', async () => {
    const code = await requestCode();
    const res = await request(app)
      .patch('/api/v1/auth/whatsapp/bind')
      .send({ phone: PHONE, code });
    expect(res.status).toBe(401);
  });
});
