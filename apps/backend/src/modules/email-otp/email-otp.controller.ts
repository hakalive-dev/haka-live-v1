import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok, created, fail } from '../../utils/response';
import * as emailOtp from './email-otp.service';
import * as accounts from '../accounts/accounts.service';

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
// Supabase OTP length is configurable (6–10 digits); accept the full range so a
// dashboard length change never silently breaks verification.
const codeSchema = z.string().trim().regex(/^[0-9]{6,10}$/, 'Enter the verification code');

const optionalDeviceFields = {
  deviceId: z.string().optional(),
  deviceModel: z.string().optional(),
  platform: z.string().optional(),
  appVersion: z.string().optional(),
};

const sendSchema = z.object({ email: emailSchema });
const verifySchema = z.object({ email: emailSchema, code: codeSchema, ...optionalDeviceFields });

/**
 * POST /api/v1/auth/email-otp/send
 * Body: { email }
 * Emails a 6-digit OTP via Supabase. Does not reveal whether an account exists.
 */
export async function send(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    await emailOtp.requestOtp(parsed.data.email);
    ok(res, null, 'Verification code sent');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/email-otp/verify
 * Body: { email, code }
 * Verifies the OTP, then find-or-matches the user by email and returns backend JWTs + user.
 * Same response shape as POST /auth/supabase.
 */
export async function verify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const { email, code, deviceId, deviceModel, platform, appVersion } = parsed.data;
    const supabaseToken = await emailOtp.verifyOtp(email, code);
    const result = await accounts.loginWithSupabase(supabaseToken, {
      deviceId,
      deviceModel,
      platform,
      appVersion,
    });
    created(res, result, 'Authenticated successfully');
  } catch (err) {
    next(err);
  }
}
