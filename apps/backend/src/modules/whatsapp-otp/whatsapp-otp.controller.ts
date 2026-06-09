import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok, created, fail } from '../../utils/response';
import * as phoneOtp from './phone-otp.service';
import * as accounts from '../accounts/accounts.service';

// E.164-ish: leading + then 7–15 digits (Meta accepts without +, we normalize either way).
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number');

const codeSchema = z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code');

const optionalDeviceFields = {
  deviceId: z.string().optional(),
  deviceModel: z.string().optional(),
  platform: z.string().optional(),
  appVersion: z.string().optional(),
};

const sendSchema = z.object({ phone: phoneSchema });
const verifySchema = z.object({ phone: phoneSchema, code: codeSchema, ...optionalDeviceFields });
const bindSchema = z.object({ phone: phoneSchema, code: codeSchema });

/**
 * POST /api/v1/auth/whatsapp/send
 * Body: { phone }
 * Generates + sends a WhatsApp OTP. Does not reveal whether an account exists.
 */
export async function send(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await phoneOtp.requestOtp(parsed.data.phone);
    ok(res, result, 'Verification code sent');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/whatsapp/verify
 * Body: { phone, code }
 * Verifies the OTP, then find-or-creates the user by phone and returns backend JWTs + user.
 * Same response shape as POST /auth/supabase.
 */
export async function verify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const { phone, code, deviceId, deviceModel, platform, appVersion } = parsed.data;
    const normalizedPhone = await phoneOtp.verifyOtp(phone, code);
    const result = await accounts.loginWithPhone(normalizedPhone, {
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

/**
 * PATCH /api/v1/auth/whatsapp/bind
 * Body: { phone, code }
 * Verifies the OTP, then binds the phone to the authenticated user's account.
 * Requires: Bearer token.
 */
export async function bind(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = bindSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const normalizedPhone = await phoneOtp.verifyOtp(parsed.data.phone, parsed.data.code);
    const result = await accounts.bindPhoneByValue(req.user!.id, normalizedPhone);
    ok(res, result, 'Phone number linked successfully');
  } catch (err) {
    next(err);
  }
}
