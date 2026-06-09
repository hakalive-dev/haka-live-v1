import { apiClient } from './client';
import { useMock } from './config';
import { mockActivitySummary, mockActivityChart, mockIncomeSummary, mockTopGifters } from './mock/activity';
import type {
  ActivitySummary,
  ActivityChartEntry,
  IncomeSummary,
  ActivitySummaryV2,
  IncomeSummaryV2,
  ActivityChartDataV2,
  LiveDataDaily,
  LiveDataMonthly,
  LiveDataWeekly,
  TopGifterEntry,
} from '../types';

export type ActivityPeriod = 'daily' | 'weekly' | 'monthly';

const MOCK_LIVE_DAILY: LiveDataDaily = {
  date: new Date().toISOString().slice(0, 10),
  won_points: 0,
  live_earnings: 0,
  party_earnings: 0,
  live_duration: '00:00:00',
  live_duration_seconds: 0,
  party_duration: '00:00:00',
  party_duration_seconds: 0,
  party_crown_duration: '00:00:00',
  party_crown_duration_seconds: 0,
  new_fans_count: 0,
  new_fans_club_count: 0,
  gifting_count: 0,
  unfollowers_count: 0,
};

const MOCK_LIVE_WEEKLY: LiveDataWeekly = {
  week_start: '2026-03-28',
  week_end: '2026-04-03',
  hakaId: '000000',
  chart: Array.from({ length: 7 }, (_, i) => ({
    label: `03-${28 + i}`,
    points: 0,
    duration_minutes: 0,
  })),
  total_duration: '00:00',
  total_earnings: 0,
  new_fans_count: 0,
  new_fans_club_count: 0,
  gifting_count: 0,
  unfollowers_count: 0,
};

const MOCK_LIVE_MONTHLY: LiveDataMonthly = {
  month_start: '2026-04-01',
  month_end: '2026-04-03',
  hakaId: '000000',
  chart: Array.from({ length: 3 }, (_, i) => ({
    label: `04-0${i + 1}`,
    points: 0,
    duration_minutes: 0,
  })),
  total_duration: '00:00',
  total_earnings: 0,
  past_3_months_earnings: 0,
};

export const activityApi = {
  /** Activity summary (coins spent, beans earned, gifts, room sessions) */
  getSummary: async (period: ActivityPeriod): Promise<ActivitySummary> => {
    if (useMock) return { ...mockActivitySummary, period };
    const res = await apiClient.get(`/activity/me?period=${period}`);
    const v2 = res.data as ActivitySummaryV2;
    // Map Node.js shape → existing ActivitySummary shape
    return {
      period: v2.period,
      coins_spent: v2.coinsSpent,
      beans_earned: v2.beansEarned,
      gifts_sent_count: v2.giftsSentCount,
      gifts_sent_value: 0,
      gifts_received_count: v2.giftsReceivedCount,
      gifts_received_value: 0,
      room_sessions: v2.roomSessionsCount,
      total_room_minutes: 0,
      followers_gained: 0,
      profile_visits: 0,
      rich_xp_gained: 0,
      charm_xp_gained: 0,
    };
  },

  /** Daily chart data for spending/earning */
  getChart: async (period: ActivityPeriod): Promise<ActivityChartEntry[]> => {
    if (useMock) return mockActivityChart;
    const res = await apiClient.get(`/activity/chart?period=${period}`);
    const v2 = res.data as ActivityChartDataV2;
    return v2.data.map((d) => ({
      label: d.date,
      coins_spent: d.coinsSpent,
      beans_earned: d.beansEarned,
      gifts_sent_count: 0,
      room_sessions: 0,
    }));
  },

  /** Income summary for hosts */
  getIncome: async (period: ActivityPeriod): Promise<IncomeSummary> => {
    if (useMock) return { ...mockIncomeSummary, period };
    const res = await apiClient.get(`/activity/income?period=${period}`);
    const v2 = res.data as IncomeSummaryV2;
    return {
      period: v2.period,
      total_beans_earned: v2.totalBeansEarned,
      total_gifts_received: v2.giftsReceivedCount,
      total_room_sessions: 0,
      total_room_minutes: 0,
      avg_listeners: 0,
      commission_earned: 0,
      chart: [],
    };
  },

  /** Top gifters for the current host */
  getTopGifters: async (period: ActivityPeriod): Promise<TopGifterEntry[]> => {
    if (useMock) return mockTopGifters;
    const res = await apiClient.get(`/activity/income?period=${period}`);
    const v2 = res.data as IncomeSummaryV2;
    return v2.topGifters.map((g) => ({
      user: {
        id: g.user.id,
        username: '',
        displayName: g.user.displayName,
        avatar: g.user.avatar,
      },
      total_coin_value: g.totalCoins,
      gift_count: g.count,
    }));
  },

  // ── Live Data (kept as-is — backend will add these later) ─────────────────

  getLiveDataDaily: async (_date?: string): Promise<LiveDataDaily> => {
    return MOCK_LIVE_DAILY;
  },

  getLiveDataWeekly: async (_weekOffset = 0): Promise<LiveDataWeekly> => {
    return MOCK_LIVE_WEEKLY;
  },

  getLiveDataMonthly: async (_monthOffset = 0): Promise<LiveDataMonthly> => {
    return MOCK_LIVE_MONTHLY;
  },
};
