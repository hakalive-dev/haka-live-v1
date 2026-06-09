import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../types';

/** Live commission % from seller:rates_updated (Coin Seller screen). */
export interface LiveSellerRates {
  total_commission_rate: string;
  gift_commission_rate: string;
  income_reward_rate: string;
  gift_bonus_rate: string;
  max_commission_rate?: string;
  max_income_reward_rate?: string;
  max_gift_bonus_rate?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  lastCommissionAt: number | null;
  /** Rolling gift stats / tier ladders updated without a bean payout row (e.g. micro-gifts). Socket: agency:gift_stats_updated */
  lastAgencyGiftStatsAt: number | null;
  /** Host Centre / mic-income refresh. Socket: host:stats_tick */
  lastHostCenterTickAt: number | null;
  /** Coin seller stats changed (transfer, exchange, recharge). Socket: seller:stats_updated */
  lastSellerStatsAt: number | null;
  /** Effective coin-seller commission % pushed after gifts / tier changes. */
  liveSellerRates: LiveSellerRates | null;
  /**
   * Platform-wide chat mute set by an admin. When true, the chat composer
   * and DM input must be locked. Driven by `user:muted`/`user:unmuted`
   * socket events via useUserSocket.
   */
  chatMuted: boolean;
  /** Help Center ticket list refresh after admin reply. Socket: support:ticket_replied */
  lastSupportTicketReplyAt: number | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  lastCommissionAt: null,
  lastAgencyGiftStatsAt: null,
  lastHostCenterTickAt: null,
  lastSellerStatsAt: null,
  liveSellerRates: null,
  chatMuted: false,
  lastSupportTicketReplyAt: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (
      state,
      action: PayloadAction<{ user: User; accessToken: string; refreshToken: string }>,
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    // Called when /me refreshes the user object (e.g. after onboarding)
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
    clearAuth: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.lastCommissionAt = null;
      state.lastAgencyGiftStatsAt = null;
      state.lastHostCenterTickAt = null;
      state.lastSellerStatsAt = null;
      state.liveSellerRates = null;
      state.chatMuted = false;
      state.lastSupportTicketReplyAt = null;
    },
    bumpCommission: (state) => {
      state.lastCommissionAt = Date.now();
    },
    bumpAgencyGiftStats: (state) => {
      state.lastAgencyGiftStatsAt = Date.now();
    },
    bumpHostCenter: (state) => {
      state.lastHostCenterTickAt = Date.now();
    },
    bumpSellerStats: (state) => {
      state.lastSellerStatsAt = Date.now();
    },
    /** Updates commission % only — does not trigger CoinSellerScreen full reload. */
    setLiveSellerRates: (state, action: PayloadAction<LiveSellerRates>) => {
      state.liveSellerRates = action.payload;
    },
    setChatMuted: (state, action: PayloadAction<boolean>) => {
      state.chatMuted = action.payload;
    },
    bumpSupportTicketReply: (state) => {
      state.lastSupportTicketReplyAt = Date.now();
    },
  },
});

export const {
  setAuth,
  setUser,
  clearAuth,
  bumpCommission,
  bumpAgencyGiftStats,
  bumpHostCenter,
  bumpSellerStats,
  setLiveSellerRates,
  setChatMuted,
  bumpSupportTicketReply,
} = authSlice.actions;
export default authSlice.reducer;
