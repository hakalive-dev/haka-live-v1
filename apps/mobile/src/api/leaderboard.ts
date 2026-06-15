import { apiClient } from './client';
import { useMock } from './config';
import { mockFans, mockLeaderboard } from './mock/leaderboard';
import {
  mockActivityCreatorStats,
  mockActivityHostsRank,
  mockAgentCoinsRank,
  mockGameTeenPattiRank,
  mockGameTopGamerRank,
} from './mock/ranking';
import type { LeaderboardUserEntry, LeaderboardFamilyEntry, MyRankResult, EquippedCosmetic } from '../types';

export type LeaderboardWindow   = 'daily' | 'weekly' | 'monthly';
export type LeaderboardCategory = 'gifters' | 'hosts' | 'earners' | 'rich' | 'charm'
  | 'agent_income' | 'agent_reward'
  | 'game_top' | 'game_winner' | 'activity_agency' | 'activity_host'
  | 'creator_income' | 'creator_amount'
  | 'agent_coins' | 'creator_hosts';

export interface FanEntry {
  rank: number;
  coinsGifted: number;
  user: {
    id: string;
    displayName: string;
    avatar: string | null;
    hakaId: string | null;
    activeSpecialId: string | null;
    activeSpecialIdLevel: string | null;
  } | null;
}

export interface CreatorStats {
  charmLevel: number;
  charmXp: number;
  nextLevelXp: number;
  stars: number;
  earnerScore: number;
  earnerRank: number | null;
}

interface BackendLeaderboardItem {
  rank: number;
  score: number;
  user: {
    id: string;
    username: string | null;
    displayName: string;
    avatar: string | null;
    hakaId?: string | null;
    equippedFrame?: EquippedCosmetic | null;
    activeSpecialId?: string | null;
    richLevel?: number | null;
    charmLevel?: number | null;
  };
}

/** Convert Node.js leaderboard item (nested user) to flat LeaderboardUserEntry */
/** Flat coin-seller rank row from GET /leaderboard/coin_sellers */
interface CoinSellerRankItem {
  rank: number;
  score: number | string | bigint;
  id: string;
  username: string | null;
  displayName: string;
  avatar: string | null;
  hakaId?: string | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  richLevel?: number | null;
  charmLevel?: number | null;
}

function flattenCoinSellerItem(item: CoinSellerRankItem): LeaderboardUserEntry {
  return {
    rank: item.rank,
    score: Number(item.score),
    id: item.id,
    username: item.username,
    displayName: item.displayName,
    avatar: item.avatar,
    hakaId: item.hakaId ?? null,
    equippedFrame: null,
    activeSpecialId: item.activeSpecialId ?? null,
    richLevel: item.richLevel ?? null,
    charmLevel: item.charmLevel ?? null,
  };
}

function flattenEntry(item: BackendLeaderboardItem): LeaderboardUserEntry {
  return {
    rank: item.rank,
    score: item.score,
    id: item.user.id,
    username: item.user.username,
    displayName: item.user.displayName,
    avatar: item.user.avatar,
    hakaId: item.user.hakaId ?? null,
    equippedFrame: item.user.equippedFrame ?? null,
    activeSpecialId: item.user.activeSpecialId ?? null,
    richLevel: item.user.richLevel ?? null,
    charmLevel: item.user.charmLevel ?? null,
  };
}

// Maps each frontend category to its backend endpoint + which period field to use
const CATEGORY_ENDPOINT: Record<LeaderboardCategory, string> = {
  gifters:         '/leaderboard/gifters',
  earners:         '/leaderboard/earners',
  rich:            '/leaderboard/rich',
  charm:           '/leaderboard/charm',
  hosts:           '/leaderboard/earners',
  agent_income:    '/leaderboard/earners',
  agent_reward:    '/leaderboard/gifters',
  game_top:        '/leaderboard/gifters',
  game_winner:     '/leaderboard/earners',
  activity_agency: '/leaderboard/agency',
  activity_host:   '/leaderboard/earners',
  creator_income:  '/leaderboard/earners',
  creator_amount:  '/leaderboard/gifters',
  agent_coins:     '/leaderboard/coin_sellers',
  creator_hosts:   '/leaderboard/creators',
};

// Categories that support period param (rich/charm are all-time sorted sets)
const PERIOD_SUPPORTED = new Set<LeaderboardCategory>([
  'gifters', 'earners', 'hosts', 'agent_income', 'agent_reward',
  'game_top', 'game_winner', 'activity_agency', 'activity_host',
  'creator_income', 'creator_amount', 'creator_hosts',
]);

