import { apiClient } from './client';

export interface PayrollSummary {
  paymentAmount: number;
  pointsOfEarnings: number;
  platformReward: number;
  pendingPaymentCount: number;
  newOrderCount: number;
  awaitingConfirmationCount: number;
  successCount: number;
  failedCount: number;
  waitingListCount: number;
  acceptingOrders: boolean;
}

export interface PayrollPayoutSnapshot {
  paymentMethodId?: string;
  methodType: string;
  countryCode: string;
  provider: string;
  label: string;
  maskedAccount: string;
  accountLabel: string;
  accountHolderName?: string;
  bankName?: string;
  ifscCode?: string;
  accountNumber?: string;
  epayAccount?: string;
  bep20Address?: string;
  trc20Address?: string;
  countryName?: string;
}

export type PayrollWithdrawalTab =
  | 'assigned'
  | 'proof_submitted'
  | 'success'
  | 'failed';

export interface PayrollWithdrawalItem {
  id: string;
  orderId: string;
  beansAmount: number;
  status: string;
  countryCode: string;
  currency: string;
  localAmount: number | null;
  notes: string;
  proofUrl: string;
  externalTransactionId: string;
  adminRejectionNotes?: string;
  assignedAt: string | null;
  acceptedAt: string | null;
  slaDeadlineAt: string | null;
  payout: PayrollPayoutSnapshot | null;
  commissionPreview: {
    agentBeans: number;
    platformBeans: number;
    percent: number;
  };
  user: { id: string; displayName: string; hakaId: string | null; avatar: string };
}

export const payrollAgentApi = {
  getMe: async () => {
    const res = await apiClient.get('/payroll-agent/me');
    return res.data as {
      profile: {
        payrollId: string;
        countryCode: string;
        status: string;
        commissionPercent: number;
        acceptingOrders: boolean;
      };
      beanBalance: number;
    };
  },

  patchMe: async (acceptingOrders: boolean) => {
    const res = await apiClient.patch('/payroll-agent/me', { acceptingOrders });
    return res.data;
  },

  getSummary: async (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const q = params.toString();
    const res = await apiClient.get(`/payroll-agent/summary${q ? `?${q}` : ''}`);
    return res.data as PayrollSummary;
  },

  listWithdrawals: async (page = 1, status?: PayrollWithdrawalTab) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) params.set('status', status);
    const res = await apiClient.get(`/payroll-agent/withdrawals?${params}`);
    return res.data as {
      items: PayrollWithdrawalItem[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };
  },

  submitProof: async (
    withdrawalId: string,
    proofUri: string,
    transactionId: string,
    notes: string,
  ) => {
    const form = new FormData();
    form.append('proof', {
      uri: proofUri,
      name: 'proof.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    form.append('transactionId', transactionId);
    form.append('notes', notes);
    const res = await apiClient.post(
      `/payroll-agent/withdrawals/${withdrawalId}/proof`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  },

  accept: async (withdrawalId: string) => {
    const res = await apiClient.post(`/payroll-agent/withdrawals/${withdrawalId}/accept`);
    return res.data as PayrollWithdrawalItem;
  },

  decline: async (withdrawalId: string) => {
    await apiClient.post(`/payroll-agent/withdrawals/${withdrawalId}/decline`);
  },
};
