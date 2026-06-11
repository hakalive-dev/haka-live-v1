import { prisma } from '../config/prisma';
import { requestWithdrawal } from '../modules/wallet/wallet.service';
import { resetDb, createTestUser } from './db-helpers';

beforeEach(async () => {
  await resetDb();
  // Seed India currency rate
  await prisma.currencyRate.upsert({
    where: { countryCode: 'IN' },
    create: {
      countryCode: 'IN',
      countryName: 'India',
      currency: 'INR',
      symbol: '₹',
      usdRate: 83,
      minWithdrawalBeans: 10000,
      isActive: true,
      source: 'manual',
    },
    update: { isActive: true, minWithdrawalBeans: 10000 },
  });
});

async function seedPaymentMethod(userId: string) {
  return prisma.userPaymentMethod.create({
    data: {
      userId,
      methodType: 'upi',
      countryCode: 'IN',
      provider: 'upi',
      accountLabel: 'Test',
      maskedAccount: 'test@upi',
    },
  });
}

it('blocks withdrawal when daily count limit is reached', async () => {
  const user = await createTestUser({ beanBalance: 500_000 });
  const method = await seedPaymentMethod(user.id);

  await prisma.systemSetting.upsert({
    where: { key: 'withdrawal_daily_count' },
    create: { key: 'withdrawal_daily_count', value: 2 },
    update: { value: 2 },
  });

  // First two succeed (amounts must clear the global WITHDRAWAL_MIN_BEANS floor)
  await requestWithdrawal(user.id, 100_000, '', 'IN', method.id, '1.2.3.4');
  await requestWithdrawal(user.id, 100_000, '', 'IN', method.id, '1.2.3.4');
  // Third is blocked
  await expect(
    requestWithdrawal(user.id, 100_000, '', 'IN', method.id, '1.2.3.4'),
  ).rejects.toThrow(/Daily withdrawal count limit reached/i);
});

it('sets ipRiskFlagged when IP threshold is exceeded', async () => {
  const ip = '9.9.9.9';
  await prisma.systemSetting.upsert({
    where: { key: 'withdrawal_ip_max_per_day' },
    create: { key: 'withdrawal_ip_max_per_day', value: 2 },
    update: { value: 2 },
  });

  // Create 2 prior requests from same IP by different users
  for (let i = 0; i < 2; i++) {
    const u = await createTestUser({ beanBalance: 200_000 });
    const m = await seedPaymentMethod(u.id);
    await requestWithdrawal(u.id, 100_000, '', 'IN', m.id, ip);
  }

  // Third user from same IP — should be flagged
  const user3 = await createTestUser({ beanBalance: 200_000 });
  const m3 = await seedPaymentMethod(user3.id);
  const req = await requestWithdrawal(user3.id, 100_000, '', 'IN', m3.id, ip);
  expect(req.ipRiskFlagged).toBe(true);
});
