import { apiClient } from './client';
import { useMock } from './config';
import { mockPayments } from './mock/payments';
import type {
  AgentSale,
  CoinPackage,
  CoinPackageLocal,
  CoinSeller,
  CurrencyConfig,
  ManualPaymentRequest,
  PaymentTransaction,
  RazorpayOrderResponse,
  UserPaymentMethod,
  WithdrawalPayoutMethodOption,
} from '../types';

export interface CountryCurrency {
  id?: string;
  countryCode: string;
  countryName: string;
  currency: string;
  symbol: string;
  usdRate: number;
  minWithdrawalBeans?: number;
  beansToCurrencyRate?: number;
  displayOrder?: number;
  isActive: boolean;
}

export interface PaymentsConfig {
  direct_user_topup_enabled: boolean;
}

// ── Payment-methods read cache ────────────────────────────────────────────────
// `getPaymentMethods` is called via `useFocusEffect` from several screens
// (withdraw, recharge, method list), so rapid back-and-forth navigation used to
// re-hit the network every time. A short TTL collapses those bursts; every
// mutation below invalidates it so freshly bound/removed methods show at once.
const PAYMENT_METHODS_TTL_MS = 15_000;
let paymentMethodsCache: { data: UserPaymentMethod[]; at: number } | null = null;

function invalidatePaymentMethodsCache(): void {
  paymentMethodsCache = null;
}

async function bindPaymentMethod(payload: Record<string, unknown>): Promise<UserPaymentMethod> {
  const res = await apiClient.post('/payments/methods/bind', payload);
  invalidatePaymentMethodsCache();
  return res.data;
}

