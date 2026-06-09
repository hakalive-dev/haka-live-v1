import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { PublicUser, User, VisitorEntry } from '../types';

interface ProfileState {
  profile: User | PublicUser | null;
  loading: boolean;
  error: string | null;
  pendingVisitor: VisitorEntry | null;
  /** Bumped when auth/profile is saved so screens refetch cached PublicUser data. */
  profileVersion: number;
}

const initialState: ProfileState = {
  profile: null,
  loading: false,
  error: null,
  pendingVisitor: null,
  profileVersion: 0,
};

const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    setProfileLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
      if (action.payload) state.error = null;
    },
    setProfile: (state, action: PayloadAction<User | PublicUser>) => {
      state.profile = action.payload;
      state.loading = false;
      state.error = null;
      state.profileVersion += 1;
    },
    setProfileError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.loading = false;
    },
    clearProfile: (state) => {
      state.profile = null;
      state.loading = false;
      state.error = null;
    },
    setPendingVisitor: (state, action: PayloadAction<VisitorEntry | null>) => {
      state.pendingVisitor = action.payload;
    },
  },
});

export const { setProfileLoading, setProfile, setProfileError, clearProfile, setPendingVisitor } =
  profileSlice.actions;
export default profileSlice.reducer;
