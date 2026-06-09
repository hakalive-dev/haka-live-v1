import { apiClient } from './client';
import { useMock } from './config';
import { mockWallet } from './mock/wallet';
import type {
  BeanRecord,
  ExchangeRateRule,
  ExchangeResult,
  PaginatedResult,
  TopUpResult,
  WalletBalance,
  WalletTransaction,
  WithdrawalRequestRecord,
} from '../types';

const EXCHANGE_RATES: ExchangeRateRule[] = [
  { id: 'er-1', coins: 90_000,  beansCost: 180_000, isPreset: true, sortOrder: 1 },
  { id: 'er-2', coins: 100_000, beansCost: 200_000, isPreset: true, sortOrder: 2 },
  { id: 'er-3', coins: 450_000, beansCost: 880_000, isPreset: true, sortOrder: 3 },
  { id: 'er-4', coins: 500_000, beansCost: 960_000, isPreset: true, sortOrder: 4 },
];

function normalizeWalletBalance(raw: WalletBalance): WalletBalance {
  return {
    ...raw,
    coinBalance: Number(raw.coinBalance),
    beanBalance: Number(raw.beanBalance),
  };
}

export const walletApi = {
  getBalance: async (): Promise<WalletBalance> => {
    if (useMock) return mockWallet.balance;
    const res = await apiClient.get('/wallet');
    return normalizeWalletBalance(res.data as WalletBalance);
  },

  getTransactions: async (page = 1): Promise<PaginatedResult<WalletTransaction>> => {
    if (useMock) {
      return {
        items: mockWallet.transactions,
        total: mockWallet.transactions.length,
        page: 1,
        limit: 20,
        hasMore: false,
      };
    }
    const res = await apiClient.get(`/wallet/transactions?page=${page}`);
    return res.data;
  },

  /** Exchange beans for coins */
  exchange: async (beans: number): Promise<ExchangeResult> => {
    if (useMock) {
      const coins = Math.floor(beans / 2);
      return {
        beansSpent: beans,
        coinsEarned: coins,
        coinBalance: mockWallet.balance.coinBalance + coins,
        beanBalance: mockWallet.balance.beanBalance - beans,
      };
    }
    const res = await apiClient.post('/wallet/exchange', { beans });
    return res.data;
  },

  /** Get exchange rate presets (placeholder — uses hardcoded rates) */
  getExchangeRates: async (): Promise<ExchangeRateRule[]> => {
    return EXCHANGE_RATES;
  },

  /** Get exchange history (last 30 days) */
  getExchangeHistory: async (): Promise<WalletTransaction[]> => {
    if (useMock) {
      return mockWallet.transactions.filter((t) => t.reference === 'exchange');
    }
    const res = await apiClient.get('/wallet/transactions?page=1&limit=50');
    const data: PaginatedResult<WalletTransaction> = res.data;
    return data.items.filter((t) => t.reference === 'exchange');
  },

  /** Top up coins (dev/agent manual top-up) */
  topUp: async (coins: number): Promise<TopUpResult> => {
    if (useMock) {
      return { coinBalance: mockWallet.balance.coinBalance + coins, coinsAdded: coins };
    }
    const res = await apiClient.post('/wallet/topup', { coins });
    return res.data;
  },

  /** Request a withdrawal (deducts beans, creates pending record) */
  withdraw: async (
    beans: number,
    notes = '',
    countryCode: string,
    paymentMethodId: string,
  ): Promise<WithdrawalRequestRecord> => {
    if (useMock) {
      return {
        id: `wr-${Date.now()}`,
        userId: 'user-uuid-001',
        beansAmount: beans,
        status: 'pending',
        notes,
        processedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const res = await apiClient.post('/wallet/withdraw', {
      beans: Math.floor(Number(beans)),
      notes,
      countryCode,
      paymentMethodId,
    });
    return res.data;
  },

  /** Get withdrawal request history (admin workflow status) */
  getWithdrawals: async (page = 1): Promise<PaginatedResult<WithdrawalRequestRecord>> => {
    if (useMock) {
      return { items: [], total: 0, page: 1, limit: 20, hasMore: false };
    }
    const res = await apiClient.get(`/wallet/withdrawals?page=${page}`);
    return res.data;
  },

  /** Bean ledger: gift received, exchange, withdrawal (Withdraw → Record) */
  getBeanRecords: async (page = 1): Promise<PaginatedResult<BeanRecord>> => {
    if (useMock) {
      const beanTxs = mockWallet.transactions.filter((t) => t.currency === 'beans');
      const items: BeanRecord[] = beanTxs
        .filter((t) =>
          t.reference === 'gift_received'
          || t.reference === 'gift_commission'
          || t.reference === 'exchange'
          || t.reference === 'withdrawal_hold'
          || t.reference === 'withdrawal_agent_payout'
          || t.reference === 'withdrawal_agent_commission',
        )
        .map((t) => {
          const isGift = t.reference === 'gift_received';
          const legacyGift = isGift
            ? /^Received\s+(.+?)\s+from\s+(.+)$/i.exec(t.description)
            : null;
          return {
            id: t.id,
            transactionType: t.transactionType,
            amount: t.amount,
            balanceAfter: t.balanceAfter,
            reference: t.reference,
            description: t.description,
            createdAt: t.createdAt,
            category:
              t.reference === 'gift_received'
                ? 'gift_received'
                : t.reference === 'gift_commission'
                  ? 'creator_commission'
                  : t.reference === 'exchange'
                    ? 'exchange'
                    : t.reference === 'withdrawal_agent_payout'
                      ? 'payroll_payout'
                      : t.reference === 'withdrawal_agent_commission'
                        ? 'payroll_commission'
                        : 'withdrawal',
            withdrawalStatus:
              t.reference === 'withdrawal_hold' ? 'pending_review' : null,
            withdrawalId: null,
            orderId: null,
            gift_income: legacyGift
              ? {
                  gift_name: legacyGift[1],
                  gift_icon: '',
                  gift_image_url: null,
                  gift_qty: 1,
                  sender_id: '',
                  sender_display_name: legacyGift[2],
                  sender_haka_id: '',
                  sender_avatar: null,
                }
              : isGift
                ? {
                    gift_name: 'Gift',
                    gift_icon: '🎁',
                    gift_image_url: null,
                    gift_qty: 1,
                    sender_id: '',
                    sender_display_name: 'User',
                    sender_haka_id: '',
                    sender_avatar: null,
                  }
                : null,
          };
        });
      return {
        items,
        total: items.length,
        page: 1,
        limit: 20,
        hasMore: false,
      };
    }
    const res = await apiClient.get(`/wallet/bean-records?page=${page}`);
    return res.data;
  },

  disputeWithdrawal: async (withdrawalId: string, reason: string) => {
    const res = await apiClient.post(`/wallet/withdrawals/${withdrawalId}/dispute`, { reason });
    return res.data;
  },

  getWithdrawalDetail: async (withdrawalId: string): Promise<WithdrawalDetail> => {
    const res = await apiClient.get(`/wallet/withdrawals/${withdrawalId}`);
    return res.data as WithdrawalDetail;
  },

  confirmWithdrawalReceipt: async (withdrawalId: string) => {
    const res = await apiClient.post(`/wallet/withdrawals/${withdrawalId}/confirm-receipt`);
    return res.data;
  },
};

export interface WithdrawalDetailAccountRow {
  label: string;
  value: string;
}

export interface WithdrawalDetail {
  id: string;
  orderId: string;
  status: string;
  beansAmount: number;
  localAmount: number | null;
  currency: string;
  countryCode: string;
  payout: Record<string, string> | null;
  accountRows: WithdrawalDetailAccountRow[];
  proofUrl: string | null;
  agentDisplayName: string | null;
  userConfirmedAt: string | null;
  userConfirmAutoAt: string | null;
  proofUploadedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  processedAt: string | null;
  disputedAt: string | null;
}
