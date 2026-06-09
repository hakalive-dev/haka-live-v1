/**
 * Feature 8 — Wallet System
 * Tests: get balance, get transactions, exchange beans to coins
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    systemSetting: { findUnique: jest.fn() },
    wallet: {
      upsert: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    walletTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    withdrawalRequest: {
      findMany: jest.fn(),
    },
    giftTransaction: {
      findMany: jest.fn(),
    },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    accountRisk: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../../sockets', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
}));

jest.mock('../chat/haka-team-coins-notify.service', () => ({
  scheduleWalletCoinsNotify: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

const mockSystemSetting = prisma.systemSetting as unknown as { findUnique: jest.Mock };
const mockWallet = prisma.wallet as unknown as {
  upsert: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
};
const mockWalletTx = prisma.walletTransaction as unknown as {
  findMany: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
};
const mockWithdrawalRequest = prisma.withdrawalRequest as unknown as {
  findMany: jest.Mock;
};
const mockGiftTransaction = prisma.giftTransaction as unknown as {
  findMany: jest.Mock;
};
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_ID = 'user-uuid-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const walletFixture = {
  id: 'wallet-uuid-1',
  userId: USER_ID,
  coinBalance: 5000,
  beanBalance: 10000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/wallet', () => {
  it('returns wallet balance', async () => {
    mockWallet.upsert.mockResolvedValue(walletFixture);

    const res = await request(app)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.coinBalance).toBe(5000);
    expect(res.body.data.beanBalance).toBe(10000);
  });

  it('serializes Prisma BigInt balances as JSON numbers', async () => {
    mockWallet.upsert.mockResolvedValue({
      ...walletFixture,
      coinBalance: 5000n,
      beanBalance: 10_420_996n,
    });

    const res = await request(app)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.coinBalance).toBe(5000);
    expect(res.body.data.beanBalance).toBe(10_420_996);
    expect(typeof res.body.data.beanBalance).toBe('number');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/wallet');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/wallet/transactions', () => {
  it('returns paginated transactions', async () => {
    mockWallet.upsert.mockResolvedValue(walletFixture);
    mockWalletTx.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        walletId: 'wallet-uuid-1',
        transactionType: 'credit',
        currency: 'coins',
        amount: 1000,
        balanceAfter: 5000,
        reference: 'top_up',
        description: 'Test top-up',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockWalletTx.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/wallet/transactions')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].transactionType).toBe('credit');
    expect(res.body.data.total).toBe(1);
  });

  it('supports pagination params', async () => {
    mockWallet.upsert.mockResolvedValue(walletFixture);
    mockWalletTx.findMany.mockResolvedValue([]);
    mockWalletTx.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/wallet/transactions?page=2&limit=10')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.limit).toBe(10);
  });
});

describe('GET /api/v1/wallet/bean-records', () => {
  const createdAt = new Date('2026-05-10T12:00:00.000Z');

  beforeEach(() => {
    mockWallet.upsert.mockResolvedValue(walletFixture);
    mockWithdrawalRequest.findMany.mockResolvedValue([]);
    mockGiftTransaction.findMany.mockResolvedValue([]);
  });

  it('returns gift received, exchange, and withdrawal bean transactions', async () => {
    mockWalletTx.findMany.mockResolvedValue([
      {
        id: 'tx-gift',
        transactionType: 'credit',
        currency: 'beans',
        amount: 3500,
        balanceAfter: 18650,
        reference: 'gift_received',
        description: 'Received Rocket from Preeti',
        createdAt,
      },
      {
        id: 'tx-exchange',
        transactionType: 'debit',
        currency: 'beans',
        amount: 5000,
        balanceAfter: 14450,
        reference: 'exchange',
        description: 'Exchanged 5,000 beans to 2,500 coins',
        createdAt: new Date('2026-05-09T10:00:00.000Z'),
      },
      {
        id: 'tx-withdraw',
        transactionType: 'debit',
        currency: 'beans',
        amount: 50000,
        balanceAfter: 22000,
        reference: 'withdrawal_hold',
        description: 'Withdrawal hold: 50,000 beans',
        createdAt: new Date('2026-05-08T08:00:00.000Z'),
      },
    ]);
    mockWalletTx.count.mockResolvedValue(3);
    mockWithdrawalRequest.findMany.mockResolvedValue([
      {
        beansAmount: BigInt(50000),
        status: 'pending_review',
        createdAt: new Date('2026-05-08T08:00:00.000Z'),
      },
    ]);

    const res = await request(app)
      .get('/api/v1/wallet/bean-records')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.items[0]).toMatchObject({
      id: 'tx-gift',
      category: 'gift_received',
      transactionType: 'credit',
      amount: 3500,
    });
    expect(res.body.data.items[1]).toMatchObject({
      id: 'tx-exchange',
      category: 'exchange',
      transactionType: 'debit',
    });
    expect(res.body.data.items[2]).toMatchObject({
      id: 'tx-withdraw',
      category: 'withdrawal',
      withdrawalStatus: 'pending_review',
    });
    expect(mockWalletTx.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          currency: 'beans',
          reference: { in: expect.arrayContaining([
            'gift_received',
            'exchange',
            'withdrawal_hold',
            'withdrawal_agent_payout',
            'withdrawal_agent_commission',
          ]) },
        }),
      }),
    );
  });

  it('enriches gift_received rows with sender and gift metadata', async () => {
    const createdAt = new Date('2026-05-10T12:00:00.000Z');
    mockWalletTx.findMany.mockResolvedValue([
      {
        id: 'tx-gift',
        transactionType: 'credit',
        currency: 'beans',
        amount: 700,
        balanceAfter: 1000,
        reference: 'gift_received',
        description: 'Gift host share',
        createdAt,
      },
    ]);
    mockWalletTx.count.mockResolvedValue(1);
    mockGiftTransaction.findMany.mockResolvedValue([
      {
        id: 'gt-1',
        beanValue: 1000,
        qty: 1,
        createdAt,
        gift: { name: 'Crown 👑', icon: '👑', image: null },
        sender: {
          id: 'sender-1',
          displayName: 'SWEET❤️',
          username: 'sweet',
          avatar: 'https://example.com/a.jpg',
          hakaId: '539491650',
          activeSpecialId: null,
        },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/wallet/bean-records')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].gift_income).toMatchObject({
      gift_name: 'Crown 👑',
      gift_qty: 1,
      sender_display_name: 'SWEET❤️',
      sender_haka_id: '539491650',
    });
  });
});

describe('POST /api/v1/wallet/exchange', () => {
  it('exchanges beans to coins at 1:1 rate', async () => {
    const walletRow = { id: 'wallet-uuid-1', coinBalance: 5000n, beanBalance: 10000n };
    mockTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: walletRow.id, beanBalance: walletRow.beanBalance }])
          .mockResolvedValueOnce([{ id: walletRow.id, coinBalance: 5000n }]),
        wallet: {
          update: jest
            .fn()
            .mockResolvedValueOnce({ beanBalance: 8000 })
            .mockResolvedValueOnce({ coinBalance: 7000 }),
          create: jest.fn().mockResolvedValue({ id: walletRow.id, coinBalance: 7000 }),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/wallet/exchange')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ beans: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.data.beansSpent).toBe(2000);
    expect(res.body.data.coinsEarned).toBe(2000); // 1 bean = 1 coin
  });

  it('rejects zero or negative bean amounts', async () => {
    const res = await request(app)
      .post('/api/v1/wallet/exchange')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ beans: 0 });

    expect(res.status).toBe(400);
  });

  it('rejects negative amounts', async () => {
    const res = await request(app)
      .post('/api/v1/wallet/exchange')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ beans: -10 });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/wallet/topup', () => {
  it('returns 503 when direct user top-up is disabled', async () => {
    mockSystemSetting.findUnique.mockResolvedValue({ value: false });
    const res = await request(app)
      .post('/api/v1/wallet/topup')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ coins: 1000 });
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
