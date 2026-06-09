import type { LeaderboardUserEntry, LeaderboardFamilyEntry } from '@/types';
import type { FanEntry, LeaderboardWindow } from '../leaderboard';

const GIFTERS_DAILY: LeaderboardUserEntry[] = [
  { rank: 1,  score: 98_500, id: 'lg1',  username: 'diamond_dan',    displayName: 'Daniel Kim',       avatar: 'https://i.pravatar.cc/150?u=diamond_dan',    hakaId: 'HK201001', richLevel: 42, charmLevel: 38 },
  { rank: 2,  score: 75_200, id: 'lg2',  username: 'sultan_gold',    displayName: 'Sultan Al-Rashid', avatar: 'https://i.pravatar.cc/150?u=sultan_gold',    hakaId: 'HK201002', richLevel: 35, charmLevel: 30 },
  { rank: 3,  score: 61_000, id: 'lg3',  username: 'maria_gifts',    displayName: 'Maria Santos',     avatar: 'https://i.pravatar.cc/150?u=maria_gifts',    hakaId: 'HK201003', richLevel: 28, charmLevel: 25 },
  { rank: 4,  score: 44_800, id: 'lg4',  username: 'coin_empress',   displayName: 'Fatima Zahra',     avatar: 'https://i.pravatar.cc/150?u=coin_empress',   hakaId: 'HK201004', richLevel: 21, charmLevel: 18 },
  { rank: 5,  score: 38_200, id: 'lg5',  username: 'lucky_luna',     displayName: 'Luna Nguyen',      avatar: 'https://i.pravatar.cc/150?u=lucky_luna',     hakaId: 'HK201005', richLevel: 17, charmLevel: 14 },
  { rank: 6,  score: 31_100, id: 'lg6',  username: 'prestige_paul',  displayName: 'Paul Okonkwo',     avatar: 'https://i.pravatar.cc/150?u=prestige_paul',  hakaId: 'HK201006', richLevel: 12, charmLevel: 10 },
  { rank: 7,  score: 25_400, id: 'lg7',  username: 'fire_chen',      displayName: 'Chen Hao',         avatar: 'https://i.pravatar.cc/150?u=fire_chen',      hakaId: 'HK201007', richLevel: 9,  charmLevel: 7  },
  { rank: 8,  score: 19_200, id: 'lg8',  username: 'nova_gift',      displayName: 'Nova Petrov',      avatar: 'https://i.pravatar.cc/150?u=nova_gift',      hakaId: 'HK201008', richLevel: 6,  charmLevel: 5  },
  { rank: 9,  score: 12_800, id: 'lg9',  username: 'jewel_priya',    displayName: 'Priya Mehta',      avatar: 'https://i.pravatar.cc/150?u=jewel_priya',    hakaId: 'HK201009', richLevel: 4,  charmLevel: 3  },
  { rank: 10, score: 9_100,  id: 'lg10', username: 'ace_marcus',     displayName: 'Marcus Williams',  avatar: 'https://i.pravatar.cc/150?u=ace_marcus',     hakaId: 'HK201010', richLevel: 2,  charmLevel: 1  },
];

