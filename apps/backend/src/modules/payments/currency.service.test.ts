import { prisma } from '../../config/prisma';
import { resetDb } from '../../tests/db-helpers';
import * as currencyService from './currency.service';
import * as paymentsService from './payments.service';
import * as walletService from '../wallet/wallet.service';

describe('currency.service', () => {
  beforeEach(async () => {
    await resetDb();
    await currencyService.ensureSeeded();
  });

  it('listWithdrawalCurrencies returns exactly 13 active countries', async () => {
    const rows = await currencyService.listWithdrawalCurrencies();
    expect(rows).toHaveLength(13);
    const codes = rows.map((r) => r.countryCode).sort();
    expect(codes).toEqual(
      ['BD', 'ET', 'GH', 'IN', 'IT', 'KE', 'NG', 'NP', 'PH', 'PK', 'US', 'VN', 'ZA'].sort(),
    );
  });

  it('serialize includes minWithdrawalBeans and beansToCurrencyRate', async () => {
    const rows = await currencyService.listActive();
    expect(rows.length).toBeGreaterThan(0);
    const us = rows.find((r) => r.countryCode === 'US');
    expect(us).toBeDefined();
    expect(us!.minWithdrawalBeans).toBe(10000);
    expect(us!.beansToCurrencyRate).toBe(us!.usdRate);
  });

  it('India has 92 INR per USD and 100,000 bean minimum', async () => {
    await prisma.currencyRate.upsert({
      where: { countryCode: 'IN' },
      update: {
        usdRate: 92,
        minWithdrawalBeans: 100_000,
        isActive: true,
        currency: 'INR',
        symbol: '₹',
        countryName: 'India',
        source: 'manual',
      },
      create: {
        countryCode: 'IN',
        countryName: 'India',
        currency: 'INR',
        symbol: '₹',
        usdRate: 92,
        minWithdrawalBeans: 100_000,
        isActive: true,
        source: 'manual',
      },
    });

    const inRow = (await currencyService.listWithdrawalCurrencies()).find(
      (r) => r.countryCode === 'IN',
    );
    expect(inRow).toBeDefined();
    expect(inRow!.usdRate).toBe(92);
    expect(inRow!.minWithdrawalBeans).toBe(100_000);
    expect(inRow!.beansToCurrencyRate).toBe(92);
  });

  async function createTestPaymentMethod(userId: string, countryCode: string) {
    return prisma.userPaymentMethod.create({
      data: {
        userId,
        methodType: 'upi',
        countryCode,
        provider: countryCode === 'IN' ? 'upi' : 'gcash',
        maskedAccount: '****1234',
        accountLabel: 'Test User',
      },
    });
  }

  it('requestWithdrawal enforces India minimum and payout rate', async () => {
    const { createTestUser } = await import('../../tests/db-helpers');
    const user = await createTestUser({ beanBalance: 200_000 });
    const pm = await createTestPaymentMethod(user.id, 'IN');
    await prisma.currencyRate.upsert({
      where: { countryCode: 'IN' },
      update: {
        isActive: true,
        minWithdrawalBeans: 100_000,
        usdRate: 92,
        currency: 'INR',
        symbol: '₹',
        countryName: 'India',
        source: 'manual',
      },
      create: {
        countryCode: 'IN',
        countryName: 'India',
        currency: 'INR',
        symbol: '₹',
        usdRate: 92,
        minWithdrawalBeans: 100_000,
        isActive: true,
        source: 'manual',
      },
    });

    await expect(
      walletService.requestWithdrawal(user.id, 99_999, 'test', 'IN', pm.id, ''),
    ).rejects.toThrow(/Minimum withdrawal is 100,000 beans/i);

    const req = await walletService.requestWithdrawal(user.id, 100_000, 'test', 'IN', pm.id, '');
    expect(req.countryCode).toBe('IN');
    expect(req.currency).toBe('INR');
    expect(Number(req.localAmount)).toBeCloseTo(920, 0);
    expect(Number(req.usdRateAtRequest)).toBe(92);
  });

  it('getPackages uses DB rate for INR', async () => {
    await prisma.currencyRate.upsert({
      where: { countryCode: 'IN' },
      update: { usdRate: 90, isActive: true, currency: 'INR', symbol: '₹', countryName: 'India' },
      create: {
        countryCode: 'IN',
        countryName: 'India',
        currency: 'INR',
        symbol: '₹',
        usdRate: 90,
        isActive: true,
        source: 'manual',
      },
    });

    await prisma.coinPackage.create({
      data: { coins: 10000, bonusCoins: 0, priceGbp: 1, isActive: true, order: 1 },
    });

    const pkgs = await paymentsService.getPackages('INR');
    const inrPkgs = pkgs.filter((p) => p.currencyCode === 'INR');
    expect(inrPkgs.length).toBeGreaterThanOrEqual(1);
    expect(inrPkgs[0].currencyCode).toBe('INR');
    expect(inrPkgs[0].priceLocal).toBe(90);
    expect(inrPkgs[0].priceUsd).toBe(1);
  });

  it('requestWithdrawal stores currency snapshot', async () => {
    const { createTestUser, mintJwt } = await import('../../tests/db-helpers');
    const user = await createTestUser({ beanBalance: 50_000 });
    await prisma.currencyRate.upsert({
      where: { countryCode: 'PH' },
      update: {
        isActive: true,
        minWithdrawalBeans: 10000,
        usdRate: 56,
        currency: 'PHP',
        symbol: '₱',
        countryName: 'Philippines',
      },
      create: {
        countryCode: 'PH',
        countryName: 'Philippines',
        currency: 'PHP',
        symbol: '₱',
        usdRate: 56,
        minWithdrawalBeans: 10000,
        isActive: true,
        source: 'manual',
      },
    });

    const pm = await createTestPaymentMethod(user.id, 'PH');
    const req = await walletService.requestWithdrawal(user.id, 20_000, 'test', 'PH', pm.id, '');
    expect(req.countryCode).toBe('PH');
    expect(req.currency).toBe('PHP');
    expect(Number(req.localAmount)).toBeCloseTo(112, 0);
    expect(Number(req.usdRateAtRequest)).toBe(56);
  });

  it('requestWithdrawal rejects inactive country', async () => {
    const { createTestUser } = await import('../../tests/db-helpers');
    const user = await createTestUser({ beanBalance: 50_000 });
    await prisma.currencyRate.upsert({
      where: { countryCode: 'XX' },
      update: { isActive: false },
      create: {
        countryCode: 'XX',
        countryName: 'Testland',
        currency: 'XXX',
        symbol: 'X',
        usdRate: 1,
        isActive: false,
        source: 'manual',
      },
    });

    const pm = await createTestPaymentMethod(user.id, 'XX');
    await expect(
      walletService.requestWithdrawal(user.id, 20_000, '', 'XX', pm.id, ''),
    ).rejects.toThrow(/not available/i);
  });
});

describe('currency.service bulkImportFromPublicApi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates rows from mocked APIs', async () => {
    await resetDb();
    global.fetch = jest.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes('open.er-api.com')) {
        return {
          ok: true,
          json: async () => ({ rates: { USD: 1, EUR: 0.92, GBP: 0.78 } }),
        } as Response;
      }
      if (u.includes('restcountries.com')) {
        return {
          ok: true,
          json: async () => [
            { cca2: 'US', name: { common: 'United States' }, currencies: { USD: { symbol: '$' } } },
            { cca2: 'GB', name: { common: 'United Kingdom' }, currencies: { GBP: { symbol: '£' } } },
          ],
        } as Response;
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as typeof fetch;

    const result = await currencyService.bulkImportFromPublicApi();
    expect(result.created + result.updated).toBeGreaterThan(0);

    const us = await prisma.currencyRate.findUnique({ where: { countryCode: 'US' } });
    expect(us).not.toBeNull();
    expect(us!.currency).toBe('USD');
  });
});
