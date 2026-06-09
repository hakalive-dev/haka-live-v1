import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import {
  isWithdrawalCountry,
  WITHDRAWAL_COUNTRY_CODES,
  WITHDRAWAL_COUNTRY_META,
} from '../../shared-types/withdrawal-payout-methods';
import { CURRENCY_SYMBOLS, LAUNCH_COUNTRY_CODES, symbolForCurrency } from './currency-symbols';

const FX_API_URL = 'https://open.er-api.com/v6/latest/USD';
const REST_COUNTRIES_URL =
  'https://restcountries.com/v3.1/all?fields=cca2,name,currencies';

const WITHDRAWAL_DEFAULTS = WITHDRAWAL_COUNTRY_META.map((m) => ({
  ...m,
  isActive: true,
}));

type FxResponse = { rates: Record<string, number> };

type RestCountry = {
  cca2: string;
  name: { common: string };
  currencies?: Record<string, { name: string; symbol?: string }>;
};

async function fetchFxRates(): Promise<Record<string, number>> {
  const res = await fetch(FX_API_URL);
  if (!res.ok) throw new AppError(`FX API failed: ${res.status}`, 502);
  const data = (await res.json()) as FxResponse;
  return data.rates ?? {};
}

async function fetchRestCountries(): Promise<RestCountry[]> {
  const res = await fetch(REST_COUNTRIES_URL);
  if (!res.ok) throw new AppError(`Countries API failed: ${res.status}`, 502);
  return (await res.json()) as RestCountry[];
}

export async function ensureSeeded() {
  const count = await prisma.currencyRate.count();
  if (count > 0) return;
  await prisma.currencyRate.createMany({
    data: WITHDRAWAL_DEFAULTS.map((d) => ({
      countryCode: d.countryCode,
      countryName: d.countryName,
      currency: d.currency,
      symbol: d.symbol,
      usdRate: d.usdRate,
      isActive: d.isActive,
      source: 'manual',
      minWithdrawalBeans: d.minWithdrawalBeans ?? 10_000,
    })),
  });
}

/** Public list — active only. */
export async function listActive() {
  const rows = await prisma.currencyRate.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { countryName: 'asc' }],
  });
  return rows.map(serialize);
}

/** Active list for withdrawal picker — only the 13 configured countries. */
export async function listWithdrawalCurrencies() {
  await ensureSeeded();
  const rows = await prisma.currencyRate.findMany({
    where: {
      isActive: true,
      countryCode: { in: [...WITHDRAWAL_COUNTRY_CODES] },
    },
    orderBy: [{ displayOrder: 'asc' }, { countryName: 'asc' }],
  });
  return rows.map(serialize);
}

/** Admin list — all rows. */
export async function listAll() {
  const rows = await prisma.currencyRate.findMany({
    orderBy: [{ displayOrder: 'asc' }, { countryName: 'asc' }],
  });
  return rows.map(serialize);
}

export async function getByCountryCode(countryCode: string) {
  const row = await prisma.currencyRate.findUnique({
    where: { countryCode: countryCode.toUpperCase() },
  });
  if (!row) throw new AppError('Currency not found', 404);
  return serialize(row);
}

export async function getRateByCurrency(currencyCode: string) {
  const code = currencyCode.toUpperCase();
  const row = await prisma.currencyRate.findFirst({
    where: { currency: code, isActive: true },
    orderBy: { countryName: 'asc' },
  });
  if (row) return serialize(row);
  const fallback = await prisma.currencyRate.findFirst({
    where: { currency: 'USD', isActive: true },
  });
  if (fallback) return serialize(fallback);
  return {
    countryCode: 'US',
    countryName: 'United States',
    currency: 'USD',
    symbol: '$',
    usdRate: 1,
    minWithdrawalBeans: 10000,
    isActive: true,
    source: 'manual',
    lastSyncedAt: null,
    id: '',
    displayOrder: 0,
    beansToCurrencyRate: 1,
  };
}

export async function assertActiveCountry(countryCode: string) {
  const row = await prisma.currencyRate.findUnique({
    where: { countryCode: countryCode.toUpperCase() },
  });
  if (!row || !row.isActive) {
    throw new AppError('Withdrawal currency/country is not available', 400);
  }
  return row;
}

export async function assertActiveCurrency(currencyCode: string) {
  const row = await prisma.currencyRate.findFirst({
    where: { currency: currencyCode.toUpperCase(), isActive: true },
  });
  if (!row) throw new AppError('Currency is not supported', 400);
  return row;
}

