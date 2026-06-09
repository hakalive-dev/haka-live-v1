import { apiClient } from './client';
import { useMock } from './config';
import { mockAuth } from './mock/auth';
import { User, OnboardingData } from '../types';
import { getDeviceInfo } from '../utils/deviceInfo';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

export const authApi = {
  /**
   * Exchange a Supabase access token for backend JWTs + user object.
   * Used after Google / Apple / phone OTP via Supabase Auth.
   */
  loginWithSupabase: async (accessToken: string): Promise<AuthResult> => {
    if (useMock) return mockAuth.loginResult;
    const device = await getDeviceInfo();
    const res = await apiClient.post('/auth/supabase', { accessToken, ...device }, { timeout: 30_000 });
    const data = res.data;
    if (!data || !data.tokens || !data.tokens.accessToken) {
      console.error('[auth] Unexpected loginWithSupabase response:', JSON.stringify(data));
      throw new Error('Unexpected server response. Please try again.');
    }
    return data;
  },

  /**
   * Dev-only: login without Supabase OTP. Creates a test user on the backend.
   */
  devLogin: async (phone: string): Promise<AuthResult> => {
    if (useMock) return mockAuth.loginResult;
    const device = await getDeviceInfo();
    const res = await apiClient.post('/auth/dev-login', { phone, ...device }, { timeout: 30_000 });
    return res.data;
  },

  /**
   * Login by Haka ID + password.
   * Release builds use POST /auth/login (bcrypt password required).
   * Dev / EXPO_PUBLIC_ENABLE_DEV_LOGIN uses /auth/dev-login-haka (shared dev password fallback).
   */
  loginWithHakaId: async (hakaId: string, password: string): Promise<AuthResult> => {
    if (useMock) return mockAuth.loginResult;
    const device = await getDeviceInfo();
    const useDevEndpoint =
      __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === 'true';
    const path = useDevEndpoint ? '/auth/dev-login-haka' : '/auth/login';
    const res = await apiClient.post(path, { hakaId, password, ...device }, { timeout: 30_000 });
    return res.data;
  },

  /** @deprecated Use loginWithHakaId */
  devLoginWithHakaId: async (hakaId: string, password: string): Promise<AuthResult> => {
    return authApi.loginWithHakaId(hakaId, password);
  },

  refresh: async (refreshToken: string): Promise<AuthTokens> => {
    if (useMock) return { accessToken: 'mock-access', refreshToken: 'mock-refresh' };
    const device = await getDeviceInfo();
    const res = await apiClient.post('/auth/refresh', { refreshToken, ...device }, { timeout: 30_000 });
    return res.data;
  },

  logout: async (refreshToken: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post('/auth/logout', { refreshToken });
  },

  getMe: async (): Promise<User> => {
    if (useMock) return mockAuth.me;
    const res = await apiClient.get('/auth/me', { timeout: 30_000 });
    return res.data;
  },

  /**
   * Pre-check whether the account can be self-deleted (no pending withdrawal,
   * owned agency/family, seller balance, or live room).
   */
  getDeletionEligibility: async (): Promise<{
    eligible: boolean;
    reasons: { code: string; message: string }[];
    supportEmail: string;
  }> => {
    if (useMock) return { eligible: true, reasons: [], supportEmail: 'support@hakalive.com' };
    const res = await apiClient.get('/auth/me/deletion-eligibility', { timeout: 30_000 });
    return res.data;
  },

  /**
   * DELETE /auth/me — permanently delete (anonymize) the account.
   * Throws ApiError(409) with a human-readable message when blocked.
   */
  deleteAccount: async (): Promise<void> => {
    if (useMock) return;
    await apiClient.delete('/auth/me', { timeout: 30_000 });
  },

  completeOnboarding: async (data: OnboardingData): Promise<User> => {
    if (useMock) return mockAuth.me;
    const res = await apiClient.patch('/auth/onboarding', data);
    return res.data;
  },

  updateProfile: async (
    data: Partial<Pick<User, 'displayName' | 'bio' | 'avatar' | 'country' | 'city' | 'gender'>> & { dateOfBirth?: string | null },
  ): Promise<User> => {
    if (useMock) return mockAuth.me;
    const res = await apiClient.patch('/auth/profile', data);
    return res.data;
  },
};