const HOSTS_DAILY: LeaderboardUserEntry[] = [
  { rank: 1,  score: 120_000, id: 'lh1',  username: 'rosa_queen',    displayName: 'Rosa Martinez',    avatar: 'https://i.pravatar.cc/150?u=rosa_queen',     hakaId: 'HK110234', richLevel: 50, charmLevel: 45 },
  { rank: 2,  score: 98_400,  id: 'lh2',  username: 'amara_live',    displayName: 'Amara Okafor',     avatar: 'https://i.pravatar.cc/150?u=amara_live',     hakaId: 'HK294817', richLevel: 40, charmLevel: 36 },
  { rank: 3,  score: 84_200,  id: 'lh3',  username: 'preeti_music',  displayName: 'Preeti Sharma',    avatar: 'https://i.pravatar.cc/150?u=preeti_music',   hakaId: 'HK472036', richLevel: 33, charmLevel: 29 },
  { rank: 4,  score: 72_100,  id: 'lh4',  username: 'kai_streams',   displayName: 'Kai Rivera',       avatar: 'https://i.pravatar.cc/150?u=kai_streams',    hakaId: 'HK381924', richLevel: 26, charmLevel: 22 },
  { rank: 5,  score: 61_500,  id: 'lh5',  username: 'luna_night',    displayName: 'Luna Reyes',       avatar: 'https://i.pravatar.cc/150?u=luna_night',     hakaId: 'HK789012', richLevel: 20, charmLevel: 17 },
  { rank: 6,  score: 53_000,  id: 'lh6',  username: 'echo_li',       displayName: 'Echo Li',          avatar: 'https://i.pravatar.cc/150?u=echo_li',        hakaId: 'HK302011', richLevel: 15, charmLevel: 12 },
  { rank: 7,  score: 44_400,  id: 'lh7',  username: 'nova_stage',    displayName: 'Nova Petrov',      avatar: 'https://i.pravatar.cc/150?u=nova_stage',     hakaId: 'HK302012', richLevel: 11, charmLevel: 9  },
  { rank: 8,  score: 36_800,  id: 'lh8',  username: 'zara_fm',       displayName: 'Zara Ibrahim',     avatar: 'https://i.pravatar.cc/150?u=zara_fm',        hakaId: 'HK302013', richLevel: 8,  charmLevel: 6  },
  { rank: 9,  score: 28_200,  id: 'lh9',  username: 'sky_radio',     displayName: 'Sky Thompson',     avatar: 'https://i.pravatar.cc/150?u=sky_radio',      hakaId: 'HK302014', richLevel: 5,  charmLevel: 4  },
  { rank: 10, score: 19_900,  id: 'lh10', username: 'vibe_zone',     displayName: 'Vibe Zone',        avatar: 'https://i.pravatar.cc/150?u=vibe_zone',      hakaId: 'HK302015', richLevel: 3,  charmLevel: 2  },
];

const FAMILIES_DAILY: LeaderboardFamilyEntry[] = [
  { rank: 1,  score: 580_000, id: 'lf1',  name: 'Golden Phoenix',  badge_icon: '🔥', tier: 'gold',   member_count: 48 },
  { rank: 2,  score: 440_000, id: 'lf2',  name: 'Silver Wolves',   badge_icon: '🐺', tier: 'gold',   member_count: 35 },
  { rank: 3,  score: 310_000, id: 'lf3',  name: 'Dragon Empire',   badge_icon: '🐉', tier: 'silver', member_count: 29 },
  { rank: 4,  score: 210_000, id: 'lf4',  name: 'Star Alliance',   badge_icon: '⭐', tier: 'silver', member_count: 22 },
  { rank: 5,  score: 145_000, id: 'lf5',  name: 'Crown Royale',    badge_icon: '👑', tier: 'silver', member_count: 18 },
  { rank: 6,  score: 88_000,  id: 'lf6',  name: 'Night Owls',      badge_icon: '🦉', tier: 'bronze', member_count: 14 },
  { rank: 7,  score: 62_000,  id: 'lf7',  name: 'Lunar Crew',      badge_icon: '🌙', tier: 'bronze', member_count: 11 },
  { rank: 8,  score: 41_000,  id: 'lf8',  name: 'Wave Riders',     badge_icon: '🌊', tier: 'bronze', member_count: 9  },
  { rank: 9,  score: 28_000,  id: 'lf9',  name: 'Neon Tribe',      badge_icon: '💜', tier: 'bronze', member_count: 7  },
  { rank: 10, score: 14_000,  id: 'lf10', name: 'Nova Fam',        badge_icon: '✨', tier: 'bronze', member_count: 5  },
];

