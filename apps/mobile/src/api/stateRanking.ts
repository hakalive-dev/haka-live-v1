import { apiClient } from './client';

export type StateSubdivision = { code: string; name: string };

export type StateRankingHostPreview = {
  id: string;
  displayName: string;
  avatar: string | null;
  rank: number;
  score: number;
};

export type StateRankingRow = {
  rank: number;
  stateCode: string;
  stateName: string;
  totalGiftScore: number;
  poolReward: number;
  topHosts: StateRankingHostPreview[];
};

export type StateRankTier = {
  stateRankMin: number;
  stateRankMax: number;
  poolTotal: number;
};

export const stateRankingApi = {
  async getConfig(countryCode?: string) {
    const res = await apiClient.get('/leaderboard/state/config', {
      params: countryCode ? { countryCode } : undefined,
    });
    return res.data as {
      enabled: boolean;
      countryCode: string;
      states: StateSubdivision[];
      requireFaceVerification: boolean;
    };
  },

  async getStates(params?: { date?: string; countryCode?: string }) {
    const res = await apiClient.get('/leaderboard/state/states', { params });
    return res.data as {
      items: StateRankingRow[];
      dateKey: string;
      countryCode: string;
    };
  },

  async getSummary(params?: { date?: string; countryCode?: string }) {
    const res = await apiClient.get('/leaderboard/state/states/summary', { params });
    return res.data as {
      totalDailyPrizePool: number;
      activeStateCount: number;
      dateKey: string;
    };
  },

  async getMyState(date?: string) {
    const res = await apiClient.get('/leaderboard/state/me/state', {
      params: date ? { date } : undefined,
    });
    return res.data as {
      row: StateRankingRow | null;
      hasState: boolean;
      countryCode: string;
      dateKey: string;
    };
  },

  async getMyHostRank(date?: string) {
    const res = await apiClient.get('/leaderboard/state/me/host', {
      params: date ? { date } : undefined,
    });
    return res.data as { rank: number | null; score: number | null; eligible: boolean };
  },

  async getStateHosts(
    stateCode: string,
    params?: { page?: number; limit?: number; date?: string; countryCode?: string },
  ) {
    const res = await apiClient.get(`/leaderboard/state/states/${stateCode}/hosts`, { params });
    return res.data as {
      items: Array<{ rank: number; score: number; user: { id: string; displayName: string; avatar: string } }>;
      page: number;
      limit: number;
      hasMore: boolean;
      stateCode: string;
      countryCode: string;
    };
  },

  async getRewardsConfig() {
    const res = await apiClient.get('/leaderboard/state/rewards/config');
    return res.data as {
      hostSplitPercentages: number[];
      stateRankTiers: StateRankTier[];
      topHostsPerState: number;
    };
  },

  async suggestState(lat: number, lng: number) {
    const res = await apiClient.get('/leaderboard/state/suggest-state', {
      params: { lat, lng },
    });
    return res.data as { stateCode: string | null; stateName: string | null };
  },

  async getCanInspect() {
    const res = await apiClient.get('/leaderboard/state/can-inspect');
    return res.data as { canInspectStateRankings: boolean };
  },
};
