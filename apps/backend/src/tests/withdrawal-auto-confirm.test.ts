import { prisma } from '../config/prisma';
import { confirmWithdrawalReceipt, runWithdrawalAutoConfirm } from '../modules/wallet/wallet.service';
import { createTestUser } from './db-helpers';

describe('withdrawal receipt confirm', () => {
  it('confirmWithdrawalReceipt sets userConfirmedAt for proof_submitted', async () => {
    const user = await createTestUser();
    const wr = await prisma.withdrawalRequest.create({
      data: {
        userId: user.id,
        orderId: '9999999999999999991',
        beansAmount: 10000,
        status: 'proof_submitted',
        countryCode: 'IN',
        currency: 'INR',
        proofUploadedAt: new Date(),
        userConfirmAutoAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    const updated = await confirmWithdrawalReceipt(user.id, wr.id);
    expect(updated.userConfirmedAt).not.toBeNull();
  });

  it('runWithdrawalAutoConfirm auto-sets userConfirmedAt after deadline', async () => {
    const user = await createTestUser();
    await prisma.withdrawalRequest.create({
      data: {
        userId: user.id,
        orderId: '9999999999999999992',
        beansAmount: 10000,
        status: 'proof_submitted',
        countryCode: 'IN',
        currency: 'INR',
        proofUploadedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        userConfirmAutoAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const n = await runWithdrawalAutoConfirm();
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
