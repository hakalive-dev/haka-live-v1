import { supabase } from '../lib/supabase';

/**
 * Supabase email OTP — used to confirm sensitive actions (currently the password
 * change in Account Security). Supabase emails a 6-digit code; verifyOtp returns a
 * short-lived access token that the backend trusts as proof the user controls the
 * email (same token shape the backend already verifies for /auth/supabase).
 *
 *  - send(email)         → Supabase emails a 6-digit code (existing users only)
 *  - verify(email, code) → returns the Supabase access token on success
 */
export const emailOtpApi = {
  /** Ask Supabase to email a 6-digit OTP to `email`. */
  send: async (email: string): Promise<void> => {
    if (!supabase) throw new Error('Email verification is not available right now.');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Never provision a brand-new Supabase user from this flow — the account
      // must already exist (it does, since they're signed in with this email).
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(error.message);
  },

  /** Verify the 6-digit code and return the Supabase access token. */
  verify: async (email: string, code: string): Promise<string> => {
    if (!supabase) throw new Error('Email verification is not available right now.');
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (error) throw new Error(error.message);
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('Verification failed. Please request a new code.');
    return accessToken;
  },
};