export const leaderboardApi = {
  async getGifters(window: LeaderboardWindow = 'daily'): Promise<LeaderboardUserEntry[]> {
    if (useMock) return mockLeaderboard.gifters[window];
    const res = await apiClient.get('/leaderboard/gifters', { params: { period: window } });
    return (res.data.items as Parameters<typeof flattenEntry>[0][]).map(flattenEntry);
  },

  async getHosts(window: LeaderboardWindow = 'daily'): Promise<LeaderboardUserEntry[]> {
    if (useMock) return mockLeaderboard.hosts[window];
    const res = await apiClient.get('/leaderboard/earners', { params: { period: window } });
    return (res.data.items as Parameters<typeof flattenEntry>[0][]).map(flattenEntry);
  },

  async getFamilies(_window: LeaderboardWindow = 'daily'): Promise<LeaderboardFamilyEntry[]> {
    if (useMock) return mockLeaderboard.families[_window];
    return [];
  },

  async getGameRank(mode: 'top_gamer' | 'teen_patti' = 'top_gamer'): Promise<LeaderboardUserEntry[]> {
    if (useMock) {
      return mode === 'teen_patti' ? mockGameTeenPattiRank : mockGameTopGamerRank;
    }
    const endpoint = mode === 'teen_patti' ? '/leaderboard/earners' : '/leaderboard/gifters';
    const res = await apiClient.get(endpoint, { params: { period: 'monthly' } });
    return (res.data.items as Parameters<typeof flattenEntry>[0][]).map(flattenEntry);
  },

  async getAgentCoinsRank(stateCode?: string): Promise<LeaderboardUserEntry[]> {
    if (useMock) {
      const normalized = stateCode?.trim().toUpperCase();
      const filtered = normalized
        ? mockAgentCoinsRank.filter((row) => row.stateCode === normalized)
        : mockAgentCoinsRank;
      return filtered.map((row, index) => ({ ...row, rank: index + 1 }));
    }
    const res = await apiClient.get('/leaderboard/coin_sellers', {
      params: stateCode ? { stateCode } : undefined,
    });
    const items = (res.data.items ?? res.data) as CoinSellerRankItem[];
    return items.map(flattenCoinSellerItem);
  },

  async getByCategory(category: LeaderboardCategory, window: LeaderboardWindow = 'daily'): Promise<LeaderboardUserEntry[]> {
    if (useMock) {
      if (category === 'creator_hosts') return mockActivityHostsRank[window];
      if (category === 'agent_coins') return mockAgentCoinsRank;
      const isEarnerCategory = ['earners', 'hosts', 'agent_income', 'activity_agency', 'activity_host', 'game_winner', 'charm', 'creator_income', 'creator_hosts'].includes(category);
      return isEarnerCategory ? mockLeaderboard.hosts[window] : mockLeaderboard.gifters[window];
    }
    if (category === 'agent_coins') {
      return this.getAgentCoinsRank();
    }
    const endpoint = CATEGORY_ENDPOINT[category];
    if (!endpoint) return [];
    const params = PERIOD_SUPPORTED.has(category) ? { period: window } : undefined;
    const res = await apiClient.get(endpoint, { params });
    return (res.data.items as Parameters<typeof flattenEntry>[0][]).map(flattenEntry);
  },

  async getRichLeaderboard(): Promise<LeaderboardUserEntry[]> {
    if (useMock) return mockLeaderboard.hosts.daily;
    const res = await apiClient.get('/leaderboard/rich');
    return (res.data.items as Parameters<typeof flattenEntry>[0][]).map(flattenEntry);
  },

  async getCharmLeaderboard(): Promise<LeaderboardUserEntry[]> {
    if (useMock) return mockLeaderboard.gifters.daily;
    const res = await apiClient.get('/leaderboard/charm');
    return (res.data.items as Parameters<typeof flattenEntry>[0][]).map(flattenEntry);
  },

  async getMyRichRank(): Promise<MyRankResult> {
    if (useMock) return { rank: 42, score: 2500 };
    const res = await apiClient.get('/leaderboard/rich/me');
    return res.data as MyRankResult;
  },

  async getMyCharmRank(): Promise<MyRankResult> {
    if (useMock) return { rank: 31, score: 1800 };
    const res = await apiClient.get('/leaderboard/charm/me');
    return res.data as MyRankResult;
  },

  async getMyEarnerRank(period: LeaderboardWindow = 'daily'): Promise<MyRankResult> {
    if (useMock) return { rank: 15, score: 45000 };
    const res = await apiClient.get('/leaderboard/earners/me', { params: { period } });
    return res.data as MyRankResult;
  },

  async getMyGifterRank(period: LeaderboardWindow = 'daily'): Promise<MyRankResult> {
    if (useMock) return { rank: 22, score: 12000 };
    const res = await apiClient.get('/leaderboard/gifters/me', { params: { period } });
    return res.data as MyRankResult;
  },

  async getFans(
    userId: string,
    period: LeaderboardWindow = 'daily',
    limit?: number,
  ): Promise<FanEntry[]> {
    if (useMock) {
      const rows = mockFans[period] ?? mockFans.daily;
      return limit != null ? rows.slice(0, limit) : rows;
    }
    const res = await apiClient.get(`/leaderboard/fans/${userId}`, {
      params: { period, ...(limit != null ? { limit } : {}) },
    });
    return res.data.fans as FanEntry[];
  },

  async getCreatorStats(period: LeaderboardWindow = 'daily'): Promise<CreatorStats> {
    if (useMock) return mockActivityCreatorStats[period];
    const res = await apiClient.get('/leaderboard/creator/me', { params: { period } });
    return res.data as CreatorStats;
  },
};
