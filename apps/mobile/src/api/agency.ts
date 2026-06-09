import { apiClient } from './client';
import { useMock } from './config';
import { mockAgency } from './mock/agency';
import { usersApi } from './users';
import type {
  AgencySummary,
  AgencyHost,
  AgencySummaryV2,
  AgencyHostRosterItem,
  AgencyDailyAnalytics,
  AgencyLearnPromotion,
  PaginatedResult,
  WalletBalance,
} from '../types';

type BindSearchRow = {
  id: string;
  name: string;
  owner: {
    id: string;
    displayName: string;
    hakaId: string | null;
    avatar?: string;
  };
};

/** bind-search may omit avatar on older API builds — hydrate from public profile when missing. */
async function enrichBindSearchAvatars(rows: BindSearchRow[]): Promise<BindSearchRow[]> {
  const normalized = rows.map((row) => ({
    ...row,
    owner: { ...row.owner, avatar: row.owner.avatar?.trim() ?? '' },
  }));
  const missing = normalized.filter((row) => !row.owner.avatar);
  if (missing.length === 0) return normalized;

  const fetched = await Promise.all(
    missing.map(async (row) => {
      try {
        const profile = await usersApi.profile(row.owner.id);
        return [row.owner.id, profile.avatar?.trim() ?? ''] as const;
      } catch {
        return [row.owner.id, ''] as const;
      }
    }),
  );
  const avatarById = new Map(fetched);

  return normalized.map((row) => ({
    ...row,
    owner: {
      ...row.owner,
      avatar: row.owner.avatar || avatarById.get(row.owner.id) || '',
    },
  }));
}

function mapSummaryV2ToLegacy(v2: AgencySummaryV2): AgencySummary {
  const effectiveRate = v2.effectiveCommissionRate ?? v2.commissionTier.commissionRate;
  return {
    commission_tier: 0,
    commission_rate: Math.round(effectiveRate * 100),
    total_xp: v2.weeklyBeans,
    xp_to_next_tier: null,
    total_hosts: v2.totalHosts,
    total_beans_earned_today: v2.todayBeans ?? 0,
    total_commission_earned_today: v2.todayCommission ?? 0,
    total_beans_earned_week: v2.weeklyBeans,
    total_commission_earned_week: v2.weeklyCommission,
    total_beans_earned_month: 0,
    total_commission_earned_month: v2.monthCommission ?? 0,
    total_commission_all_time: v2.allTimeCommission,
    tier_name: v2.currentTier?.name ?? v2.commissionTier.name,
    effective_commission_rate: effectiveRate,
    cumulative_host_income: v2.cumulativeHostIncome ?? '0',
    agency_pot_balance: v2.agencyPotBalance ?? '0',
    current_tier: v2.currentTier ?? {
      name: v2.commissionTier.name,
      commissionRate: v2.commissionTier.commissionRate,
      minHostIncome: '0',
    },
    next_tier: v2.nextTier ?? null,
    all_tiers: v2.allTiers ?? [],
  };
}

function mapRosterToAgencyHosts(items: AgencyHostRosterItem[]): AgencyHost[] {
  return items.map((item) => ({
    host: {
      id: item.id,
      username: item.username ?? '',
      displayName: item.displayName,
      avatar: item.avatar ?? null,
    },
    today_host_beans: 0,
    today_commission: 0,
    week_host_beans: item.wallet?.beanBalance ?? 0,
    week_commission: 0,
    commission_rate: 20,
    monthly_beans: (item as { monthly_beans?: number }).monthly_beans ?? 0,
    monthly_commission: (item as { monthly_commission?: number }).monthly_commission ?? 0,
  }));
}

