jest.mock('../../../config/firebase', () => ({
  firebaseAdmin: { auth: () => ({ verifyIdToken: jest.fn() }) },
}));

jest.mock('../../../config/prisma', () => ({
  prisma: {
    coinPackage: { findFirst: jest.fn() },
    systemSetting: { findUnique: jest.fn() },
    paymentTransaction: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    wallet: { upsert: jest.fn(), update: jest.fn(), create: jest.fn() },
    walletTransaction: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), createMany: jest.fn() },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    accountRisk: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../../../sockets', () => ({
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

jest.mock('razorpay');

jest.mock('../../chat/haka-team-coins-notify.service', () => ({
  scheduleWalletCoinsNotify: jest.fn(),
}));

import crypto from 'crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import Razorpay from 'razorpay';
import { scheduleWalletCoinsNotify } from '../../chat/haka-team-coins-notify.service';

const mockPkg = prisma.coinPackage as unknown as { findFirst: jest.Mock };
const mockSystemSetting = prisma.systemSetting as unknown as { findUnique: jest.Mock };

function mockDirectTopupEnabled(enabled: boolean) {
  mockSystemSetting.findUnique.mockImplementation(
    ({ where }: { where: { key: string } }) => {
      if (where.key === 'payments.direct_user_topup_enabled') {
        return Promise.resolve(enabled ? { value: true } : { value: false });
      }
      return Promise.resolve(null);
    },
  );
}
const mockPT = prisma.paymentTransaction as unknown as {
  create: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
};
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_ID = 'user-uuid-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const packageFixture = {
  id: 'pkg-uuid-1',
  coins: 10_000,
  bonusCoins: 0,
  priceGbp: 1,
  isActive: true,
  order: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDirectTopupEnabled(true);
});

// ── createOrder tests ────────────────────────────────────────────────────────

describe('POST /api/v1/payments/razorpay/create-order', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/payments/razorpay/create-order')
      .send({ packageId: 'pkg-uuid-1' });
    expect(res.status).toBe(401);
  });

  it('returns 503 when direct user top-up is disabled', async () => {
    mockDirectTopupEnabled(false);
    const res = await request(app)
      .post('/api/v1/payments/razorpay/create-order')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ packageId: 'pkg-uuid-1' });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for unknown package', async () => {
    mockPkg.findFirst.mockResolvedValue(null);
    (Razorpay as unknown as jest.Mock).mockImplementation(() => ({
      orders: { create: jest.fn() },
    }));
    const res = await request(app)
      .post('/api/v1/payments/razorpay/create-order')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ packageId: 'bad-id' });
    expect(res.status).toBe(404);
  });

  it('creates Razorpay order and PaymentTransaction, returns order details', async () => {
    mockPkg.findFirst.mockResolvedValue(packageFixture);
    const mockCreate = jest.fn().mockResolvedValue({ id: 'order_test123' });
    (Razorpay as unknown as jest.Mock).mockImplementation(() => ({
      orders: { create: mockCreate },
    }));
    mockPT.create.mockResolvedValue({ id: 'pt-uuid-1' });

    const res = await request(app)
      .post('/api/v1/payments/razorpay/create-order')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ packageId: 'pkg-uuid-1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      orderId: 'order_test123',
      amountPaise: expect.any(Number),
      coins: 10_000,
      bonusCoins: 0,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'INR', amount: expect.any(Number) }),
    );
  });
});

// ── webhook tests ────────────────────────────────────────────────────────────

describe('POST /api/v1/payments/razorpay/webhook', () => {
  // Must match RAZORPAY_WEBHOOK_SECRET set in src/tests/setup.ts
  const WEBHOOK_SECRET = 'test_webhook_secret';

  function makeWebhookPayload(orderId: string, paymentId: string) {
    return {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: paymentId, order_id: orderId, status: 'captured' },
        },
      },
    };
  }

  function sign(body: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  it('returns 400 with invalid signature', async () => {
    const body = JSON.stringify(makeWebhookPayload('order_123', 'pay_123'));
    const res = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'bad-signature')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('credits coins on payment.captured with valid signature', async () => {
    const pendingPT = {
      id: 'pt-uuid-1',
      userId: USER_ID,
      packageId: 'pkg-uuid-1',
      coinsCredited: false,
      package: packageFixture,
    };

    mockPT.findUnique.mockResolvedValue(pendingPT);
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        paymentTransaction: { update: jest.fn() },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'wallet-1', coinBalance: 0 }]),
        wallet: {
          update: jest.fn().mockResolvedValue({ coinBalance: 10000 }),
          create: jest.fn().mockResolvedValue({ id: 'wallet-1', coinBalance: 10000 }),
        },
        walletTransaction: { create: jest.fn() },
      }),
    );

    const body = JSON.stringify(makeWebhookPayload('order_abc', 'pay_xyz'));
    const sig = sign(body, WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    expect(scheduleWalletCoinsNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        reference: 'top_up',
        coinsAmount: 10000,
      }),
    );
  });

  it('is idempotent — does not credit twice', async () => {
    const alreadyCreditedPT = {
      id: 'pt-uuid-1',
      userId: USER_ID,
      packageId: 'pkg-uuid-1',
      coinsCredited: true,
      package: packageFixture,
    };

    mockPT.findUnique.mockResolvedValue(alreadyCreditedPT);

    const body = JSON.stringify(makeWebhookPayload('order_abc', 'pay_xyz'));
    const sig = sign(body, WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