function scaleEntries<T extends { score: number }>(entries: T[], factor: number): T[] {
  return entries.map((e) => ({ ...e, score: Math.round(e.score * factor) }));
}

type UserBoards   = Record<LeaderboardWindow, LeaderboardUserEntry[]>;
type FamilyBoards = Record<LeaderboardWindow, LeaderboardFamilyEntry[]>;

const MOCK_FANS_BASE: FanEntry[] = [
  {
    rank: 1,
    coinsGifted: 199_999,
    user: {
      id: 'fan1',
      displayName: 'Monalisa',
      avatar: 'https://i.pravatar.cc/150?u=monalisa_fan',
      hakaId: 'HK901001',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
  {
    rank: 2,
    coinsGifted: 173_456,
    user: {
      id: 'fan2',
      displayName: 'Malik Mason',
      avatar: 'https://i.pravatar.cc/150?u=malik_mason',
      hakaId: 'HK901002',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
  {
    rank: 3,
    coinsGifted: 133_456,
    user: {
      id: 'fan3',
      displayName: 'Sara Lin',
      avatar: 'https://i.pravatar.cc/150?u=sara_fan',
      hakaId: 'HK901003',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
  {
    rank: 4,
    coinsGifted: 123_956,
    user: {
      id: 'fan4',
      displayName: 'Malik Mason',
      avatar: 'https://i.pravatar.cc/150?u=malik_m4',
      hakaId: 'HK901004',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
  {
    rank: 5,
    coinsGifted: 98_200,
    user: {
      id: 'fan5',
      displayName: 'Kai Rivera',
      avatar: 'https://i.pravatar.cc/150?u=kai_fan',
      hakaId: 'HK901005',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
  {
    rank: 6,
    coinsGifted: 76_400,
    user: {
      id: 'fan6',
      displayName: 'Yuki Tanaka',
      avatar: 'https://i.pravatar.cc/150?u=yuki_fan',
      hakaId: 'HK901006',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
  {
    rank: 7,
    coinsGifted: 54_100,
    user: {
      id: 'fan7',
      displayName: 'Aisha Malik',
      avatar: 'https://i.pravatar.cc/150?u=aisha_fan',
      hakaId: 'HK901007',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
  {
    rank: 8,
    coinsGifted: 41_800,
    user: {
      id: 'fan8',
      displayName: 'Leo Stone',
      avatar: 'https://i.pravatar.cc/150?u=leo_fan',
      hakaId: 'HK901008',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
    },
  },
];

function scaleFans(entries: FanEntry[], factor: number): FanEntry[] {
  return entries.map((e) => ({
    ...e,
    coinsGifted: Math.round(e.coinsGifted * factor),
  }));
}

export const mockFans: Record<LeaderboardWindow, FanEntry[]> = {
  daily: MOCK_FANS_BASE,
  weekly: scaleFans(MOCK_FANS_BASE, 2.5),
  monthly: scaleFans(MOCK_FANS_BASE, 8),
};

export const mockLeaderboard = {
  gifters: {
    daily:   GIFTERS_DAILY,
    weekly:  scaleEntries(GIFTERS_DAILY, 6.5)  as LeaderboardUserEntry[],
    monthly: scaleEntries(GIFTERS_DAILY, 24)   as LeaderboardUserEntry[],
  } as UserBoards,

  hosts: {
    daily:   HOSTS_DAILY,
    weekly:  scaleEntries(HOSTS_DAILY, 6.5)    as LeaderboardUserEntry[],
    monthly: scaleEntries(HOSTS_DAILY, 24)     as LeaderboardUserEntry[],
  } as UserBoards,

  families: {
    daily:   FAMILIES_DAILY,
    weekly:  scaleEntries(FAMILIES_DAILY, 6.5) as LeaderboardFamilyEntry[],
    monthly: scaleEntries(FAMILIES_DAILY, 24)  as LeaderboardFamilyEntry[],
  } as FamilyBoards,
};