export async function upsertRate(input: {
  countryCode: string;
  countryName: string;
  currency: string;
  symbol: string;
  usdRate: number;
  isActive?: boolean;
  minWithdrawalBeans?: number;
  displayOrder?: number;
}) {
  const row = await prisma.currencyRate.upsert({
    where: { countryCode: input.countryCode },
    update: {
      countryName: input.countryName,
      currency: input.currency,
      symbol: input.symbol,
      usdRate: input.usdRate,
      isActive: input.isActive ?? true,
      minWithdrawalBeans: input.minWithdrawalBeans ?? undefined,
      displayOrder: input.displayOrder ?? undefined,
      source: 'manual',
    },
    create: {
      countryCode: input.countryCode,
      countryName: input.countryName,
      currency: input.currency,
      symbol: input.symbol,
      usdRate: input.usdRate,
      isActive: input.isActive ?? true,
      minWithdrawalBeans: input.minWithdrawalBeans ?? 10000,
      displayOrder: input.displayOrder ?? 0,
      source: 'manual',
    },
  });
  return serialize(row);
}

export async function deleteRate(countryCode: string) {
  await prisma.currencyRate.delete({ where: { countryCode } }).catch(() => {});
}

export async function bulkActivate(countryCodes: string[], isActive: boolean) {
  const codes = countryCodes.map((c) => c.toUpperCase());
  const result = await prisma.currencyRate.updateMany({
    where: { countryCode: { in: codes } },
    data: { isActive },
  });
  return { updated: result.count };
}

/**
 * Import all countries from Rest Countries + FX rates from open.er-api.com.
 * Existing rows: update usdRate if source=auto; preserve isActive/minWithdrawalBeans unless new row.
 */
export async function bulkImportFromPublicApi(): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  const [rates, countries] = await Promise.all([fetchFxRates(), fetchRestCountries()]);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const c of countries) {
    const countryCode = c.cca2?.toUpperCase();
    if (!countryCode || countryCode.length !== 2) {
      skipped++;
      continue;
    }

    const currencyKeys = Object.keys(c.currencies ?? {});
    if (currencyKeys.length === 0) {
      skipped++;
      continue;
    }

    const currency = currencyKeys[0].toUpperCase();
    const curMeta = c.currencies![currencyKeys[0]];
    const usdRate = rates[currency];
    if (!usdRate || usdRate <= 0) {
      skipped++;
      continue;
    }

    const countryName = c.name?.common ?? countryCode;
    const symbol = symbolForCurrency(currency, curMeta?.symbol);
    const existing = await prisma.currencyRate.findUnique({ where: { countryCode } });

    if (existing) {
      await prisma.currencyRate.update({
        where: { countryCode },
        data: {
          countryName,
          currency,
          symbol,
          usdRate,
          ...(existing.source !== 'manual' ? { source: 'auto', lastSyncedAt: new Date() } : {}),
        },
      });
      updated++;
    } else {
      await prisma.currencyRate.create({
        data: {
          countryCode,
          countryName,
          currency,
          symbol,
          usdRate,
          isActive: isWithdrawalCountry(countryCode),
          minWithdrawalBeans: 10000,
          source: 'auto',
          lastSyncedAt: new Date(),
        },
      });
      created++;
    }
  }

  return { created, updated, skipped };
}

/**
 * Refresh usdRate for rows with source=auto from FX API.
 */
export async function syncFromPublicApi(): Promise<{ updated: number; skipped: number }> {
  const rates = await fetchFxRates();
  const rows = await prisma.currencyRate.findMany();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const next = rates[row.currency];
    if (!next) {
      skipped++;
      continue;
    }
    if (row.source === 'manual') {
      skipped++;
      continue;
    }
    await prisma.currencyRate.update({
      where: { id: row.id },
      data: { usdRate: next, source: 'auto', lastSyncedAt: new Date() },
    });
    updated++;
  }

  return { updated, skipped };
}

/** Beans payout: 10,000 beans = $1 USD → local = (beans/10000) * usdRate */
export function computeLocalAmount(beans: number, usdRate: number): number {
  return Number(((beans / 10_000) * usdRate).toFixed(6));
}

function serialize(row: {
  id: string;
  countryCode: string;
  countryName: string;
  currency: string;
  symbol: string;
  usdRate: { toNumber(): number };
  minWithdrawalBeans: number;
  displayOrder: number;
  isActive: boolean;
  source: string;
  lastSyncedAt: Date | null;
}) {
  const usdRate = row.usdRate.toNumber();
  return {
    id: row.id,
    countryCode: row.countryCode,
    countryName: row.countryName,
    currency: row.currency,
    symbol: row.symbol,
    usdRate,
    minWithdrawalBeans: row.minWithdrawalBeans,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    source: row.source,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    beansToCurrencyRate: usdRate,
  };
}

export { CURRENCY_SYMBOLS };
