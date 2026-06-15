import {
  DEFAULT_STATE_RANK_REWARD_TIERS,
  poolForStateRank,
  totalDailyPrizePoolForStateCount,
} from '@haka-live/shared-types/state-rankings';
import type { LeaderboardUserEntry } from '@/types';
import type { LeaderboardWindow } from '../leaderboard';
import type { StateRankingHostPreview, StateRankingRow } from '../stateRanking';

const DATE_KEY = new Date().toISOString().slice(0, 10);

function avatar(seed: string): string {
  return `https://i.pravatar.cc/150?u=${seed}`;
}

function hostsForState(
  stateCode: string,
  scores: [number, number, number, number],
  names: [string, string, string, string],
): StateRankingHostPreview[] {
  return scores.map((score, i) => ({
    id: `sr-${stateCode.toLowerCase()}-h${i + 1}`,
    displayName: names[i],
    avatar: avatar(`${stateCode}_host_${i + 1}`),
    rank: i + 1,
    score,
  }));
}

/** Seven ranked states — top 3 on podium, ranks 4–7 in the list below. */
export const mockStateRankingRows: StateRankingRow[] = [
  {
    rank: 1,
    stateCode: 'MH',
    stateName: 'Maharashtra',
    totalGiftScore: 1_842_500,
    poolReward: poolForStateRank(1, DEFAULT_STATE_RANK_REWARD_TIERS),
    topHosts: hostsForState('MH', [720_000, 410_000, 285_000, 142_500], [
      'Priya Sharma',
      'Ananya Desai',
      'Kavya Nair',
      'Rhea Kapoor',
    ]),
  },
  {
    rank: 2,
    stateCode: 'KA',
    stateName: 'Karnataka',
    totalGiftScore: 1_356_200,
    poolReward: poolForStateRank(2, DEFAULT_STATE_RANK_REWARD_TIERS),
    topHosts: hostsForState('KA', [540_000, 318_000, 210_000, 98_200], [
      'Divya Reddy',
      'Meera Iyer',
      'Saanvi Rao',
      'Ishita Menon',
    ]),
  },
  {
    rank: 3,
    stateCode: 'TN',
    stateName: 'Tamil Nadu',
    totalGiftScore: 1_024_800,
    poolReward: poolForStateRank(3, DEFAULT_STATE_RANK_REWARD_TIERS),
    topHosts: hostsForState('TN', [425_000, 268_000, 186_000, 95_800], [
      'Lakshmi Venkat',
      'Keerthi Raj',
      'Nandini Pillai',
      'Harini S',
    ]),
  },
  {
    rank: 4,
    stateCode: 'UP',
    stateName: 'Uttar Pradesh',
    totalGiftScore: 782_400,
    poolReward: poolForStateRank(4, DEFAULT_STATE_RANK_REWARD_TIERS),
    topHosts: hostsForState('UP', [310_000, 198_000, 142_000, 72_400], [
      'Aisha Khan',
      'Pooja Singh',
      'Neha Verma',
      'Ritu Yadav',
    ]),
  },
  {
    rank: 5,
    stateCode: 'GJ',
    stateName: 'Gujarat',
    totalGiftScore: 645_100,
    poolReward: poolForStateRank(5, DEFAULT_STATE_RANK_REWARD_TIERS),
    topHosts: hostsForState('GJ', [265_000, 168_000, 118_000, 54_100], [
      'Heena Patel',
      'Jinal Shah',
      'Krupa Mehta',
      'Diya Joshi',
    ]),
  },
  {
    rank: 6,
    stateCode: 'WB',
    stateName: 'West Bengal',
    totalGiftScore: 518_600,
    poolReward: poolForStateRank(6, DEFAULT_STATE_RANK_REWARD_TIERS),
    topHosts: hostsForState('WB', [210_000, 132_000, 96_000, 48_600], [
      'Soma Das',
      'Ankita Bose',
      'Riya Ghosh',
      'Mou Banerjee',
    ]),
  },
  {
    rank: 7,
    stateCode: 'RJ',
    stateName: 'Rajasthan',
    totalGiftScore: 412_300,
    poolReward: poolForStateRank(7, DEFAULT_STATE_RANK_REWARD_TIERS),
    topHosts: hostsForState('RJ', [168_000, 104_000, 78_000, 38_300], [
      'Kiran Rathore',
      'Pallavi Singh',
      'Simran Devi',
      'Nisha Choudhary',
    ]),
  },
];

/** Full host leaderboard per state (State Queen screen). */
export const mockStateHostsByCode: Record<
  string,
  Array<{ rank: number; score: number; user: { id: string; displayName: string; avatar: string } }>