export const agencyApi = {
  // ── Agent-facing ────────────────────────────────────────────────────────────

  /** Agency summary: commission tier, hosts, beans, commission */
  getSummary: async (): Promise<AgencySummary> => {
    if (useMock) return mockAgency.summary;
    const res = await apiClient.get('/agency/summary');
    return mapSummaryV2ToLegacy(res.data as AgencySummaryV2);
  },

  /** Agency Center: summary + hosts + wallet in one request. */
  getCenterBootstrap: async (): Promise<{
    summary: AgencySummary;
    summaryV2: AgencySummaryV2;
    hosts: AgencyHost[];
    wallet: WalletBalance;
  }> => {
    if (useMock) {
      const wallet: WalletBalance = {
        coinBalance: 0,
        beanBalance: 0,
        updatedAt: new Date().toISOString(),
      };
      return {
        summary: mockAgency.summary,
        summaryV2: mockAgency.summaryV2,
        hosts: mockAgency.hosts,
        wallet,
      };
    }
    const res = await apiClient.get('/agency/center-bootstrap', { timeout: 30_000 });
    const raw = res.data as {
      summaryV2: AgencySummaryV2;
      hosts: AgencyHostRosterItem[];
      wallet: WalletBalance;
    };
    const summaryV2 = raw.summaryV2;
    return {
      summary: mapSummaryV2ToLegacy(summaryV2),
      summaryV2,
      hosts: mapRosterToAgencyHosts(raw.hosts ?? []),
      wallet: raw.wallet,
    };
  },

  /** Raw V2 summary — exposes day/week/month breakdowns + direct-vs-invite-agent split */
  getSummaryV2: async (): Promise<AgencySummaryV2> => {
    if (useMock) return mockAgency.summaryV2;
    const res = await apiClient.get('/agency/summary');
    return res.data as AgencySummaryV2;
  },

  /** Per-day host bean income + agent commission for last N days (zero-filled) */
  getDailyAnalytics: async (days = 30): Promise<AgencyDailyAnalytics> => {
    if (useMock) return mockAgency.dailyAnalytics(days);
    const res = await apiClient.get(`/agency/analytics/daily?days=${days}`);
    return res.data as AgencyDailyAnalytics;
  },

  /** Paginated host roster */
  getHosts: async (page = 1): Promise<AgencyHost[]> => {
    if (useMock) return mockAgency.hosts;
    const res = await apiClient.get(`/agency/hosts?page=${page}`);
    const result = res.data as PaginatedResult<AgencyHostRosterItem>;
    return mapRosterToAgencyHosts(result.items);
  },

  /** Host performance stats */
  getHostStats: async (hostId: string, _period?: string): Promise<import('../types').HostStatEntry[]> => {
    if (useMock) return mockAgency.hostStats(hostId);
    const res = await apiClient.get(`/agency/hosts/${hostId}/stats`);
    const data = res.data as {
      daily: Array<{ date: string; totalBeans: number; totalCoins: number; count: number }>;
    };
    return data.daily.map((d) => ({
      date: d.date,
      host_beans_earned: d.totalBeans,
      agency_commission_earned: Math.round(d.totalBeans * 0.2),
      gift_count: d.count,
    }));
  },

  /** Log a coin sale (agent top-up) */
  logSale: async (
    customerId: string,
    coinsSold: number,
    amountCollected: number,
    currency = 'USD',
    notes = '',
  ): Promise<unknown> => {
    const res = await apiClient.post('/agency/sales', { customerId, coinsSold, amountCollected, currency, notes });
    return res.data;
  },

  /** Agent coin sale transaction history */
  getSales: async (page = 1): Promise<PaginatedResult<unknown>> => {
    const res = await apiClient.get(`/agency/sales?page=${page}`);
    return res.data as PaginatedResult<unknown>;
  },

  // ── Host-facing ─────────────────────────────────────────────────────────────

  /** Host: get info about own agent */
  getMyAgent: async (): Promise<{
    id: string; displayName: string; username: string | null;
    avatar: string; country: string; totalHosts: number;
  }> => {
    const res = await apiClient.get('/agency/my-agent');
    return res.data.data;
  },

  /** Host: get current pending change request (null if none) */
  getMyChangeRequest: async (): Promise<{
    id: string; type: 'leave' | 'change'; status: string; reason: string; createdAt: string;
  } | null> => {
    const res = await apiClient.get('/agency/change-request');
    return res.data.data ?? null;
  },

  /** Host: submit a leave or change request */
  submitChangeRequest: async (data: {
    type: 'leave' | 'change'; toAgentId?: string | null; reason: string;
  }): Promise<void> => {
    await apiClient.post('/agency/change-request', data);
  },

  /** Host: cancel a pending change request */
  cancelChangeRequest: async (id: string): Promise<void> => {
    await apiClient.delete(`/agency/change-request/${id}`);
  },

  // ── Agent discovery / onboarding ──────────────────────────────────────────

  /** List users with role=agent (for selection UI) */
  listAgents: async (): Promise<import('../types').PublicUser[]> => {
    if (useMock) return [];
    const res = await apiClient.get('/users?role=agent&limit=50');
    return (res.data?.items ?? res.data) as import('../types').PublicUser[];
  },

  /**
   * Exact parent-agent lookup by Haka ID, UUID, or username (Become Agent — Haka ID tab).
   * Throws ApiError with a specific message when the user exists but is not bindable.
   */
  lookupParentAgent: async (q: string): Promise<{
    id: string;
    name: string;
    owner: {
      id: string;
      displayName: string;
      hakaId: string | null;
      avatar: string;
    };
  }> => {
    if (useMock) {
      throw new Error('Agent not found');
    }
    const res = await apiClient.get(`/agency/lookup-parent-agent?q=${encodeURIComponent(q)}`);
    const row = res.data as BindSearchRow;
    const [enriched] = await enrichBindSearchAvatars([row]);
    return enriched;
  },

  /** Discover active agencies to bind (Become Agent) */
  bindSearchAgencies: async (q = ''): Promise<
    Array<{
      id: string;
      name: string;
      owner: {
        id: string;
        displayName: string;
        hakaId: string | null;
        avatar: string;
      };
    }>
  > => {
    if (useMock) return [];
    const res = await apiClient.get(`/agency/bind-search?q=${encodeURIComponent(q)}`);
    const rows = (res.data ?? []) as BindSearchRow[];
    return enrichBindSearchAvatars(rows);
  },

  /** Admin-curated staff Haka IDs for Become Agency (root auto-approve path) */
  listDesignatedBecomeAgencyAdmins: async (): Promise<
    Array<{
      id: string;
      hakaId: string;
      displayName: string;
      region: string | null;
    }>
  > => {
    if (useMock) return [];
    const res = await apiClient.get('/agency/designated-admins');
    return res.data ?? [];
  },

  /** Submit sub-agent application under a parent agency owner (pending until they approve) */
  applyAsAgent: async (
    proposedName: string,
    country: string,
    parentAgentId: string,
  ): Promise<void> => {
    await apiClient.post('/agency/apply-as-agent', { proposedName, country, parentAgentId });
  },

  /** Submit root agency application under designated admin (auto-approved) */
  applyAsAgentUnderAdmin: async (
    proposedName: string,
    country: string,
    designatedAdminHakaId: string,
  ): Promise<{ autoApproved?: boolean }> => {
    const res = await apiClient.post('/agency/apply-as-agent', {
      proposedName,
      country,
      designatedAdminHakaId,
    });
    return (res.data ?? {}) as { autoApproved?: boolean };
  },

  listPendingAgentApplications: async (): Promise<
    Array<{
      id: string;
      userId: string;
      proposedName: string;
      country: string;
      status: string;
      createdAt: string;
      user: { id: string; displayName: string; username: string | null; avatar: string | null; hakaId: string | null };
    }>
  > => {
    if (useMock) return [];
    const res = await apiClient.get('/agency/agent-applications/pending');
    return res.data ?? [];
  },

  approveAgentApplication: async (applicationId: string, note = ''): Promise<void> => {
    await apiClient.post(`/agency/agent-applications/${applicationId}/approve`, { note });
  },

  rejectAgentApplication: async (applicationId: string, note = ''): Promise<void> => {
    await apiClient.post(`/agency/agent-applications/${applicationId}/reject`, { note });
  },

  listPendingHostApplications: async (): Promise<
    Array<{
      id: string;
      userId: string;
      agentId: string | null;
      path: string;
      status: string;
      createdAt: string;
      user: { id: string; displayName: string; username: string | null; avatar: string | null; role?: string };
    }>
  > => {
    if (useMock) return [];
    const res = await apiClient.get('/agency/host-applications/pending');
    return res.data ?? [];
  },

  approveHostApplication: async (applicationId: string, note = ''): Promise<void> => {
    await apiClient.post(`/agency/host-applications/${applicationId}/approve`, { note });
  },

  rejectHostApplication: async (applicationId: string, note = ''): Promise<void> => {
    await apiClient.post(`/agency/host-applications/${applicationId}/reject`, { note });
  },

  createSubAgentInvitation: async (targetUserIdOrHaka: string, proposedAgencyName = ''): Promise<{ id: string }> => {
    const res = await apiClient.post('/agency/sub-agent-invitations', {
      targetUserIdOrHaka,
      proposedAgencyName,
    });
    return res.data as { id: string };
  },

  acceptSubAgentInvitation: async (invitationId: string): Promise<void> => {
    await apiClient.post(`/agency/sub-agent-invitations/${invitationId}/accept`, {});
  },

  declineSubAgentInvitation: async (invitationId: string): Promise<void> => {
    await apiClient.post(`/agency/sub-agent-invitations/${invitationId}/decline`, {});
  },

  cancelSubAgentInvitation: async (invitationId: string): Promise<void> => {
    await apiClient.post(`/agency/sub-agent-invitations/${invitationId}/cancel`, {});
  },

  listPendingSubAgentInvitations: async (): Promise<
    Array<{
      id: string;
      inviteeId: string;
      proposedAgencyName: string;
      status: string;
      createdAt: string;
      invitee: { id: string; displayName: string; username: string | null; avatar: string | null; hakaId: string | null };
    }>
  > => {
    if (useMock) return [];
    const res = await apiClient.get('/agency/sub-agent-invitations/pending');
    return res.data ?? [];
  },

  /** Agent: hosts waiting for leave/change approval */
  listPendingHostChangeRequests: async (): Promise<
    Array<{
      id: string;
      userId: string;
      type: string;
      reason: string;
      toAgentId: string | null;
      createdAt: string;
      user: { id: string; displayName: string; username: string | null; avatar: string | null; hakaId?: string | null };
    }>
  > => {
    if (useMock) return [];
    const res = await apiClient.get('/agency/host-change-requests/pending');
    return res.data ?? [];
  },

  approveHostChangeRequest: async (requestId: string): Promise<void> => {
    await apiClient.post(`/agency/host-change-requests/${requestId}/approve`, {});
  },

  rejectHostChangeRequest: async (requestId: string, note?: string): Promise<void> => {
    await apiClient.post(`/agency/host-change-requests/${requestId}/reject`, { note: note ?? '' });
  },

  /** Get own agent application status */
  getMyAgentApplication: async (): Promise<{
    id: string; status: string; proposedName: string; note: string; createdAt: string;
  } | null> => {
    const res = await apiClient.get('/agency/my-agent-application');
    return res.data ?? null;
  },

  /** Earn Money tab — admin-managed learn promotion cards */
  getLearnPromotions: async (): Promise<AgencyLearnPromotion[]> => {
    if (useMock) return mockAgency.learnPromotions;
    const res = await apiClient.get('/agency/learn-promotions');
    return res.data as AgencyLearnPromotion[];
  },
};
