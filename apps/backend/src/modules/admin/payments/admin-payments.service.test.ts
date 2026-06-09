jest.mock('../../../config/prisma', () => {
  const prisma = {
    paymentTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
  };
  return { prisma };
});

import { prisma } from '../../../config/prisma';
import {
  exportPaymentTransactionsCsv,
  listPaymentTransactions,
  paymentTransactionsSummary,
} from './admin-payments.service';

const paymentTransaction = prisma.paymentTransaction as any;

describe('admin payment transactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filters coin purchase history by packageId', async () => {
    paymentTransaction.findMany.mockResolvedValueOnce([]);
    paymentTransaction.count.mockResolvedValueOnce(0);

    await listPaymentTransactions({
      page: 1,
      limit: 20,
      packageId: 'pkg-1',
    } as any);

    expect(paymentTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ packageId: 'pkg-1' }),
    }));
  });

  it('summarizes purchases using the same filter shape', async () => {
    paymentTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amountGbp: { toString: () => '25.50' } } });
    paymentTransaction.groupBy
      .mockResolvedValueOnce([{ status: 'succeeded', _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ method: 'card', _count: { _all: 2 } }]);
    paymentTransaction.findMany.mockResolvedValueOnce([
      { package: { coins: 100, bonusCoins: 10 } },
      { package: { coins: 200, bonusCoins: 0 } },
    ]);

    const summary = await paymentTransactionsSummary({ packageId: 'pkg-1' } as any);

    expect(paymentTransaction.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ packageId: 'pkg-1', status: 'succeeded' }),
    }));
    expect(summary.succeededCount).toBe(2);
    expect(summary.totalAmountGbp).toBe('25.50');
  });

  it('exports purchase rows as csv', async () => {
    paymentTransaction.findMany.mockResolvedValueOnce([{
      user: { hakaId: '1001', displayName: 'A User' },
      package: { id: 'pkg-1', coins: 100, bonusCoins: 10 },
      amountGbp: { toString: () => '4.99' },
      method: 'card',
      status: 'succeeded',
      coinsCredited: true,
      stripePaymentIntentId: 'pi_123',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }]);

    const csv = await exportPaymentTransactionsCsv({ page: 1, limit: 10000 } as any);

    expect(csv).toContain('userHakaId,userName,coins,bonusCoins,packageId,amountGbp,method,status,coinsCredited,paymentIntent,createdAt');
    expect(csv).toContain('1001,A User,100,10,pkg-1,4.99,card,succeeded,true,pi_123,2026-01-01T00:00:00.000Z');
  });
});
