import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import {
  resolveSellerTierRates,
  syncCoinSellerProfileRatesFromTier,
} from './coinSeller.service';
import { resetDb, createTestUser } from '../../tests/db-helpers';

describe('resolveSellerTierRates', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.coinSellerLevelRule.deleteMany({});
  });

  it('uses tier rates when profile stored rates are zero', async () => {
    const user = await createTestUser({ role: 'agent' });
    await prisma.coinSellerLevelRule.create({
      data: {
        levelName: `unit_${user.id.slice(0, 8)}`,
        minRollingCoins: 0,
        totalCommissionRate: 0.04,
        giftCommissionRate: 0.06,
        incomeRewardRate: 0.02,
        giftBonusRate: 0.03,
        sortOrder: 0,
      },
    });

    const rates = await resolveSellerTierRates(
      {
        totalCommissionRate: { toNumber: () => 0 },
        giftCommissionRate: { toNumber: () => 0 },
        incomeRewardRate: { toNumber: () => 0 },
        giftBonusRate: { toNumber: () => 0 },
      },
      user.id,
    );

    expect(parseFloat(rates.totalCommissionRate)).toBeCloseTo(0.04);
    expect(parseFloat(rates.giftCommissionRate)).toBeCloseTo(0.06);
    expect(parseFloat(rates.incomeRewardRate)).toBeCloseTo(0.02);
    expect(parseFloat(rates.giftBonusRate)).toBeCloseTo(0.03);
  });

  it('non-zero profile rate overrides tier value', async () => {
    const user = await createTestUser({ role: 'agent' });
    await prisma.coinSellerLevelRule.create({
      data: {
        levelName: `unit_ov_${randomUUID().slice(0, 8)}`,
        minRollingCoins: 0,
        giftCommissionRate: 0.1,
        sortOrder: 0,
      },
    });

    const rates = await resolveSellerTierRates(
      {
        totalCommissionRate: { toNumber: () => 0 },
        giftCommissionRate: { toNumber: () => 0.05 },
        incomeRewardRate: { toNumber: () => 0 },
        giftBonusRate: { toNumber: () => 0 },
      },
      user.id,
    );

    expect(parseFloat(rates.giftCommissionRate)).toBeCloseTo(0.05);
  });

  it('sync writes tier rates onto profile when stored fields are zero', async () => {
    const user = await createTestUser({ role: 'agent' });
    await prisma.coinSellerProfile.create({ data: { userId: user.id } });
    await prisma.coinSellerLevelRule.create({
      data: {
        levelName: `sync_${user.id.slice(0, 8)}`,
        minRollingCoins: 0,
        totalCommissionRate: 0.04,
        giftCommissionRate: 0.06,
        incomeRewardRate: 0.02,
        giftBonusRate: 0.03,
        sortOrder: 0,
      },
    });

    const { updated } = await syncCoinSellerProfileRatesFromTier(user.id);
    expect(updated).toBe(true);

    const profile = await prisma.coinSellerProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(profile.giftCommissionRate.toNumber()).toBeCloseTo(0.06);
    expect(profile.sellerLevel).toBe(`sync_${user.id.slice(0, 8)}`);
  });
});
