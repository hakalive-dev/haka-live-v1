import { apiClient } from './client';
import { useMock } from './config';
import {
  mockMyStateRow,
  mockStateHostsByCode,
  mockStateRankingRows,
  mockStateRankingSummary,
} from './mock/ranking';
import { INDIA_STATES } from '@haka-live/shared-types/state-rankings';

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
    if (useMock) {
      const code = countryCode?.toUpperCase() ?? 'IN';
      return {
        enabled: code === 'IN',
        countryCode: code,
        states: INDIA_STATES,
        requireFaceVerification: true,
      };
    }
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
    if (useMock) {
      return {
        items: mockStateRankingRows,
        dateKey: mockStateRankingSummary.dateKey,
        countryCode: params?.countryCode?.toUpperCase() ?? 'IN',
      };
    }
    const res = await apiClient.get('/leaderboard/state/states', { params });
    return res.data as {
      items: StateRankingRow[];
      dateKey: string;
      countryCode: string;
    };
  },

  async getSummary(params?: { date?: string; countryCode?: string }) {
    if (useMock) {
      return { ...mockStateRankingSummary };
    }
    const res = await apiClient.get('/leaderboard/state/states/summary', { params });
    return res.data as {
      totalDailyPrizePool: number;
      activeStateCount: number;
      dateKey: string;
    };
  },

  async getMyState(date?: string) {
    if (useMock) {
      return {
        row: mockMyStateRow,
        hasState: true,
        countryCode: 'IN',
        dateKey: mockStateRankingSummary.dateKey,
      };
    }
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
    if (useMock) {
      return { rank: 2, score: 268_000, eligible: true };
    }
    const res = await apiClient.get('/leaderboard/state/me/host', {
      params: date ? { date } : undefined,
    });
    return res.data as { rank: number | null; score: number | null; eligible: boolean };
  },

  async getStateHosts(
    stateCode: string,
    params?: { page?: number; limit?: number; date?: string; countryCode?: string },
  ) {
    if (useMock) {
      const code = stateCode.toUpperCase();
      const items = mockStateHostsByCode[code] ?? [];
      const page = params?.page ?? 1;
      const limit = params?.limit ?? 20;
      const start = (page - 1) * limit;
      const slice = items.slice(start, start + limit);
      return {
        items: slice,
        page,
        limit,
        hasMore: start + slice.length < items.length,
        stateCode: code,
        countryCode: params?.countryCode?.toUpperCase() ?? 'IN',
      };
    }
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
    if (useMock) {
      return { stateCode: 'TN', stateName: 'Tamil Nadu' };
    }
    const res = await apiClient.get('/leaderboard/state/suggest-state', {
      params: { lat, lng },
    });
    return res.data as { stateCode: string | null; stateName: string | null };
  },

  async getCanInspect() {
    if (useMock) {
      return { canInspectStateRankings: true };
    }
    const res = await apiClient.get('/leaderboard/state/can-inspect');
    return res.data as { canInspectStateRankings: boolean };
  },
};