> = Object.fromEntries(
  mockStateRankingRows.map((row) => [
    row.stateCode,
    row.topHosts.map((h) => ({
      rank: h.rank,
      score: h.score,
      user: { id: h.id, displayName: h.displayName, avatar: h.avatar ?? '' },
    })),
  ]),
);

export const mockStateRankingSummary = {
  totalDailyPrizePool: totalDailyPrizePoolForStateCount(
    mockStateRankingRows.length,
    DEFAULT_STATE_RANK_REWARD_TIERS,
  ),
  activeStateCount: mockStateRankingRows.length,
  dateKey: DATE_KEY,
};

/** Default "my state" row for mock — Tamil Nadu, rank 3. */
export const mockMyStateRow: StateRankingRow = mockStateRankingRows[2]!;

const AGENT_COINS_BASE: LeaderboardUserEntry[] = [
  {
    rank: 1,
    score: 2_480_000,
    id: 'ag-r1',
    username: 'delhi_coins',
    displayName: 'Delhi Coin House',
    avatar: avatar('delhi_coins'),
    hakaId: 'HK301001',
    richLevel: 48,
    charmLevel: 12,
    stateCode: 'MH',
  },
  {
    rank: 2,
    score: 2_105_000,
    id: 'ag-r2',
    username: 'mumbai_exchange',
    displayName: 'Mumbai Exchange',
    avatar: avatar('mumbai_exchange'),
    hakaId: 'HK301002',
    richLevel: 42,
    charmLevel: 10,
    stateCode: 'KA',
  },
  {
    rank: 3,
    score: 1_890_000,
    id: 'ag-r3',
    username: 'bangalore_topup',
    displayName: 'Bangalore Top-Up',
    avatar: avatar('bangalore_topup'),
    hakaId: 'HK301003',
    richLevel: 38,
    charmLevel: 9,
    stateCode: 'TN',
  },
  {
    rank: 4,
    score: 1_245_000,
    id: 'ag-r4',
    username: 'chennai_seller',
    displayName: 'Chennai Coin Seller',
    avatar: avatar('chennai_seller'),
    hakaId: 'HK301004',
    richLevel: 31,
    charmLevel: 8,
    stateCode: 'UP',
  },
  {
    rank: 5,
    score: 980_000,
    id: 'ag-r5',
    username: 'hyderabad_agency',
    displayName: 'Hyderabad Agency',
    avatar: avatar('hyderabad_agency'),
    hakaId: 'HK301005',
    richLevel: 26,
    charmLevel: 7,
    stateCode: 'GJ',
  },
  {
    rank: 6,
    score: 720_000,
    id: 'ag-r6',
    username: 'kolkata_coins',
    displayName: 'Kolkata Coins',
    avatar: avatar('kolkata_coins'),
    hakaId: 'HK301006',
    richLevel: 21,
    charmLevel: 6,
    stateCode: 'WB',
  },
  {
    rank: 7,
    score: 545_000,
    id: 'ag-r7',
    username: 'pune_reseller',
    displayName: 'Pune Reseller',
    avatar: avatar('pune_reseller'),
    hakaId: 'HK301007',
    richLevel: 17,
    charmLevel: 5,
    stateCode: 'RJ',
  },
];

const ACTIVITY_HOSTS_BASE: LeaderboardUserEntry[] = [
  {
    rank: 1,
    score: 186_400,
    id: 'act-r1',
    username: 'rosa_queen',
    displayName: 'Rosa Martinez',
    avatar: avatar('rosa_queen'),
    hakaId: 'HK401001',
    richLevel: 22,
    charmLevel: 51,
  },
  {
    rank: 2,
    score: 152_800,
    id: 'act-r2',
    username: 'amara_live',
    displayName: 'Amara Okafor',
    avatar: avatar('amara_live'),
    hakaId: 'HK401002',
    richLevel: 18,
    charmLevel: 44,
  },
  {
    rank: 3,
    score: 128_600,
    id: 'act-r3',
    username: 'preeti_music',
    displayName: 'Preeti Sharma',
    avatar: avatar('preeti_music'),
    hakaId: 'HK401003',
    richLevel: 15,
    charmLevel: 39,
  },
  {
    rank: 4,
    score: 98_200,
    id: 'act-r4',
    username: 'kai_streams',
    displayName: 'Kai Rivera',
    avatar: avatar('kai_streams'),
    hakaId: 'HK401004',
    richLevel: 12,
    charmLevel: 34,
  },
  {
    rank: 5,
    score: 76_500,
    id: 'act-r5',
    username: 'luna_night',
    displayName: 'Luna Reyes',
    avatar: avatar('luna_night'),
    hakaId: 'HK401005',
    richLevel: 10,
    charmLevel: 29,
  },
  {
    rank: 6,
    score: 58_400,
    id: 'act-r6',
    username: 'echo_li',
    displayName: 'Echo Li',
    avatar: avatar('echo_li'),
    hakaId: 'HK401006',
    richLevel: 8,
    charmLevel: 24,
  },
  {
    rank: 7,
    score: 41_200,
    id: 'act-r7',
    username: 'nova_stage',
    displayName: 'Nova Petrov',
    avatar: avatar('nova_stage'),
    hakaId: 'HK401007',
    richLevel: 6,
    charmLevel: 19,
  },
];

