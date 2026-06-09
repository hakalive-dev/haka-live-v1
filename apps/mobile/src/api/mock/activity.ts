import { ActivitySummary, ActivityChartEntry, IncomeSummary, TopGifterEntry } from '../../types';

export const mockActivitySummary: ActivitySummary = {
  period: 'daily',
  coins_spent: 4_250,
  beans_earned: 12_875,
  gifts_sent_count: 28,
  gifts_sent_value: 4_250,
  gifts_received_count: 47,
  gifts_received_value: 12_875,
  room_sessions: 5,
  total_room_minutes: 285,
  followers_gained: 38,
  profile_visits: 124,
  rich_xp_gained: 4_250,
  charm_xp_gained: 12_875,
};

export const mockActivityChart: ActivityChartEntry[] = [
  { label: '26 Mar', coins_spent: 1_400, beans_earned: 4_280, gifts_sent_count: 8,  room_sessions: 3 },
  { label: '27 Mar', coins_spent: 650,   beans_earned: 1_950, gifts_sent_count: 4,  room_sessions: 2 },
  { label: '28 Mar', coins_spent: 3_800, beans_earned: 8_560, gifts_sent_count: 18, room_sessions: 4 },
  { label: '29 Mar', coins_spent: 200,   beans_earned: 900,   gifts_sent_count: 2,  room_sessions: 1 },
  { label: '30 Mar', coins_spent: 2_100, beans_earned: 6_210, gifts_sent_count: 12, room_sessions: 3 },
  { label: '31 Mar', coins_spent: 3_600, beans_earned: 9_420, gifts_sent_count: 16, room_sessions: 4 },
  { label: '1 Apr',  coins_spent: 4_250, beans_earned: 12_875, gifts_sent_count: 28, room_sessions: 5 },
];

export const mockIncomeSummary: IncomeSummary = {
  period: 'weekly',
  total_beans_earned: 44_195,
  total_gifts_received: 156,
  total_room_sessions: 22,
  total_room_minutes: 1_480,
  avg_listeners: 87,
  commission_earned: 0,
  chart: [
    { label: '26 Mar', beans_earned: 4_280,  gifts_received: 18 },
    { label: '27 Mar', beans_earned: 1_950,  gifts_received: 9 },
    { label: '28 Mar', beans_earned: 8_560,  gifts_received: 32 },
    { label: '29 Mar', beans_earned: 900,    gifts_received: 4 },
    { label: '30 Mar', beans_earned: 6_210,  gifts_received: 24 },
    { label: '31 Mar', beans_earned: 9_420,  gifts_received: 36 },
    { label: '1 Apr',  beans_earned: 12_875, gifts_received: 33 },
  ],
};

export const mockTopGifters: TopGifterEntry[] = [
  { user: { id: 'lg1', username: 'diamond_dan',   displayName: 'Daniel Kim',       avatar: 'https://i.pravatar.cc/150?u=diamond_dan' },    total_coin_value: 15_200, gift_count: 34 },
  { user: { id: 'lg2', username: 'sultan_gold',   displayName: 'Sultan Al-Rashid', avatar: 'https://i.pravatar.cc/150?u=sultan_gold' },    total_coin_value: 9_800,  gift_count: 18 },
  { user: { id: 'lg3', username: 'maria_gifts',   displayName: 'Maria Santos',     avatar: 'https://i.pravatar.cc/150?u=maria_gifts' },    total_coin_value: 6_200,  gift_count: 22 },
  { user: { id: 'lg5', username: 'lucky_luna',    displayName: 'Luna Nguyen',      avatar: 'https://i.pravatar.cc/150?u=lucky_luna' },     total_coin_value: 4_800,  gift_count: 45 },
  { user: { id: 'lg7', username: 'fire_chen',     displayName: 'Chen Hao',         avatar: 'https://i.pravatar.cc/150?u=fire_chen' },      total_coin_value: 2_600,  gift_count: 12 },
  { user: { id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', username: 'omar_beats', displayName: 'Omar Hassan', avatar: 'https://i.pravatar.cc/150?u=omar_beats' }, total_coin_value: 1_800, gift_count: 8 },
  { user: { id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', username: 'yuki_chan',  displayName: 'Yuki Tanaka', avatar: 'https://i.pravatar.cc/150?u=yuki_chan' },  total_coin_value: 1_200, gift_count: 15 },
];
