import { supabase } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';

/**
 * Email OTP via Supabase Auth — server-side proxy so clients (web delete-account,
 * future flows) only ever talk to our API and never need the Supabase SDK or anon
 * key. Supabase emails a 6-digit code; verifyOtp returns a short-lived access token
 * that the existing `loginWithSupabase` flow already trusts.
 *
 *  - requestOtp(email)        → Supabase emails a 6-digit code (existing users only)
 *  - verifyOtp(email, code)   → returns the Supabase access token on success
 */

/** Ask Supabase to email a 6-digit OTP to `email`. Never reveals whether the account exists. */
export async function requestOtp(email: string): Promise<void> {
  if (!supabase) throw new AppError('Email verification is not configured', 500);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Never provision a brand-new Supabase user from this flow — the account must
    // already exist (otherwise there is nothing to act on).
    options: { shouldCreateUser: false },
  });
  if (error) throw new AppError(error.message, 400);
}

/** Verify the 6-digit code and return the Supabase access token. */
export async function verifyOtp(email: string, code: string): Promise<string> {
  if (!supabase) throw new AppError('Email verification is not configured', 500);
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });
  if (error) throw new AppError('Email verification failed. Please request a new code.', 401);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new AppError('Email verification failed. Please request a new code.', 401);
  return accessToken;
}
