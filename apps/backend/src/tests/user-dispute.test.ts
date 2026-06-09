import { prisma } from '../config/prisma';
import { userDisputeWithdrawal, getBeanRecords } from '../modules/wallet/wallet.service';
import { randomWithdrawalOrderId } from '../utils/withdrawal-order-id';
import { resetDb, createTestUser } from './db-helpers';

beforeEach(resetDb);

async function createCompletedWithdrawal(userId: string) {
  const method = await prisma.userPaymentMethod.create({
    data: {
      userId,
      methodType: 'upi',
      countryCode: 'IN',
      provider: 'upi',
      accountLabel: 'T',
      maskedAccount: 'x@upi',
    },
  });
  return prisma.withdrawalRequest.create({
    data: {
      orderId: randomWithdrawalOrderId(),
      userId,
      beansAmount: 15000,
      status: 'completed',
      countryCode: 'IN',
      currency: 'INR',
      paymentMethodId: method.id,
      payoutSnapshot: '{}',
    },
  });
}

it('userDisputeWithdrawal sets status to disputed', async () => {
  const user = await createTestUser();
  const wr = await createCompletedWithdrawal(user.id);

  await userDisputeWithdrawal(user.id, wr.id, 'I never received the payment');

  const updated = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
  expect(updated!.status).toBe('disputed');
  expect(updated!.disputedByUserId).toBe(user.id);
  expect(updated!.disputeReason).toBe('I never received the payment');
});

it('userDisputeWithdrawal rejects if withdrawal is not completed', async () => {
  const user = await createTestUser();
  const method = await prisma.userPaymentMethod.create({
    data: {
      userId: user.id,
      methodType: 'upi',
      countryCode: 'IN',
      provider: 'upi',
      accountLabel: 'T',
      maskedAccount: 'x@upi',
    },
  });
  const wr = await prisma.withdrawalRequest.create({
    data: {
      orderId: randomWithdrawalOrderId(),
      userId: user.id,
      beansAmount: 15000,
      status: 'assigned',
      countryCode: 'IN',
      currency: 'INR',
      paymentMethodId: method.id,
      payoutSnapshot: '{}',
    },
  });
  await expect(
    userDisputeWithdrawal(user.id, wr.id, 'reason'),
  ).rejects.toThrow(/can only dispute completed/i);
});

it('getBeanRecords includes withdrawalId for withdrawal transactions', async () => {
  const user = await createTestUser();
  const wr = await createCompletedWithdrawal(user.id);

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  // Insert a wallet transaction simulating the withdrawal hold
  await prisma.walletTransaction.create({
    data: {
      walletId: wallet!.id,
      transactionType: 'debit',
      currency: 'beans',
      amount: 15000,
      balanceAfter: 0,
      reference: 'withdrawal_hold',
      description: 'test hold',
      createdAt: wr.createdAt,
    },
  });

  const records = await getBeanRecords(user.id, 1, 10);
  const withdrawalRecord = records.items.find((r) => r.reference === 'withdrawal_hold');
  expect(withdrawalRecord).toBeDefined();
  expect(withdrawalRecord!.withdrawalId).toBe(wr.id);
  expect(withdrawalRecord!.orderId).toBe(wr.orderId);
});
