import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './accounts.service';
import { ok, created, fail } from '../../utils/response';
import { env } from '../../config/env';

// ── Validation schemas ─────────────────────────────────────────────────────────

const optionalDeviceFields = {
  deviceId: z.string().optional(),
  deviceModel: z.string().optional(),
  /** ios | android | web | etc. — stored as free-form string */
  platform: z.string().optional(),
  appVersion: z.string().optional(),
};

const supabaseSchema = z.object({
  accessToken: z.string().min(1, 'accessToken is required'),
  ...optionalDeviceFields,
});

const refreshSchema = z.object({
  refreshToken: z.string().uuid('refreshToken must be a valid UUID'),
  ...optionalDeviceFields,
});

const logoutSchema = z.object({
  refreshToken: z.string().uuid('refreshToken must be a valid UUID'),
});

const genderEnum = z.enum(['male', 'female', 'other', 'prefer_not_to_say', '']);

const onboardingSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
  displayName: z.string().min(1).max(50),
  country: z.string().min(2).max(80),
  /** Optional; used for city-level regional earner leaderboard badge */
  city: z.string().min(1).max(80).optional(),
  gender: genderEnum.optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
});

const profileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(200).optional(),
  avatar: z.string().url().optional(),
  country: z.string().min(2).max(80).optional(),
  city: z.string().max(80).optional(),
  gender: genderEnum.optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  preferredWithdrawalCountryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});

const passwordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  currentPassword: z.string().optional(),
  // Supabase access token from the email-OTP verification (signInWithOtp → verifyOtp).
  // Required: every password change must be confirmed with an email OTP.
  accessToken: z.string().min(1, 'Email verification is required'),
});

const hakaIdLoginSchema = z.object({
  hakaId: z.string().min(1, 'hakaId is required'),
  password: z.string().min(1, 'password is required'),
  ...optionalDeviceFields,
});

// ── Controllers ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/supabase
 * Body: { accessToken: string }
 * Verifies a Supabase access token (Google / Apple / Phone OTP) and returns backend JWTs + user object.
 */
export async function loginWithSupabase(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = supabaseSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }

    const { accessToken, deviceId, deviceModel, platform, appVersion } = parsed.data;
    const result = await service.loginWithSupabase(accessToken, { deviceId, deviceModel, platform, appVersion });
    created(res, result, 'Authenticated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken: string }
 * Rotates the refresh token and returns a new pair.
 */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }

    const { refreshToken, deviceId, deviceModel, platform, appVersion } = parsed.data;
    const tokens = await service.refreshTokens(refreshToken, { deviceId, deviceModel, platform, appVersion });
    ok(res, tokens, 'Tokens refreshed');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 * Body: { refreshToken: string }
 * Revokes the current refresh token (single device logout).
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }

    await service.revokeRefreshToken(parsed.data.refreshToken);
    ok(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout-all
 * Revokes all refresh tokens for the authenticated user (all devices logout).
 * Requires: Bearer token
 */
export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.revokeAllRefreshTokens(req.user!.id);
    ok(res, null, 'Logged out from all devices');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/me
 * Returns the authenticated user's profile.
 * Requires: Bearer token
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await service.getMe(req.user!.id);
    ok(res, user);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/auth/onboarding
 * Body: { username, displayName, country, city?, gender?, dateOfBirth? }
 * Completes onboarding — sets username, generates hakaId. One-time only.
 * Requires: Bearer token
 */
export async function completeOnboarding(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }

    const { dateOfBirth, ...rest } = parsed.data;
    const user = await service.completeOnboarding(req.user!.id, {
      ...rest,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    });
    ok(res, user, 'Onboarding completed');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/auth/profile
 * Body: { displayName?, bio?, avatar?, country?, city?, gender?, dateOfBirth? }
 * Updates mutable profile fields.
 * Requires: Bearer token
 */
export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }

    const { dateOfBirth, ...rest } = parsed.data;
    const user = await service.updateProfile(req.user!.id, {
      ...rest,
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
    });
    ok(res, user, 'Profile updated');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/auth/password
 * Body: { newPassword, currentPassword? }
 * Set or change the user's password.
 * Requires: Bearer token
 */
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    await service.setPassword(
      req.user!.id,
      parsed.data.newPassword,
      parsed.data.accessToken,
      parsed.data.currentPassword,
    );
    ok(res, null, 'Password updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/auth/bind-phone
 * Body: { accessToken } — Supabase access token from phone OTP verification
 * Binds a verified phone number to the current account without creating a new session.
 * Requires: Bearer token
 */
const bindPhoneSchema = z.object({
  accessToken: z.string().min(1),
  /** @deprecated Use accessToken — kept for older app builds during rollout */
  idToken: z.string().min(1).optional(),
});

export async function bindPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = bindPhoneSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'accessToken is required', 400);
      return;
    }
    const token = parsed.data.accessToken ?? parsed.data.idToken;
    if (!token) {
      fail(res, 'accessToken is required', 400);
      return;
    }
    const result = await service.bindPhone(req.user!.id, token);
    ok(res, result, 'Phone number linked successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/devices
 * Returns all registered devices for the authenticated user.
 * Requires: Bearer token
 */
export async function getDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const devices = await service.getDevices(req.user!.id);
    ok(res, devices);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/auth/devices/:deviceId
 * Removes a registered device.
 * Requires: Bearer token
 */
export async function removeDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { deviceId } = req.params;
    if (!deviceId) {
      fail(res, 'deviceId is required', 400);
      return;
    }
    await service.removeDevice(req.user!.id, deviceId);
    ok(res, null, 'Device removed');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/login
 * Body: { hakaId: string, password: string }
 * Production login by Haka ID + bcrypt password.
 */
export async function loginWithHakaId(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = hakaIdLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.errors[0]?.message ?? 'Invalid request', 400);
      return;
    }

    const { hakaId, password, deviceId, deviceModel, platform, appVersion } = parsed.data;
    const result = await service.loginWithHakaId(hakaId, password, {
      deviceId,
      deviceModel,
      platform,
      appVersion,
    });
    created(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/dev-login
 * Body: { phone: string }
 * Dev-only: creates/finds a test user and returns JWTs without Firebase.
 * Blocked in production.
 */
export async function devLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (env.NODE_ENV === 'production') {
      fail(res, 'Not available in production', 403);
      return;
    }

    const { phone, deviceId, deviceModel, platform, appVersion } = req.body;
    if (!phone || typeof phone !== 'string') {
      fail(res, 'phone is required', 400);
      return;
    }

    const result = await service.devLogin(phone, { deviceId, deviceModel, platform, appVersion });
    created(res, result, 'Dev login successful');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/dev-login-haka
 * Body: { hakaId: string, password: string }
 * Dev-only: login by Haka ID + password. Blocked in production.
 */
export async function devLoginWithHakaId(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (env.NODE_ENV === 'production') {
      fail(res, 'Not available in production', 403);
      return;
    }

    const { hakaId, password, deviceId, deviceModel, platform, appVersion } = req.body;
    if (!hakaId || typeof hakaId !== 'string') {
      fail(res, 'hakaId is required', 400);
      return;
    }
    if (!password || typeof password !== 'string') {
      fail(res, 'password is required', 400);
      return;
    }

    const result = await service.devLoginWithHakaId(hakaId, password, { deviceId, deviceModel, platform, appVersion });
    created(res, result, 'Dev login successful');
  } catch (err) {
    next(err);
  }
}
