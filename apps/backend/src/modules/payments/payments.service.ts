import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { creditCoins } from '../wallet/wallet.service';
import * as currencyService from './currency.service';
import { symbolForCurrency } from './currency-symbols';

const FREE_TOPUP_COINS = 100;
const FREE_TOPUP_REF = (userId: string) => `free_topup_${userId}`;

/**
 * Coins → USD conversion: 10,000 coins = $1 USD.
 * All package prices are derived from coin count, NOT from priceGbp stored in DB.
 */
const COINS_PER_USD = 10_000;

export async function getSupportedCurrencies() {
  await currencyService.ensureSeeded();
  const rows = await currencyService.listActive();
  const seen = new Set<string>();
  const out: Array<{ code: string; symbol: string }> = [];
  for (const r of rows) {
    if (seen.has(r.currency)) continue;
    seen.add(r.currency);
    out.push({ code: r.currency, symbol: r.symbol });
  }
  return out;
}

/**
 * List active CoinPackages with price converted to the requested currency.
 * Default currency: USD. Rate basis: 10,000 coins = $1.
 */
export async function getPackages(currencyCode = 'USD') {
  await currencyService.ensureSeeded();
  const rateRow = await currencyService.getRateByCurrency(currencyCode);
  const code = currencyCode.toUpperCase();
  const rate = rateRow.usdRate;
  const symbol = rateRow.symbol || symbolForCurrency(code);

  const packages = await prisma.coinPackage.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });

  return packages.map((pkg) => {
    const totalCoins = pkg.coins + pkg.bonusCoins;
    const priceUsd   = totalCoins / COINS_PER_USD;
    const priceLocal = priceUsd * rate;

    return {
      id:              pkg.id,
      coins:           pkg.coins,
      bonusCoins:      pkg.bonusCoins,
      totalCoins,
      priceUsd:        Number(priceUsd.toFixed(2)),
      priceLocal:      Number(priceLocal.toFixed(2)),
      currencyCode:    code,
      currencySymbol:  symbol,
      isActive:        pkg.isActive,
      order:           pkg.order,
    };
  });
}

/**
 * Claim the one-time free top-up of 100 coins.
 * Idempotent check: looks for an existing WalletTransaction with the free_topup reference.
 */
export async function claimFreeTopUp(userId: string) {
  const alreadyClaimed = await prisma.walletTransaction.findFirst({
    where: { wallet: { userId }, reference: FREE_TOPUP_REF(userId) },
  });

  if (alreadyClaimed) {
    throw new AppError('Free top-up already claimed', 400);
  }

  const wallet = await creditCoins(
    userId,
    FREE_TOPUP_COINS,
    FREE_TOPUP_REF(userId),
    `Welcome gift: ${FREE_TOPUP_COINS} free coins`,
  );

  const { emitAdminDataChanged } = await import('../../sockets/admin-realtime');
  emitAdminDataChanged('coin_purchases', { userId, source: 'free_topup' });

  return { coins: FREE_TOPUP_COINS, newBalance: wallet.coinBalance };
}

const sellerSnippet = {
  displayName: true,
  username: true,
  hakaId: true,
  activeSpecialId: true,
} as const;

function sellerDisplayName(seller: {
  displayName: string | null;
  username: string | null;
}): string {
  return seller.displayName?.trim() || seller.username?.trim() || 'Coin Seller';
}

/**
 * Get paginated purchase history for a user.
 * Includes: PaymentTransactions, coin-seller transfers to user, one-time free top-up.
 * Returns a unified shape with snake_case fields for mobile compatibility.
 */
export async function getPaymentHistory(userId: string, page: number, limit: number) {
  const sellerWhere = {
    counterpartyId: userId,
    transactionType: 'transfer',
    targetType: 'user',
  } as const;

  const [txns, sellerTxs, freeTopUp, paidTotal, sellerTotal] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { package: true },
    }),
    prisma.coinSellerTransaction.findMany({
      where: sellerWhere,
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: sellerSnippet } },
    }),
    prisma.walletTransaction.findFirst({
      where: { wallet: { userId }, reference: FREE_TOPUP_REF(userId) },
    }),
    prisma.paymentTransaction.count({ where: { userId } }),
    prisma.coinSellerTransaction.count({ where: sellerWhere }),
  ]);

  const paidItems = txns.map((t) => ({
    id:             t.id,
    package_name:   t.package?.coins
      ? `${(t.package.coins + t.package.bonusCoins).toLocaleString()} Coins`
      : 'Coin Package',
    method:         t.method,
    amount_usd:     t.package
      ? Number(((t.package.coins + t.package.bonusCoins) / COINS_PER_USD).toFixed(2))
      : 0,
    amount_gbp:     String(t.amountGbp),
    coins_credited: t.coinsCredited,
    status:         t.status,
    created_at:     t.createdAt.toISOString(),
    type:           'purchase' as const,
  }));

  const sellerItems = sellerTxs.map((t) => {
    const coins = Number(t.coinsAmount);
    const amountUsd = Number((coins / COINS_PER_USD).toFixed(2));
    const name = sellerDisplayName(t.seller);
    return {
      id:             t.id,
      package_name:   `${coins.toLocaleString()} Coins from ${name}`,
      method:         'coin_seller' as const,
      amount_usd:     amountUsd,
      amount_gbp:     (amountUsd * 0.79).toFixed(2),
      coins_credited: true,
      status:         'succeeded' as const,
      created_at:     t.createdAt.toISOString(),
      type:           'coin_seller_purchase' as const,
    };
  });

  const freeTopUpUsd = Number((FREE_TOPUP_COINS / COINS_PER_USD).toFixed(2));

  const freeItem = freeTopUp
    ? [{
        id:             freeTopUp.id,
        package_name:   'Free Welcome Top-Up',
        method:         'free' as const,
        amount_usd:     freeTopUpUsd,
        amount_gbp:     (freeTopUpUsd * 0.79).toFixed(2),
        coins_credited: true,
        status:         'succeeded' as const,
        created_at:     freeTopUp.createdAt.toISOString(),
        type:           'free_topup' as const,
      }]
    : [];

  const allItems = [...freeItem, ...paidItems, ...sellerItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const totalCount = paidTotal + sellerTotal + (freeTopUp ? 1 : 0);
  const skip = (page - 1) * limit;
  const items = allItems.slice(skip, skip + limit);

  return {
    items,
    total:   totalCount,
    page,
    limit,
    hasMore: skip + items.length < totalCount,
  };
}
