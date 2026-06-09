import type {
  AgencySummary,
  AgencySummaryV2,
  AgencyDailyAnalytics,
  AgencyHost,
  AgencyLearnPromotion,
  HostStatEntry,
  HostTask,
} from '@/types';

export const mockAgency = {
  summary: {
    commission_tier: 3,
    commission_rate: 16,
    total_xp: 74_500,
    xp_to_next_tier: 25_500,
    total_hosts: 6,
    total_beans_earned_today: 4_280,
    total_commission_earned_today: 514,
    total_beans_earned_week: 28_400,
    total_commission_earned_week: 3_408,
    total_beans_earned_month: 118_200,
    total_commission_earned_month: 14_184,
    total_commission_all_time: 68_450,
    tier_name: 'D',
    effective_commission_rate: 0.16,
    cumulative_host_income: '30134554',
    agency_pot_balance: '316999',
    current_tier: { name: 'D', commissionRate: 0.16, minHostIncome: '8000000' },
    next_tier: { name: 'E', commissionRate: 0.20, minHostIncome: '150000000' },
    all_tiers: [
      { name: 'A', commissionRate: 0.04, minHostIncome: '0' },
      { name: 'B', commissionRate: 0.08, minHostIncome: '2000000' },
      { name: 'C', commissionRate: 0.12, minHostIncome: '10000000' },
      { name: 'D', commissionRate: 0.16, minHostIncome: '50000000' },
      { name: 'E', commissionRate: 0.20, minHostIncome: '150000000' },
    ],
  } as AgencySummary,

  summaryV2: {
    commissionTier: { name: 'D', commissionRate: 0.16 },
    totalHosts: 6,
    weeklyBeans: 28_400,
    weeklyCommission: 3_408,
    allTimeCommission: 68_450,
    todayBeans: 4_280,
    yesterdayBeans: 3_920,
    sameDayLastWeekBeans: 3_100,
    todayCommission: 514,
    monthCommission: 14_184,
    directCommissionAllTime: 58_200,
    inviteAgentCommissionAllTime: 10_250,
    cumulativeHostIncome: '30134554',
    agencyPotBalance: '316999',
    effectiveCommissionRate: 0.16,
    effectiveGiftBonusRate: 0.1,
    giftBonusProgramEnabled: true,
    giftBonusEnabled: true,
    rollingSevenDayAgencyHostIncome: '350000',
    rollingThirtyDayAgencyHostIncome: '698',
    rollingThirtyDayWindowStart: new Date(Date.now() - 30 * 86400000).toISOString(),
    rollingThirtyDayWindowEnd: new Date().toISOString(),
    currentGiftBonusTier: { name: 'Tier3', bonusRate: 0.10, minRollingIncome: '300000' },
    nextGiftBonusTier: { name: 'Tier4', bonusRate: 0.15, minRollingIncome: '500000' },
    allGiftBonusTiers: [
      { name: 'Tier1', bonusRate: 0, minRollingIncome: '0' },
      { name: 'Tier2', bonusRate: 0.05, minRollingIncome: '200000' },
      { name: 'Tier3', bonusRate: 0.10, minRollingIncome: '300000' },
      { name: 'Tier4', bonusRate: 0.15, minRollingIncome: '500000' },
    ],
    currentTier: { name: 'D', commissionRate: 0.16, minHostIncome: '50000000' },
    nextTier: { name: 'E', commissionRate: 0.20, minHostIncome: '150000000' },
    allTiers: [
      { name: 'A', commissionRate: 0.04, minHostIncome: '0' },
      { name: 'B', commissionRate: 0.08, minHostIncome: '2000000' },
      { name: 'C', commissionRate: 0.12, minHostIncome: '10000000' },
      { name: 'D', commissionRate: 0.16, minHostIncome: '50000000' },
      { name: 'E', commissionRate: 0.20, minHostIncome: '150000000' },
    ],
    subAgencyCount: 2,
    baseSalaryHostCount: 3,
  } as AgencySummaryV2,

  dailyAnalytics: (days: number): AgencyDailyAnalytics => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daily = Array.from({ length: days }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i));
      const hostBeans = Math.floor(1_800 + Math.sin(i / 3) * 900 + Math.random() * 400);
      return {
        date: d.toISOString().split('T')[0],
        hostBeans,
        commission: Math.floor(hostBeans * 0.12),
      };
    });
    return { days, daily };
  },

  hosts: [
    {
      host: { id: 'lh3', username: 'preeti_music', displayName: 'Preeti Sharma', avatar: 'https://i.pravatar.cc/150?u=preeti_music' },
      today_host_beans: 1_560,
      today_commission: 187,
      week_host_beans: 9_200,
      week_commission: 1_104,
      commission_rate: 12,
    },
    {
      host: { id: 'lh4', username: 'kai_streams', displayName: 'Kai Rivera', avatar: 'https://i.pravatar.cc/150?u=kai_streams' },
      today_host_beans: 1_120,
      today_commission: 134,
      week_host_beans: 7_800,
      week_commission: 936,
      commission_rate: 12,
    },
    {
      host: { id: 'lh6', username: 'echo_li', displayName: 'Echo Li', avatar: 'https://i.pravatar.cc/150?u=echo_li' },
      today_host_beans: 840,
      today_commission: 101,
      week_host_beans: 5_600,
      week_commission: 672,
      commission_rate: 12,
    },
    {
      host: { id: 'lh8', username: 'zara_fm', displayName: 'Zara Ibrahim', avatar: 'https://i.pravatar.cc/150?u=zara_fm' },
      today_host_beans: 460,
      today_commission: 55,
      week_host_beans: 3_200,
      week_commission: 384,
      commission_rate: 12,
    },
    {
      host: { id: 'lh9', username: 'sky_radio', displayName: 'Sky Thompson', avatar: 'https://i.pravatar.cc/150?u=sky_radio' },
      today_host_beans: 200,
      today_commission: 24,
      week_host_beans: 1_800,
      week_commission: 216,
      commission_rate: 12,
    },
    {
      host: { id: 'lh10', username: 'vibe_zone', displayName: 'Vibe Zone', avatar: 'https://i.pravatar.cc/150?u=vibe_zone' },
      today_host_beans: 100,
      today_commission: 12,
      week_host_beans: 800,
      week_commission: 96,
      commission_rate: 12,
    },
  ] as AgencyHost[],

  hostStats: (_hostId: string): HostStatEntry[] =>
    Array.from({ length: 7 }, (_, i) => {
      const beans = Math.floor(Math.random() * 1_200 + 200);
      return {
        date: new Date(Date.now() - i * 86_400_000).toISOString().split('T')[0],
        host_beans_earned: beans,
        agency_commission_earned: Math.floor(beans * 0.12),
        gift_count: Math.floor(Math.random() * 40 + 5),
      };
    }),

  tasks: [
    {
      id: 'task-1a2b',
      task_definition: {
        id: 'def-1a2b',
        name: 'First Broadcast',
        description: 'Stream live for 60 minutes total',
        task_type: 'stream_minutes',
        unlock_after_days: 1,
        target_value: 60,
        reward_beans: 500,
      },
      status: 'in_progress',
      progress: 42,
      unlocked_at: '2026-03-29T08:00:00Z',
      completed_at: null,
      claimed_at: null,
    },
    {
      id: 'task-2b3c',
      task_definition: {
        id: 'def-2b3c',
        name: 'Gift Collector',
        description: 'Receive 10 gifts from your audience',
        task_type: 'gifts_received',
        unlock_after_days: 3,
        target_value: 10,
        reward_beans: 1_000,
      },
      status: 'completed',
      progress: 10,
      unlocked_at: '2026-03-26T08:00:00Z',
      completed_at: '2026-03-30T21:45:00Z',
      claimed_at: null,
    },
    {
      id: 'task-3c4d',
      task_definition: {
        id: 'def-3c4d',
        name: 'Fan Magnet',
        description: 'Gain 50 new followers',
        task_type: 'new_followers',
        unlock_after_days: 7,
        target_value: 50,
        reward_beans: 2_000,
      },
      status: 'locked',
      progress: 0,
      unlocked_at: null,
      completed_at: null,
      claimed_at: null,
    },
    {
      id: 'task-4d5e',
      task_definition: {
        id: 'def-4d5e',
        name: 'Week Warrior',
        description: 'Broadcast on 5 different days',
        task_type: 'days_active',
        unlock_after_days: 7,
        target_value: 5,
        reward_beans: 3_000,
      },
      status: 'claimed',
      progress: 5,
      unlocked_at: '2026-03-22T08:00:00Z',
      completed_at: '2026-03-28T20:00:00Z',
      claimed_at: '2026-03-28T20:05:00Z',
    },
  ] as HostTask[],

  /** Empty by default — matches admin with no promotions; add rows here only for UI dev. */
  learnPromotions: [] as AgencyLearnPromotion[],
};
