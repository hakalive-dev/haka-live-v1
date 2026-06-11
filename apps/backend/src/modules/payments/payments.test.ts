// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    coinPackage: {
      findMany: jest.fn(),
    },
    systemSetting: {
      findUnique: jest.fn(),
    },
    paymentTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    coinSellerTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    walletTransaction: {
      findFirst: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    // getPackages → currency ensureSeeded checks the rates table first
    currencyRate: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../wallet/wallet.service', () => ({
  creditCoins: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { creditCoins } from '../wallet/wallet.service';

const mockPrisma = prisma as unknown as {
  coinPackage: { findMany: jest.Mock };
  systemSetting: { findUnique: jest.Mock };
  paymentTransaction: { findMany: jest.Mock; count: jest.Mock };
  coinSellerTransaction: { findMany: jest.Mock; count: jest.Mock };
  walletTransaction: { findFirst: jest.Mock };
};
const mockCreditCoins = creditCoins as jest.Mock;

function mockDirectTopupEnabled(enabled: boolean) {
  mockPrisma.systemSetting.findUnique.mockImplementation(
    ({ where }: { where: { key: string } }) => {
      if (where.key === 'payments.direct_user_topup_enabled') {
        return Promise.resolve(enabled ? { value: true } : { value: false });
      }
      return Promise.resolve(null);
    },
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_ID = '00000000-0000-4000-8000-000000000001';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDirectTopupEnabled(true);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/payments/config', () => {
  it('returns direct_user_topup_enabled false when setting is false', async () => {
    mockDirectTopupEnabled(false);
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.direct_user_topup_enabled).toBe(false);
  });

  it('returns direct_user_topup_enabled true when setting is true', async () => {
    mockDirectTopupEnabled(true);
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.data.direct_user_topup_enabled).toBe(true);
  });

  it('defaults to false when setting is missing', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.data.direct_user_topup_enabled).toBe(false);
  });
});

describe('GET /api/v1/payments/packages', () => {
  it('returns active packages ordered by order field', async () => {
    const packages = [
      { id: 'pkg-1', coins: 100, bonusCoins: 0, priceGbp: '0.99', isActive: true, order: 1 },
      { id: 'pkg-2', coins: 500, bonusCoins: 50, priceGbp: '4.99', isActive: true, order: 2 },
    ];
    mockPrisma.coinPackage.findMany.mockResolvedValue(packages);

    const res = await request(app)
      .get('/api/v1/payments/packages')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('POST /api/v1/payments/free-topup', () => {
  it('credits 100 coins on first claim', async () => {
    mockPrisma.walletTransaction.findFirst.mockResolvedValue(null);
    mockCreditCoins.mockResolvedValue({ coinBalance: 100 });

    const res = await request(app)
      .post('/api/v1/payments/free-topup')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.coins).toBe(100);
    expect(res.body.data.newBalance).toBe(100);
    expect(mockCreditCoins).toHaveBeenCalledWith(
      USER_ID,
      100,
      `free_topup_${USER_ID}`,
      'Welcome gift: 100 free coins',
    );
  });

  it('returns 400 when already claimed', async () => {
    mockPrisma.walletTransaction.findFirst.mockResolvedValue({ id: 'tx-existing' });

    const res = await request(app)
      .post('/api/v1/payments/free-topup')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Free top-up already claimed');
    expect(mockCreditCoins).not.toHaveBeenCalled();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/payments/free-topup');
    expect(res.status).toBe(401);
  });

  it('returns 503 when direct user top-up is disabled', async () => {
    mockDirectTopupEnabled(false);
    const res = await request(app)
      .post('/api/v1/payments/free-topup')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(503);
    expect(mockCreditCoins).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/payments/history', () => {
  beforeEach(() => {
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([]);
    mockPrisma.paymentTransaction.count.mockResolvedValue(0);
    mockPrisma.coinSellerTransaction.findMany.mockResolvedValue([]);
    mockPrisma.coinSellerTransaction.count.mockResolvedValue(0);
    mockPrisma.walletTransaction.findFirst.mockResolvedValue(null);
  });

  it('includes coin-seller transfer purchases for the user', async () => {
    const createdAt = new Date('2026-05-10T12:00:00.000Z');
    mockPrisma.coinSellerTransaction.findMany.mockResolvedValue([
      {
        id: 'cst-1',
        coinsAmount: BigInt(50_000),
        createdAt,
        seller: {
          displayName: 'Priya Seller',
          username: 'priya',
          hakaId: '500000020',
          activeSpecialId: null,
        },
      },
    ]);
    mockPrisma.coinSellerTransaction.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      id: 'cst-1',
      method: 'coin_seller',
      type: 'coin_seller_purchase',
      status: 'succeeded',
      coins_credited: true,
      package_name: '50,000 Coins from Priya Seller',
      amount_usd: 5,
    });
    expect(res.body.data.total).toBe(1);
  });

  it('returns non-empty history when user has only coin-seller purchases', async () => {
    mockPrisma.coinSellerTransaction.findMany.mockResolvedValue([
      {
        id: 'cst-only',
        coinsAmount: BigInt(10_000),
        createdAt: new Date('2026-05-01T08:00:00.000Z'),
        seller: {
          displayName: '',
          username: 'seller1',
          hakaId: '111',
          activeSpecialId: null,
        },
      },
    ]);
    mockPrisma.coinSellerTransaction.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0].type).toBe('coin_seller_purchase');
    expect(mockPrisma.paymentTransaction.findMany).toHaveBeenCalled();
  });

  it('merges gateway purchases, free top-up, and seller transfers sorted by date', async () => {
    mockPrisma.paymentTransaction.findMany.mockResolvedValue([
      {
        id: 'pt-1',
        method: 'upi',
        amountGbp: '0.99',
        coinsCredited: true,
        status: 'succeeded',
        createdAt: new Date('2026-05-05T10:00:00.000Z'),
        package: { coins: 10_000, bonusCoins: 0 },
      },
    ]);
    mockPrisma.paymentTransaction.count.mockResolvedValue(1);
    mockPrisma.walletTransaction.findFirst.mockResolvedValue({
      id: 'wt-free',
      createdAt: new Date('2026-05-01T08:00:00.000Z'),
    });
    mockPrisma.coinSellerTransaction.findMany.mockResolvedValue([
      {
        id: 'cst-new',
        coinsAmount: BigInt(20_000),
        createdAt: new Date('2026-05-15T14:00:00.000Z'),
        seller: {
          displayName: 'Seller',
          username: 's',
          hakaId: '222',
          activeSpecialId: null,
        },
      },
    ]);
    mockPrisma.coinSellerTransaction.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.items[0].id).toBe('cst-new');
    expect(res.body.data.items[1].id).toBe('pt-1');
    expect(res.body.data.items[2].id).toBe('wt-free');
    expect(res.body.data.total).toBe(3);
  });
});
