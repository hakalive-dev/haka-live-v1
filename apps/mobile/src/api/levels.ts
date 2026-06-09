import { apiClient } from './client';
import { useMock } from './config';
import type { LevelLeaderboardEntry, LevelTiersResponse, UserLevelInfo } from '../types';

const mockLevel: UserLevelInfo = {
  richLevel: 5,
  richXp: 12_500,
  richNextThreshold: 21_600,
  charmLevel: 5,
  charmXp: 12_500,
  charmNextThreshold: 21_600,
  updatedAt: new Date().toISOString(),
};

function buildMockTiers(): LevelTiersResponse {
  const tiers: LevelTiersResponse['tiers'] = [
    { label: 'Level 0',      coinsRange: '0 - 5k',                iconLevel: 0,   minLevel: 0,   maxLevel: 0,   isSuper: false },
    { label: 'Level 1-5',    coinsRange: '5k - 85.2k',            iconLevel: 5,   minLevel: 1,   maxLevel: 5,   isSuper: false },
    { label: 'Level 6-10',   coinsRange: '85.2k - 348.8k',        iconLevel: 10,  minLevel: 6,   maxLevel: 10,  isSuper: false },
    { label: 'Level 11-15',  coinsRange: '348.8k - 1.8637M',      iconLevel: 15,  minLevel: 11,  maxLevel: 15,  isSuper: false },
    { label: 'Level 16-20',  coinsRange: '1.8637M - 6.2418M',     iconLevel: 20,  minLevel: 16,  maxLevel: 20,  isSuper: false },
    { label: 'Level 21-25',  coinsRange: '6.2418M - 20.9744M',    iconLevel: 25,  minLevel: 21,  maxLevel: 25,  isSuper: false },
    { label: 'Level 26-30',  coinsRange: '20.9744M - 58.857M',    iconLevel: 30,  minLevel: 26,  maxLevel: 30,  isSuper: false },
    { label: 'Level 31-35',  coinsRange: '58.857M - 153.1209M',   iconLevel: 35,  minLevel: 31,  maxLevel: 35,  isSuper: false },
    { label: 'Level 36-40',  coinsRange: '153.1209M - 372.7015M', iconLevel: 40,  minLevel: 36,  maxLevel: 40,  isSuper: false },
    { label: 'Level 41-45',  coinsRange: '372.7015M - 753.4038M', iconLevel: 45,  minLevel: 41,  maxLevel: 45,  isSuper: false },
    { label: 'Level 46-50',  coinsRange: '753.4038M - 1700M',     iconLevel: 50,  minLevel: 46,  maxLevel: 50,  isSuper: false },
    { label: 'Level 51-55',  coinsRange: '1700M - 2950M',         iconLevel: 55,  minLevel: 51,  maxLevel: 55,  isSuper: false },
    { label: 'Level 56-60',  coinsRange: '2950M - 4250M',         iconLevel: 60,  minLevel: 56,  maxLevel: 60,  isSuper: false },
    { label: 'Level 61-65',  coinsRange: '4250M - 5750M',         iconLevel: 65,  minLevel: 61,  maxLevel: 65,  isSuper: false },
    { label: 'Level 66-70',  coinsRange: '5750M - 7300M',         iconLevel: 70,  minLevel: 66,  maxLevel: 70,  isSuper: false },
    { label: 'Level 71-75',  coinsRange: '7300M - 9100M',         iconLevel: 75,  minLevel: 71,  maxLevel: 75,  isSuper: false },
    { label: 'Level 76-80',  coinsRange: '9100M - 11150M',        iconLevel: 80,  minLevel: 76,  maxLevel: 80,  isSuper: false },
    { label: 'Level 81-85',  coinsRange: '11150M - 13450M',       iconLevel: 85,  minLevel: 81,  maxLevel: 85,  isSuper: false },
    { label: 'Level 86-90',  coinsRange: '13450M - 16000M',       iconLevel: 90,  minLevel: 86,  maxLevel: 90,  isSuper: false },
    { label: 'Level 91-95',  coinsRange: '16000M - 18800M',       iconLevel: 95,  minLevel: 91,  maxLevel: 95,  isSuper: false },
    { label: 'Level 96-100', coinsRange: '18800M - 21850M',       iconLevel: 100, minLevel: 96,  maxLevel: 99,  isSuper: false },
    { label: 'Super Level',  coinsRange: '21850M+',               iconLevel: 100, minLevel: 100, maxLevel: 100, isSuper: true  },
  ];
  return { tiers, charmTiers: tiers, maxLevel: 100 };
}

export const levelsApi = {
  getMyLevel: async (): Promise<UserLevelInfo> => {
    if (useMock) return mockLevel;
    const res = await apiClient.get('/levels/me');
    return res.data;
  },

  getUserLevel: async (userId: string): Promise<UserLevelInfo> => {
    if (useMock) return mockLevel;
    const res = await apiClient.get(`/levels/user/${userId}`);
    return res.data;
  },

  getTiers: async (): Promise<LevelTiersResponse> => {
    if (useMock) return buildMockTiers();
    const res = await apiClient.get('/levels/tiers');
    return res.data;
  },

  getRichLeaderboard: async (): Promise<LevelLeaderboardEntry[]> => {
    if (useMock) return [];
    const res = await apiClient.get('/levels/leaderboard/rich');
    return res.data;
  },

  getCharmLeaderboard: async (): Promise<LevelLeaderboardEntry[]> => {
    if (useMock) return [];
    const res = await apiClient.get('/levels/leaderboard/charm');
    return res.data;
  },
};