export const paymentsApi = {
  getConfig: async (): Promise<PaymentsConfig> => {
    if (useMock) return { direct_user_topup_enabled: false };
    const res = await apiClient.get('/payments/config');
    return res.data as PaymentsConfig;
  },

  // ── Currencies ────────────────────────────────────────────────────────────
  getCurrencies: async (): Promise<CountryCurrency[]> => {
    if (useMock) {
      return mockPayments.currencies.map((c) => ({
        countryCode: c.country_code,
        countryName: c.country_name,
        currency: c.currency_code,
        symbol: c.currency_symbol,
        usdRate: Number(c.beans_to_currency_rate),
        minWithdrawalBeans: c.min_withdrawal_beans,
        beansToCurrencyRate: Number(c.beans_to_currency_rate),
        isActive: true,
      }));
    }
    const res = await apiClient.get('/payments/currencies');
    return (res.data ?? []) as CountryCurrency[];
  },

  getWithdrawalCurrencies: async (): Promise<CountryCurrency[]> => {
    if (useMock) {
      return mockPayments.currencies.map((c) => ({
        countryCode: c.country_code,
        countryName: c.country_name,
        currency: c.currency_code,
        symbol: c.currency_symbol,
        usdRate: Number(c.beans_to_currency_rate),
        minWithdrawalBeans: c.min_withdrawal_beans,
        beansToCurrencyRate: Number(c.beans_to_currency_rate),
        isActive: true,
      }));
    }
    const res = await apiClient.get('/payments/withdrawal-currencies');
    return (res.data ?? []) as CountryCurrency[];
  },

  getCurrencyByCountry: async (countryCode: string): Promise<CountryCurrency> => {
    if (useMock) {
      const list = mockPayments.currencies;
      const hit = list.find((c) => c.country_code === countryCode.toUpperCase());
      const c = hit ?? list[0];
      return {
        countryCode: c.country_code,
        countryName: c.country_name,
        currency: c.currency_code,
        symbol: c.currency_symbol,
        usdRate: Number(c.beans_to_currency_rate),
        minWithdrawalBeans: c.min_withdrawal_beans,
        isActive: true,
      };
    }
    const res = await apiClient.get(`/payments/currencies/${countryCode}`);
    return res.data as CountryCurrency;
  },

  getMyCurrency: async (preferredCountryCode?: string): Promise<CurrencyConfig> => {
    if (useMock) return mockPayments.currencies[0];
    const res = await apiClient.get('/payments/withdrawal-currencies');
    const list = (res.data ?? []) as CountryCurrency[];
    const code = preferredCountryCode?.toUpperCase();
    const row =
      (code && list.find((c) => c.countryCode === code)) ||
      list.find((c) => c.countryCode === 'US') ||
      list[0];
    if (!row) {
      return {
        id: 'usd',
        country_code: 'US',
        country_name: 'United States',
        currency_code: 'USD',
        currency_symbol: '$',
        beans_to_currency_rate: '1',
        min_withdrawal_beans: 10000,
      };
    }
    const rate = row.beansToCurrencyRate ?? row.usdRate;
    return {
      id: row.id ?? row.countryCode,
      country_code: row.countryCode,
      country_name: row.countryName,
      currency_code: row.currency,
      currency_symbol: row.symbol,
      beans_to_currency_rate: String(rate),
      min_withdrawal_beans: row.minWithdrawalBeans ?? 10000,
    };
  },

  setPreferredWithdrawalCountry: async (countryCode: string): Promise<void> => {
    if (useMock) return;
    await apiClient.patch('/profile/me', {
      preferredWithdrawalCountryCode: countryCode.toUpperCase(),
    });
  },

  // ── Packages (pass ?currency= for local pricing) ──────────────────────────
  getPackages: async (currencyCode = 'USD'): Promise<CoinPackageLocal[]> => {
    if (useMock) return mockPayments.packagesLocal;
    type BackendPkg = {
      id: string; coins: number; bonusCoins: number; totalCoins: number;
      priceUsd: number; priceLocal: number; currencyCode: string; currencySymbol: string; order: number;
    };
    const res = await apiClient.get(`/payments/packages?currency=${currencyCode}`);
    return (res.data as BackendPkg[]).map((p) => ({
      id:              p.id,
      name:            `${p.totalCoins.toLocaleString()} Coins`,
      coins:           p.coins,
      bonus_coins:     p.bonusCoins,
      total_coins:     p.totalCoins,
      price_local:     String(p.priceLocal),
      currency_symbol: p.currencySymbol,
      order:           p.order,
    }));
  },

  getPackagesRaw: async (): Promise<CoinPackage[]> => {
    if (useMock) return mockPayments.packages;
    const res = await apiClient.get('/payments/packages');
    return res.data;
  },

  // ── Free top-up (one-time welcome gift) ──────────────────────────────────
  claimFreeTopUp: async (): Promise<{ coins: number; newBalance: number }> => {
    if (useMock) return { coins: 100, newBalance: 100 };
    const res = await apiClient.post('/payments/free-topup');
    return res.data;
  },

  // ── History ───────────────────────────────────────────────────────────────
  getHistory: async (page = 1): Promise<PaymentTransaction[]> => {
    if (useMock) return mockPayments.history;
    const res = await apiClient.get(`/payments/history?page=${page}`);
    // Backend already returns snake_case unified shape
    return res.data.items ?? [];
  },

  getWithdrawalMethods: async (countryCode: string): Promise<WithdrawalPayoutMethodOption[]> => {
    if (useMock) return [];
    const res = await apiClient.get(
      `/payments/withdrawal-methods?countryCode=${encodeURIComponent(countryCode)}`,
    );
    return (res.data ?? []) as WithdrawalPayoutMethodOption[];
  },

  // ── Payment methods ──────────────────────────────────────────────────────────
  getPaymentMethods: async (force = false): Promise<UserPaymentMethod[]> => {
    if (useMock) return mockPayments.paymentMethods;
    if (!force && paymentMethodsCache && Date.now() - paymentMethodsCache.at < PAYMENT_METHODS_TTL_MS) {
      return paymentMethodsCache.data;
    }
    const res = await apiClient.get('/payments/methods');
    const data = (res.data ?? []) as UserPaymentMethod[];
    paymentMethodsCache = { data, at: Date.now() };
    return data;
  },

  hasPaymentMethod: async (): Promise<boolean> => {
    if (useMock) return false;
    const res = await apiClient.get('/payments/methods/has-method');
    return res.data?.hasBound ?? false;
  },

  bindBankAccount: async (data: {
    country_code: string;
    provider: string;
    bank_account_no: string;
    confirm_account_no: string;
    bank_name: string;
    account_holder_name: string;
    ifsc_code?: string;
    country_name?: string;
    nickname?: string;
  }): Promise<UserPaymentMethod> => {
    return bindPaymentMethod({
      methodType: 'bank_account',
      countryCode: data.country_code,
      provider: data.provider,
      bankAccountNo: data.bank_account_no,
      confirmAccountNo: data.confirm_account_no,
      bankName: data.bank_name,
      accountHolderName: data.account_holder_name,
      ifscCode: data.ifsc_code,
      countryName: data.country_name,
      nickname: data.nickname ?? '',
    });
  },

  bindMobileWallet: async (data: {
    country_code: string;
    provider: string;
    account_no: string;
    confirm_account_no: string;
    account_holder_name?: string;
    nickname?: string;
  }): Promise<UserPaymentMethod> => {
    return bindPaymentMethod({
      methodType: 'mobile_wallet',
      countryCode: data.country_code,
      provider: data.provider,
      accountNo: data.account_no,
      confirmAccountNo: data.confirm_account_no,
      accountHolderName: data.account_holder_name ?? '',
      nickname: data.nickname ?? '',
    });
  },

  bindUpi: async (data: {
    country_code: string;
    provider: string;
    vpa: string;
    confirm_vpa: string;
    account_holder_name?: string;
    nickname?: string;
  }): Promise<UserPaymentMethod> => {
    return bindPaymentMethod({
      methodType: 'upi',
      countryCode: data.country_code,
      provider: data.provider,
      vpa: data.vpa,
      confirmVpa: data.confirm_vpa,
      accountHolderName: data.account_holder_name,
      nickname: data.nickname ?? '',
    });
  },

  bindEpay: async (data: {
    country_code: string;
    provider: string;
    epay_account: string;
    confirm_epay_account: string;
    nickname?: string;
  }): Promise<UserPaymentMethod> => {
    return bindPaymentMethod({
      methodType: 'epay',
      countryCode: data.country_code,
      provider: data.provider,
      epayAccount: data.epay_account,
      confirmEpayAccount: data.confirm_epay_account,
      nickname: data.nickname ?? '',
    });
  },

  bindBinance: async (data: {
    country_code: string;
    provider: string;
    bep20_address: string;
    confirm_bep20_address: string;
    nickname?: string;
  }): Promise<UserPaymentMethod> => {
    return bindPaymentMethod({
      methodType: 'binance_bep20',
      countryCode: data.country_code,
      provider: data.provider,
      bep20Address: data.bep20_address,
      confirmBep20Address: data.confirm_bep20_address,
      nickname: data.nickname ?? '',
    });
  },

  bindUsdtTrc20: async (data: {
    country_code: string;
    provider: string;
    trc20_address: string;
    confirm_trc20_address: string;
    nickname?: string;
  }): Promise<UserPaymentMethod> => {
    return bindPaymentMethod({
      methodType: 'usdt_trc20',
      countryCode: data.country_code,
      provider: data.provider,
      trc20Address: data.trc20_address,
      confirmTrc20Address: data.confirm_trc20_address,
      nickname: data.nickname ?? '',
    });
  },

  setDefaultPaymentMethod: async (id: string): Promise<void> => {
    if (useMock) return;
    await apiClient.patch(`/payments/methods/${id}/default`);
    invalidatePaymentMethodsCache();
  },

  deletePaymentMethod: async (id: string): Promise<void> => {
    if (useMock) return;
    await apiClient.delete(`/payments/methods/${id}`);
    invalidatePaymentMethodsCache();
  },

  // ── Withdrawals (delegates to walletApi.withdraw now) ─────────────────────
  getWithdrawals: async () => {
    if (useMock) return mockPayments.withdrawals;
    return [];
  },
  requestWithdrawal: async (_beansAmount: number, _paymentMethodId: string) => {
    throw new Error('Use walletApi.withdraw() instead');
  },

  // ── Agent top-up (delegates to agencyApi.logSale) ─────────────────────────
  getAgentSales: async (): Promise<AgentSale[]> => [],
  createAgentSale: async (_data: unknown): Promise<AgentSale> => {
    throw new Error('Use agencyApi.logSale() instead');
  },

  // ── Manual payment ────────────────────────────────────────────────────────
  getManualTopUpDetail: async (_id: string): Promise<ManualPaymentRequest | null> => null,

  // ── Razorpay ──────────────────────────────────────────────────────────────
  createRazorpayOrder: async (packageId: string): Promise<RazorpayOrderResponse> => {
    if (useMock) return { orderId: 'mock_order', amountPaise: 100, keyId: 'rzp_test_key', coins: 100, bonusCoins: 0 };
    const res = await apiClient.post('/payments/razorpay/create-order', { packageId });
    return res.data;
  },

  // ── Coin Sellers ──────────────────────────────────────────────────────────
  getCoinSellers: async (countryCode?: string): Promise<CoinSeller[]> => {
    if (useMock) return mockPayments.coinSellers;
    const qs = countryCode ? `?country=${encodeURIComponent(countryCode)}` : '';
    const res = await apiClient.get(`/payments/coin-sellers${qs}`);
    return (res.data ?? []) as CoinSeller[];
  },

};