function scaleUserBoard(entries: LeaderboardUserEntry[], factor: number): LeaderboardUserEntry[] {
  return entries.map((e) => ({ ...e, score: Math.round(e.score * factor) }));
}

const GAME_TOP_GAMER_BASE: LeaderboardUserEntry[] = [
  {
    rank: 1,
    score: 635_115_789,
    id: 'gm-r1',
    username: 'mahisha',
    displayName: 'Mahisha',
    avatar: avatar('mahisha'),
    hakaId: 'HK501001',
    richLevel: 59,
    charmLevel: 63,
  },
  {
    rank: 2,
    score: 604_115_789,
    id: 'gm-r2',
    username: 'piyush_vedha',
    displayName: 'Piyush Vedha',
    avatar: avatar('piyush_vedha'),
    hakaId: 'HK501002',
    richLevel: 65,
    charmLevel: 60,
  },
  {
    rank: 3,
    score: 604_115_789,
    id: 'gm-r3',
    username: 'neemu_devi',
    displayName: 'NEEMU DEVI',
    avatar: avatar('neemu_devi'),
    hakaId: 'HK501003',
    richLevel: 58,
    charmLevel: 55,
  },
  {
    rank: 4,
    score: 604_115_789,
    id: 'gm-r4',
    username: 'mahesh_dube',
    displayName: 'Mahesh Dube',
    avatar: avatar('mahesh_dube'),
    hakaId: 'HK501004',
    richLevel: 53,
    charmLevel: 50,
  },
  {
    rank: 5,
    score: 604_115_789,
    id: 'gm-r5',
    username: 'romil_sheta',
    displayName: 'Romil Sheta',
    avatar: avatar('romil_sheta'),
    hakaId: 'HK501005',
    richLevel: 53,
    charmLevel: 50,
  },
  {
    rank: 6,
    score: 604_115_789,
    id: 'gm-r6',
    username: 'game_host_6',
    displayName: 'Game Host 6',
    avatar: avatar('game_host_6'),
    hakaId: 'HK501006',
    richLevel: 48,
    charmLevel: 45,
  },
  {
    rank: 7,
    score: 604_115_789,
    id: 'gm-r7',
    username: 'game_host_7',
    displayName: 'Game Host 7',
    avatar: avatar('game_host_7'),
    hakaId: 'HK501007',
    richLevel: 44,
    charmLevel: 42,
  },
];

export const mockGameTopGamerRank = GAME_TOP_GAMER_BASE;
export const mockGameTeenPattiRank = scaleUserBoard(GAME_TOP_GAMER_BASE, 0.82);

export const mockAgentCoinsRank = AGENT_COINS_BASE;

export const mockActivityHostsRank: Record<LeaderboardWindow, LeaderboardUserEntry[]> = {
  daily: ACTIVITY_HOSTS_BASE,
  weekly: scaleUserBoard(ACTIVITY_HOSTS_BASE, 6.5),
  monthly: scaleUserBoard(ACTIVITY_HOSTS_BASE, 24),
};

export const mockActivityCreatorStats = {
  daily: {
    charmLevel: 37,
    charmXp: 2_450_000,
    nextLevelXp: 5_065_300,
    stars: 4,
    earnerScore: 76_500,
    earnerRank: 5,
  },
  weekly: {
    charmLevel: 37,
    charmXp: 2_450_000,
    nextLevelXp: 5_065_300,
    stars: 4,
    earnerScore: 497_250,
    earnerRank: 5,
  },
  monthly: {
    charmLevel: 38,
    charmXp: 2_680_000,
    nextLevelXp: 5_065_300,
    stars: 5,
    earnerScore: 1_836_000,
    earnerRank: 4,
  },
};
