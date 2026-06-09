import { apiClient } from './client';
import { useMock } from './config';
import { mockAuth } from './mock/auth';
import { AuthResult } from './auth';
import { getDeviceInfo } from '../utils/deviceInfo';

/**
 * Self-owned WhatsApp phone-login OTP (Meta Cloud API via our backend).
 * Replaces the old Supabase → Twilio phone OTP. WhatsApp-only; no SMS fallback.
 *
 * Flow:
 *  - send(phone)              → backend generates + WhatsApps a 6-digit code
 *  - verifyLogin(phone, code) → verifies, find-or-creates user by phone, returns app JWTs
 *  - verifyBind(phone, code)  → verifies, links phone to the authenticated account
 */
export const whatsappOtpApi = {
  /** Request a WhatsApp OTP for `phone` (E.164, e.g. +447700900123). */
  send: async (phone: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post('/auth/whatsapp/send', { phone }, { timeout: 30_000 });
  },

  /**
   * Verify the OTP and sign in — returns backend JWTs + user directly
   * (no separate /auth/supabase exchange step).
   */
  verifyLogin: async (phone: string, code: string): Promise<AuthResult> => {
    if (useMock) return mockAuth.loginResult;
    const device = await getDeviceInfo();
    const res = await apiClient.post(
      '/auth/whatsapp/verify',
      { phone, code, ...device },
      { timeout: 30_000 },
    );
    const data = res.data;
    if (!data || !data.tokens || !data.tokens.accessToken) {
      console.error('[whatsappOtp] Unexpected verify response:', JSON.stringify(data));
      throw new Error('Unexpected server response. Please try again.');
    }
    return data;
  },

  /**
   * Verify the OTP and bind `phone` to the authenticated user's account.
   * Requires a valid Bearer token (used from Account Security / Become Agent).
   */
  verifyBind: async (phone: string, code: string): Promise<{ phone: string }> => {
    if (useMock) return { phone };
    const res = await apiClient.patch(
      '/auth/whatsapp/bind',
      { phone, code },
      { timeout: 30_000 },
    );
    return res.data;
  },
};
