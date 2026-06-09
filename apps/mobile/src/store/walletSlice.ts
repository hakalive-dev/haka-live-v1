import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { WalletBalance } from '@/types';

interface WalletState {
  coinBalance: number;
  beanBalance: number;
  loaded: boolean;
}

const initialState: WalletState = {
  coinBalance: 0,
  beanBalance: 0,
  loaded: false,
};

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    /** Full balance refresh — call after fetching from API */
    setWalletBalance: (state, action: PayloadAction<WalletBalance>) => {
      state.coinBalance = action.payload.coinBalance;
      state.beanBalance = action.payload.beanBalance;
      state.loaded = true;
    },
    /** Optimistic increment for bean earnings (commission:credited, gift received) */
    incrementBeanBalance: (state, action: PayloadAction<number>) => {
      state.beanBalance += action.payload;
    },
    /** Optimistic decrement for coin spend (gift sent) */
    decrementCoinBalance: (state, action: PayloadAction<number>) => {
      state.coinBalance = Math.max(0, state.coinBalance - action.payload);
    },
    /** Sync bean balance after seller point exchange approved (server-authoritative value) */
    setBeanBalance: (state, action: PayloadAction<number>) => {
      state.beanBalance = Math.max(0, action.payload);
    },
    clearWallet: (state) => {
      state.coinBalance = 0;
      state.beanBalance = 0;
      state.loaded = false;
    },
  },
});

export const {
  setWalletBalance,
  incrementBeanBalance,
  decrementCoinBalance,
  setBeanBalance,
  clearWallet,
} = walletSlice.actions;
export default walletSlice.reducer;
