/**
 * Activity module tests
 * Tests: GET /activity, GET /activity/income, GET /activity/chart
 *
 * Prisma is mocked — no real database needed.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    wallet: {
      findUnique: jest.fn(),
    },
    walletTransaction: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    giftTransaction: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    roomSeat: {
      count: jest.fn().mockResolvedValue(0),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_ID = 'user-activity-1';
const WALLET_ID = 'wallet-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockWallet = prisma.wallet as unknown as { findUnique: jest.Mock };
const mockWalletTx = prisma.walletTransaction as unknown as { aggregate: jest.Mock };
const mockGiftTx = prisma.giftTransaction as unknown as { count: jest.Mock; findMany: jest.Mock };
const mockRoomSeat = prisma.roomSeat as unknown as { count: jest.Mock };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/activity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/activity');
    expect(res.status).toBe(401);
  });

  it('returns activity stats for default period (weekly)', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 500 } });
    mockGiftTx.count.mockResolvedValue(10);
    mockRoomSeat.count.mockResolvedValue(3);

    const res = await request(app)
      .get('/api/v1/activity')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('period');
    expect(res.body.data).toHaveProperty('coinsSpent');
    expect(res.body.data).toHaveProperty('beansEarned');
    expect(res.body.data).toHaveProperty('giftsSentCount');
    expect(res.body.data).toHaveProperty('giftsReceivedCount');
    expect(res.body.data).toHaveProperty('roomSessionsCount');
    expect(res.body.data.period).toBe('weekly');
  });

  it('accepts period=daily', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
    mockGiftTx.count.mockResolvedValue(2);
    mockRoomSeat.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/activity?period=daily')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe('daily');
  });

  it('accepts period=monthly', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockGiftTx.count.mockResolvedValue(0);
    mockRoomSeat.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/activity?period=monthly')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe('monthly');
  });

  it('returns zeros when user has no wallet', async () => {
    mockWallet.findUnique.mockResolvedValue(null);
    mockGiftTx.count.mockResolvedValue(0);
    mockRoomSeat.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/activity')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.coinsSpent).toBe(0);
    expect(res.body.data.beansEarned).toBe(0);
  });

  it('rejects invalid period', async () => {
    const res = await request(app)
      .get('/api/v1/activity?period=yearly')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/activity/income', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/activity/income');
    expect(res.status).toBe(401);
  });

  it('returns income stats', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 1200 } });
    mockGiftTx.count.mockResolvedValue(8);
    mockGiftTx.findMany.mockResolvedValue([
      {
        senderId: 'gifter-1',
        coinCost: 300,
        sender: { id: 'gifter-1', displayName: 'Charlie', avatar: '' },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/activity/income')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalBeansEarned');
    expect(res.body.data).toHaveProperty('giftsReceivedCount');
    expect(res.body.data).toHaveProperty('topGifters');
    expect(Array.isArray(res.body.data.topGifters)).toBe(true);
  });

  it('returns empty topGifters when no gifts received', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockGiftTx.count.mockResolvedValue(0);
    mockGiftTx.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/activity/income')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.topGifters).toHaveLength(0);
  });
});

describe('GET /api/v1/activity/chart', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/activity/chart');
    expect(res.status).toBe(401);
  });

  it('returns chart data with correct number of days (weekly)', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const res = await request(app)
      .get('/api/v1/activity/chart?period=weekly')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('period');
    expect(res.body.data).toHaveProperty('days');
    expect(res.body.data).toHaveProperty('data');
    expect(res.body.data.days).toBe(7);
    expect(Array.isArray(res.body.data.data)).toBe(true);
    expect(res.body.data.data).toHaveLength(7);
  });

  it('returns 30 data points for monthly period', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const res = await request(app)
      .get('/api/v1/activity/chart?period=monthly')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(30);
    expect(res.body.data.data).toHaveLength(30);
  });

  it('each chart data point has date, coinsSpent, and beansEarned', async () => {
    mockWallet.findUnique.mockResolvedValue({ id: WALLET_ID });
    mockWalletTx.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const res = await request(app)
      .get('/api/v1/activity/chart?period=daily')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.data[0]).toHaveProperty('date');
    expect(res.body.data.data[0]).toHaveProperty('coinsSpent');
    expect(res.body.data.data[0]).toHaveProperty('beansEarned');
  });
});
