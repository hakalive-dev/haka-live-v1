import { apiClient } from './client';
import type {
  CoinSellerProfile,
  CoinSellerTransaction,
  CoinSellerCustomer,
  CoinSellerLevelRule,
  CoinSellerTransactionType,
  CoinSellerTargetType,
  LeaderboardUserEntry,
  SellerRechargePackage,
  SellerRechargePaymentInfo,
  SellerRechargeRequest,
  SellerExchangeRequest,
  RechargePaymentMethod,
  AgencySummaryV2,
  WalletBalance,
} from '../types';

export const coinSellerApi = {
  getMyProfile: async (): Promise<CoinSellerProfile> => {
    const res = await apiClient.get('/payments/coin-sellers/me');
    return res.data;
  },

  getBootstrap: async (): Promise<{
    profile: CoinSellerProfile;
    agencySummary: AgencySummaryV2 | null;
    wallet: WalletBalance;
  }> => {
    const res = await apiClient.get('/payments/coin-sellers/bootstrap', { timeout: 30_000 });
    const data = res.data as {
      profile: CoinSellerProfile;
      agencySummary: AgencySummaryV2 | null;
      wallet: { coinBalance: number; beanBalance: number; updatedAt?: string };
    };
    return {
      profile: data.profile,
      agencySummary: data.agencySummary,
      wallet: {
        coinBalance: data.wallet.coinBalance,
        beanBalance: data.wallet.beanBalance,
        updatedAt: data.wallet.updatedAt ?? new Date().toISOString(),
      },
    };
  },

  updateMyProfile: async (data: {
    whatsapp_number?: string;
    is_assistant?: boolean;
  }): Promise<CoinSellerProfile> => {
    const res = await apiClient.patch('/payments/coin-sellers/me', data);
    return res.data;
  },

  getBalance: async (): Promise<{
    available_balance: number;
    total_balance: number;
    security_deposit: number;
  }> => {
    const res = await apiClient.get('/payments/coin-sellers/me/balance');
    return res.data;
  },

  transfer: async (data: {
    target_user_id: string;
    coins_amount: number;
    target_type: CoinSellerTargetType;
  }): Promise<CoinSellerTransaction> => {
    const res = await apiClient.post('/payments/coin-sellers/transfer', data);
    return res.data;
  },

  recharge: async (data: {
    package_id?: string;
    custom_amount?: number;
  }): Promise<CoinSellerTransaction> => {
    const res = await apiClient.post('/payments/coin-sellers/recharge', data);
    return res.data;
  },

  exchange: async (data: {
    points_amount: number;
  }): Promise<SellerExchangeRequest> => {
    const res = await apiClient.post('/payments/coin-sellers/exchange', data);
    return res.data;
  },

  getMyExchangeRequests: async (): Promise<SellerExchangeRequest[]> => {
    const res = await apiClient.get('/payments/coin-sellers/exchange-requests');
    return res.data;
  },

  getTransactions: async (
    type?: CoinSellerTransactionType,
  ): Promise<CoinSellerTransaction[]> => {
    const params = type ? { type } : {};
    const res = await apiClient.get('/payments/coin-sellers/transactions', { params });
    return res.data;
  },

  getCustomers: async (
    type?: 'recommend' | 'old',
  ): Promise<CoinSellerCustomer[]> => {
    const params = type ? { type } : {};
    const res = await apiClient.get('/payments/coin-sellers/customers', { params });
    return res.data;
  },

  getQuickMessage: async (): Promise<{ quick_message: string }> => {
    const res = await apiClient.get('/payments/coin-sellers/quick-message');
    return res.data;
  },

  updateQuickMessage: async (
    quick_message: string,
  ): Promise<{ quick_message: string }> => {
    const res = await apiClient.patch('/payments/coin-sellers/quick-message', { quick_message });
    return res.data;
  },

  getLevelRules: async (): Promise<CoinSellerLevelRule[]> => {
    const res = await apiClient.get('/payments/coin-sellers/level-rules');
    return res.data;
  },

  getRank: async (
    window: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ): Promise<LeaderboardUserEntry[]> => {
    const res = await apiClient.get('/leaderboard/coin_sellers', { params: { window } });
    return res.data.items ?? res.data;
  },

  getRechargePackages: async (): Promise<SellerRechargePackage[]> => {
    const res = await apiClient.get('/payments/coin-sellers/recharge-packages');
    return res.data;
  },

  getRechargePaymentInfo: async (): Promise<SellerRechargePaymentInfo> => {
    const res = await apiClient.get('/payments/coin-sellers/recharge-info');
    return res.data;
  },

  getMyRechargeRequests: async (): Promise<SellerRechargeRequest[]> => {
    const res = await apiClient.get('/payments/coin-sellers/recharge-requests');
    return res.data;
  },

  submitRechargeRequest: async (data: {
    amount_usd: number;
    payment_method: RechargePaymentMethod;
    tx_hash?: string;
    proof: { uri: string; name: string; type: string };
  }): Promise<SellerRechargeRequest> => {
    const form = new FormData();
    form.append('amount_usd', String(data.amount_usd));
    form.append('payment_method', data.payment_method);
    if (data.tx_hash) form.append('tx_hash', data.tx_hash);
    form.append('proof', { uri: data.proof.uri, name: data.proof.name, type: data.proof.type } as any);
    const res = await apiClient.post('/payments/coin-sellers/recharge-request', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
