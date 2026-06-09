import { apiClient } from './client';

export type IncomeWindow = 'today' | '7d' | 'weekly';

export interface AgentLite {
  id: string;
  displayName: string;
  avatar: string | null;
  hakaId: string;
  username: string;
  equippedFrame?: import('../types').EquippedCosmetic | null;
}

export interface HostIncome {
  window: IncomeWindow;
  giftBeans: number;
  micBeans: number;
  hourlyBeans: number;
  totalBeans: number;
  minutesOnMic: number;
  since: string;
}

export interface HostTier {
  id: string;
  name: string;
  hourlyRateBeans: number;
  minWeeklyBeans: number;
  sortOrder: number;
}

export interface HostTierInfo {
  tiers: HostTier[];
  currentTier: HostTier | null;
  nextTier: HostTier | null;
  progress: number;
  neededBeans: number;
  weeklyBeans: number;
}

export interface MicProgress {
  minutesOnMic: number;
  minutesTarget: number;
  /** Daily gift+mic "points" goal (beans) for Host Centre progress line */
  pointsTargetBeans: number;
  hoursOnMicToday: number;
  minutesOnMicToday: number;
  beansEarnedToday: number;
  unlocked: boolean;
  onMicNow: boolean;
}

export interface LevelTaskTierRule {
  levelCode: string;
  minSevenDayEarnings: number;
  dailyTaskRewardBeans: number;
  incomeTaskHourlyBeans: number;
  incomeTaskMaxHoursPerDay: number;
  hourlyMaxBeans: number;
}

export interface LevelTaskRules {
  newHosts: {
    hourlyBeans: number;
    hoursPerDay: number;
    protectionDays: number;
    totalCapBeans: number;
  };
  ordinary: {
    maxSevenDayEarnings: number;
    liveHourlyBeans: number;
    liveHoursPerDay: number;
    incomeHourlyBeans: number;
    incomeHoursPerDay: number;
    hourlyMaxBeans: number;
    dailyMaxBeans: number;
  };
  incomeThresholdBeans: number;
  tiers: LevelTaskTierRule[];
}

export interface LevelTaskStatus {
  eligible?: boolean;
  taskDayTimezone?: string;
  micMinutesToday?: number;
  pkMinutesToday?: number;
  /** True only when there is a currently-counting open mic session (own room + qualifying mode). */
  onMicNow?: boolean;
  inPkNow?: boolean;
  /** When false, live-room mic time is gated off and does not accrue toward the task. */
  countLiveMicTime?: boolean;
  track: 'new_host' | 'ordinary' | 'level';
  levelCode: string | null;
  daysSinceRegistration: number;
  sevenDayEarnings: number;
  todayGiftEarnings: number;
  todayMicMinutes: number;
  /** Second-precision accrued mic time today; exact for the open session. */
  todayMicSeconds?: number;
  unclaimedMinutes: number;
  liveMinutesClaimed: number;
  liveBeansClaimedToday: number;
  incomeClaimsCount: number;
  incomeBeansClaimedToday: number;
  totalBeansClaimedToday: number;
  newHostLifetimeClaimed: number;
  canClaimLive: boolean;
  canClaimIncome: boolean;
  claimLiveReason: string;
  claimIncomeReason: string;
  incomeClaimsRemaining: number;
  rules: LevelTaskRules;
}

export interface HostAgencyChangeRequest {
  id: string;
  userId: string;
  fromAgentId: string | null;
  toAgentId: string | null;
  type: 'leave' | 'change';
  status: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    displayName: string;
    username: string | null;
    avatar: string | null;
    hakaId?: string | null;
  };
}

export const hostsApi = {
  getAgency: async (): Promise<{ agent: AgentLite | null }> => {
    const res = await apiClient.get('/hosts/me/agency');
    return res.data;
  },
  getIncome: async (window: IncomeWindow): Promise<HostIncome> => {
    const res = await apiClient.get(`/hosts/me/income?window=${window}`);
    return res.data;
  },
  getTier: async (): Promise<HostTierInfo> => {
    const res = await apiClient.get('/hosts/me/tier');
    return res.data;
  },
  getMicProgress: async (): Promise<MicProgress> => {
    const res = await apiClient.get('/hosts/me/mic-progress');
    return res.data;
  },
  getOfficialContact: async (): Promise<{ user: AgentLite | null }> => {
    const res = await apiClient.get('/hosts/official-contact');
    return res.data;
  },
  requestLeaveAgency: async (reason: string) => {
    const res = await apiClient.post('/hosts/me/agency/leave', { reason });
    return res.data;
  },
  requestChangeAgency: async (newAgentId: string, reason: string) => {
    const res = await apiClient.post('/hosts/me/agency/change', {
      new_agent_id: newAgentId,
      reason,
    });
    return res.data;
  },

  /** Pending leave/change request for current host (if any) */
  getMyPendingAgencyChange: async (): Promise<HostAgencyChangeRequest | null> => {
    const res = await apiClient.get('/agency/change-request');
    return (res.data ?? null) as HostAgencyChangeRequest | null;
  },

  getLevelTaskRules: async (): Promise<LevelTaskRules> => {
    const res = await apiClient.get('/hosts/level-task/rules');
    return (res.data as { rules: LevelTaskRules }).rules;
  },

  getLevelTask: async (): Promise<LevelTaskStatus> => {
    const res = await apiClient.get('/hosts/me/level-task');
    return res.data as LevelTaskStatus;
  },

  claimLevelTaskLive: async (): Promise<{ beansAwarded: number }> => {
    const res = await apiClient.post('/hosts/me/level-task/claim-live');
    return res.data as { beansAwarded: number };
  },

  claimLevelTaskIncome: async (): Promise<{ beansAwarded: number }> => {
    const res = await apiClient.post('/hosts/me/level-task/claim-income');
    return res.data as { beansAwarded: number };
  },
};
