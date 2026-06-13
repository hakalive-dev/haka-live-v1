import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import {
  supabase,
  configuredSupabaseProjectRef,
  supabaseJwtProjectRef,
} from '../../config/supabase';
import { prisma } from '../../config/prisma';
import { signAccessToken, refreshTokenExpiresAt } from '../../utils/jwt';
import { generateUniqueHakaId } from '../../utils/hakaId';
import { SPECIAL_ID_REGEX } from '../../utils/specialId';
import { AppError } from '../../middleware/error.middleware';
import { isUserBanned, isDeviceBanned } from '../moderation/moderation.service';
import { mapSortedUserTags, userTagsOrderedInclude } from '../moderation/tags.service';
import { scheduleWelcomeDm } from '../chat/haka-team-welcome.service';
import { encryptPasswordSnapshot } from './password-snapshot';
import {
  type EquippedCosmetic,
  type EquippedCosmetics,
  equippedStoreItemsWhere,
  parseEquippedCosmetics,
} from '../users/user-summary';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: SafeUser;
  tokens: TokenPair;
}

/** Client-reported device metadata (mobile / web). */
export interface DeviceInfo {
  deviceId?: string;
  deviceModel?: string;
  platform?: string;
  appVersion?: string;
}

// The shape returned to the client — never expose supabaseUid or internal FKs raw.
export type { EquippedCosmetic };

export type SafeUser = {
  id: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  displayName: string;
  avatar: string;
  bio: string;
  country: string;
  preferredWithdrawalCountryCode: string;
  city: string;
  state: string;
  gender: string;
  dateOfBirth: Date | null;
  age: number | null;
  hakaId: string | null;
  role: string;
  hostType: string;
  hostApplicationPath: string;
  agentId: string | null;
  onboardingComplete: boolean;
  isVerifiedHost: boolean;
  isPremiumHost: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  activeSpecialId: string | null;
  activeSpecialIdLevel: string | null;
  faceVerificationStatus: string;
  facePhotoUrl: string;
  faceRejectedReason: string;
  createdAt: Date;
  updatedAt: Date;
  tags: TagSummary[];
  /** True when user has an active PayrollAgentProfile (may still be role `agent`). */
  /** True when user may browse state rankings across countries (super admin). */
  canInspectStateRankings: boolean;
} & EquippedCosmetics;

export type DeviceEntry = {
  id: string;
  deviceId: string;
  deviceModel: string;
  platform: string;
  appVersion: string;
  lastLoginAt: Date;
  createdAt: Date;
};

export type TagSummary = {
  name: string;
  displayName: string;
  color: string;
  iconUrl: string;
  sortOrder: number;
};


export function computeAge(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toSafeUser(
  user: {
  id: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  displayName: string;
  avatar: string;
  bio: string;
  country: string;
  preferredWithdrawalCountryCode?: string;
  city?: string;
  state?: string;
  gender: string;
  dateOfBirth: Date | null;
  hakaId: string | null;
  role: string;
  hostType: string;
  hostApplicationPath: string;
  agentId: string | null;
  onboardingComplete: boolean;
  isVerifiedHost: boolean;
  isPremiumHost: boolean;
  password?: string | null;
  googleLinked?: boolean;
  activeSpecialId: string | null;
  activeSpecialIdLevel: string | null;
  activeSpecialIdExpiresAt: Date | null;
  faceVerificationStatus?: string;
  facePhotoUrl?: string;
  faceRejectedReason?: string;
  coinSellerProfile?: { id: string } | null;
  payrollAgentProfile?: { status: string } | null;
  storeItems?: Array<{ item: { id: string; name: string; image: string | null; category: string; level: string } }>;
  createdAt: Date;
  updatedAt: Date;
  },
  tags: TagSummary[] = [],
  extras: { canInspectStateRankings?: boolean } = {},
): SafeUser {
  // Clear expired special IDs
  const now = new Date();
  const specialIdActive = user.activeSpecialId && (!user.activeSpecialIdExpiresAt || user.activeSpecialIdExpiresAt > now);

  const cosmetics = parseEquippedCosmetics(user.storeItems ?? []);

  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    bio: user.bio,
    country: user.country,
    preferredWithdrawalCountryCode: user.preferredWithdrawalCountryCode ?? '',
    city: user.city ?? '',
    state: user.state ?? '',
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    age: computeAge(user.dateOfBirth),
    hakaId: user.hakaId,
    role: user.role,
    hostType: user.hostType,
    hostApplicationPath: user.hostApplicationPath,
    agentId: user.agentId,
    onboardingComplete: user.onboardingComplete,
    isVerifiedHost: user.isVerifiedHost,
    isPremiumHost: user.isPremiumHost,
    hasPassword: user.password != null,
    googleLinked: user.googleLinked ?? false,
    activeSpecialId: specialIdActive ? user.activeSpecialId : null,
    activeSpecialIdLevel: specialIdActive ? user.activeSpecialIdLevel : null,
    ...cosmetics,
    faceVerificationStatus: user.faceVerificationStatus ?? 'none',
    facePhotoUrl:
      user.faceVerificationStatus === 'approved' ? (user.facePhotoUrl ?? '') : '',
    faceRejectedReason: user.faceRejectedReason ?? '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    tags,
    isPayrollAgent: user.payrollAgentProfile?.status === 'active',
    canInspectStateRankings: extras.canInspectStateRankings ?? false,
  };
}

async function issueTokens(userId: string, role: string): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = uuidv4();

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  return { accessToken, refreshToken };
}

async function upsertUserDeviceForSession(userId: string, device: DeviceInfo): Promise<void> {
  if (!device.deviceId) return;
  await prisma.userDevice.upsert({
    where: { userId_deviceId: { userId, deviceId: device.deviceId } },
    create: {
      userId,
      deviceId: device.deviceId,
      deviceModel: device.deviceModel ?? '',
      platform: device.platform ?? '',
      appVersion: device.appVersion ?? '',
      lastLoginAt: new Date(),
    },
    update: {
      deviceModel: device.deviceModel ?? undefined,
      platform: device.platform ?? undefined,
      appVersion: device.appVersion ?? undefined,
      lastLoginAt: new Date(),
    },
  });
}

// ── Service methods ────────────────────────────────────────────────────────────

/**
 * Dev-only login — creates or finds a test user and returns JWTs.
 * Bypasses external auth entirely. Only available when NODE_ENV !== 'production'.
 */
export async function devLogin(phone: string, device?: DeviceInfo): Promise<AuthResult> {
  const fakeUid = `dev-${phone.replace(/\+/g, '')}`;

  const sanitizedPhone = phone.replace(/\+/g, '');
  const user = await prisma.user.upsert({
    where: { supabaseUid: fakeUid },
    create: {
      supabaseUid: fakeUid,
      phone,
      displayName: `Dev User ${phone.slice(-4)}`,
      username: `dev_${sanitizedPhone}`,
      hakaId: await generateUniqueHakaId(),
      onboardingComplete: true,
    },
    update: {},
    include: { coinSellerProfile: { select: { id: true } } },
  });

  if (await isUserBanned(user.id)) {
    throw new AppError('Your account has been suspended.', 403);
  }

  if (device?.deviceId) {
    await upsertUserDeviceForSession(user.id, device);
  }

  const tokens = await issueTokens(user.id, user.role);
  return { user: toSafeUser(user), tokens };
}

const hakaIdUserInclude = { coinSellerProfile: { select: { id: true } } } as const;

type HakaIdUser = Prisma.UserGetPayload<{ include: typeof hakaIdUserInclude }>;

async function verifyHakaIdPassword(
  user: NonNullable<HakaIdUser>,
  password: string,
  allowDevPasswordFallback: boolean,
): Promise<void> {
  if (user.password) {
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new AppError('Invalid Haka ID or password', 401);
    return;
  }

  if (!allowDevPasswordFallback) {
    throw new AppError('Invalid Haka ID or password', 401);
  }

  const expectedPassword = process.env.DEV_LOGIN_PASSWORD;
  if (!expectedPassword) throw new AppError('DEV_LOGIN_PASSWORD is not configured', 500);
  if (password !== expectedPassword) {
    throw new AppError('Invalid Haka ID or password', 401);
  }
}

/** Resolve user by 9-digit public hakaId or active (non-expired) 6-digit VIP special ID. */
async function findUserForHakaLogin(identifier: string): Promise<HakaIdUser | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const byHakaId = await prisma.user.findUnique({
    where: { hakaId: trimmed },
    include: hakaIdUserInclude,
  });
  if (byHakaId) return byHakaId;

  if (!SPECIAL_ID_REGEX.test(trimmed)) return null;

  const now = new Date();
  return prisma.user.findFirst({
    where: {
      activeSpecialId: trimmed,
      OR: [{ activeSpecialIdExpiresAt: null }, { activeSpecialIdExpiresAt: { gt: now } }],
    },
    include: hakaIdUserInclude,
  });
}

async function finalizeHakaIdLogin(user: NonNullable<HakaIdUser>, device?: DeviceInfo): Promise<AuthResult> {
  if (await isUserBanned(user.id)) {
    throw new AppError('Your account has been suspended.', 403);
  }

  if (device?.deviceId) {
    await upsertUserDeviceForSession(user.id, device);
  }

  const tokens = await issueTokens(user.id, user.role);
  return { user: toSafeUser(user), tokens };
}

/**
 * Production login by Haka ID + password (bcrypt hash required on the user).
 */
export async function loginWithHakaId(hakaId: string, password: string, device?: DeviceInfo): Promise<AuthResult> {
  const user = await findUserForHakaLogin(hakaId);
  if (!user) throw new AppError('Invalid Haka ID or password', 401);

  await verifyHakaIdPassword(user, password, false);
  return finalizeHakaIdLogin(user, device);
}

/**
 * Dev-only: login by Haka ID + password.
 * If the user has an admin-reset password hash stored, it is verified with bcrypt.
 * Otherwise falls back to the shared DEV_LOGIN_PASSWORD env variable.
 * Never available in production.
 */
export async function devLoginWithHakaId(hakaId: string, password: string, device?: DeviceInfo): Promise<AuthResult> {
  const user = await findUserForHakaLogin(hakaId);
  if (!user) throw new AppError('Invalid Haka ID or password', 401);

  await verifyHakaIdPassword(user, password, true);
  return finalizeHakaIdLogin(user, device);
}


/** E.164-style phone from Supabase Auth (always includes leading + when present). */
export function normalizeAuthPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `+${digits}` : null;
}

/**
 * Verify a Supabase access token, upsert the User in DB, and return a token pair.
 * Called by POST /api/v1/auth/supabase (Google / Apple / Phone via Supabase Auth)
 */
export async function loginWithSupabase(accessToken: string, device?: DeviceInfo): Promise<AuthResult> {
  if (!supabase) throw new AppError('Supabase is not configured', 500);

  const deviceId = device?.deviceId;
  const [supabaseResult, deviceBanned] = await Promise.all([
    supabase.auth.getUser(accessToken),
    deviceId ? isDeviceBanned(deviceId) : Promise.resolve(false),
  ]);

  if (deviceBanned) {
    throw new AppError('This device has been banned. Contact support.', 403);
  }

  const { data: { user: sbUser }, error } = supabaseResult;
  if (error || !sbUser) {
    const tokenRef = supabaseJwtProjectRef(accessToken);
    const configuredRef = configuredSupabaseProjectRef();
    console.warn('[auth/supabase] getUser failed', {
      tokenRef,
      configuredRef,
      mismatch: tokenRef && configuredRef ? tokenRef !== configuredRef : undefined,
      message: error?.message,
    });
    throw new AppError('Invalid Supabase access token', 401);
  }

  const { id: supabaseUid, email, user_metadata, app_metadata } = sbUser;
  const phone = normalizeAuthPhone(sbUser.phone);
  const displayName: string = user_metadata?.full_name ?? user_metadata?.name ?? '';
  const avatar: string = user_metadata?.avatar_url ?? user_metadata?.picture ?? '';

  // Which social identities Supabase has linked to this auth user. Drives the
  // Account Security "Google" row, which is auto-linked (no manual bind step).
  const providers: string[] = Array.isArray(app_metadata?.providers)
    ? app_metadata.providers
    : app_metadata?.provider
      ? [app_metadata.provider]
      : [];
  const googleLinked = providers.includes('google');

  // Link: supabaseUid → email → phone (migrates legacy Firebase phone users on same number)
  const linkOr: Array<{ supabaseUid?: string; email?: string; phone?: string | null }> = [
    { supabaseUid },
  ];
  if (email) linkOr.push({ email });
  if (phone) linkOr.push({ phone });

  const candidates = await prisma.user.findMany({
    where: { OR: linkOr },
    include: hakaIdUserInclude,
  });
  const existing =
    candidates.find((u) => u.supabaseUid === supabaseUid) ??
    (email ? candidates.find((u) => u.email === email) : undefined) ??
    (phone ? candidates.find((u) => u.phone === phone) : undefined) ??
    null;

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          supabaseUid: existing.supabaseUid ?? supabaseUid,
          email: email ?? undefined,
          phone: phone ?? undefined,
          displayName: existing.displayName || displayName || undefined,
          avatar: existing.avatar || avatar || undefined,
          // Only ever set the link on (never clear it from a later non-Google login).
          googleLinked: googleLinked || undefined,
        },
        include: { coinSellerProfile: { select: { id: true } } },
      })
    : await prisma.user.create({
        data: { supabaseUid, email: email ?? null, phone, displayName, avatar, googleLinked },
        include: { coinSellerProfile: { select: { id: true } } },
      });

  if (await isUserBanned(user.id)) {
    throw new AppError('Your account has been suspended.', 403);
  }

  if (device?.deviceId) {
    await upsertUserDeviceForSession(user.id, device);
  }

  const tokens = await issueTokens(user.id, user.role);
  return { user: toSafeUser(user), tokens };
}

/**
 * Find-or-create a user by verified phone number, then issue backend JWTs.
 * The caller (WhatsApp OTP controller) MUST have already verified the OTP for this phone.
 * Identity maps by `User.phone` (@unique): existing phone users (incl. legacy Supabase/Firebase
 * phone signups) are found seamlessly; new numbers create an onboarding-pending account.
 * Mirrors the `POST /auth/supabase` response shape.
 */
export async function loginWithPhone(phone: string, device?: DeviceInfo): Promise<AuthResult> {
  const normalized = normalizeAuthPhone(phone);
  if (!normalized) throw new AppError('A valid phone number is required', 400);

  if (device?.deviceId && (await isDeviceBanned(device.deviceId))) {
    throw new AppError('This device has been banned. Contact support.', 403);
  }

  const existing = await prisma.user.findUnique({
    where: { phone: normalized },
    include: hakaIdUserInclude,
  });

  const user =
    existing ??
    (await prisma.user.create({
      data: { phone: normalized },
      include: hakaIdUserInclude,
    }));

  if (await isUserBanned(user.id)) {
    throw new AppError('Your account has been suspended.', 403);
  }

  if (device?.deviceId) {
    await upsertUserDeviceForSession(user.id, device);
  }

  const tokens = await issueTokens(user.id, user.role);
  return { user: toSafeUser(user), tokens };
}

/**
 * Rotate a refresh token: delete old, issue new pair.
 * Called by POST /api/v1/auth/refresh
 */
// Window during which an already-rotated refresh token still resolves to its
// successor. Absorbs the cold-start race (startup refresh + a 401-triggered
// refresh both presenting the same token) and network-retried refresh calls.
const REFRESH_ROTATION_GRACE_MS = 60_000;

export async function refreshTokens(token: string, device?: DeviceInfo): Promise<TokenPair> {
  // Device-ban check stays outside the row-lock transaction (it needs no lock and
  // avoids holding the tx open across an unrelated query).
  if (device?.deviceId && (await isDeviceBanned(device.deviceId))) {
    throw new AppError('This device has been banned. Contact support.', 403);
  }

  const { pair, userId } = await prisma.$transaction(async (tx) => {
    // Lock the presented token row so concurrent refreshes serialize instead of
    // racing to rotate it. The loser then observes rotatedAt and resolves via grace.
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        userId: string;
        expiresAt: Date;
        rotatedAt: Date | null;
        replacedByToken: string | null;
      }>
    >`
      SELECT id, "userId", "expiresAt", "rotatedAt", "replacedByToken"
      FROM refresh_tokens
      WHERE token = ${token}
      FOR UPDATE
    `;
    const stored = rows[0];

    if (!stored) throw new AppError('Invalid refresh token', 401);

    if (stored.expiresAt < new Date()) {
      await tx.refreshToken.delete({ where: { id: stored.id } });
      throw new AppError('Refresh token expired', 401);
    }

    const user = await tx.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) throw new AppError('User not found', 401);

    // Token was already rotated by a concurrent/earlier call.
    if (stored.rotatedAt) {
      const withinGrace =
        stored.replacedByToken != null &&
        Date.now() - stored.rotatedAt.getTime() <= REFRESH_ROTATION_GRACE_MS;
      if (withinGrace) {
        // Converge on the successor the winning call already issued; pair it with
        // a fresh access token. Both racers end up holding the same refresh token.
        return {
          pair: {
            accessToken: signAccessToken({ sub: user.id, role: user.role }),
            refreshToken: stored.replacedByToken as string,
          },
          userId: user.id,
        };
      }
      // Reuse outside the grace window — stale or replayed token. Reject.
      throw new AppError('Invalid refresh token', 401);
    }

    // Primary rotation: mint the successor and mark the old token rotated (kept for
    // the grace window rather than deleted).
    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const newRefreshToken = uuidv4();
    await tx.refreshToken.create({
      data: { token: newRefreshToken, userId: user.id, expiresAt: refreshTokenExpiresAt() },
    });
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { rotatedAt: new Date(), replacedByToken: newRefreshToken },
    });

    // Opportunistic cleanup: drop this user's tokens rotated long enough ago that
    // their grace window has closed, so rotated rows don't accumulate until expiry.
    await tx.refreshToken.deleteMany({
      where: {
        userId: user.id,
        rotatedAt: { lt: new Date(Date.now() - REFRESH_ROTATION_GRACE_MS) },
      },
    });

    return { pair: { accessToken, refreshToken: newRefreshToken }, userId: user.id };
  });

  if (device?.deviceId) {
    await upsertUserDeviceForSession(userId, device);
  }

  return pair;
}

/**
 * Revoke a single refresh token (logout from one device).
 * Called by POST /api/v1/auth/logout
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

/**
 * Revoke ALL refresh tokens for the user (logout from all devices).
 * Called by POST /api/v1/auth/logout-all
 */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

/**
 * Return the current authenticated user.
 * Called by GET /api/v1/auth/me
 */
export async function getMe(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      coinSellerProfile: { select: { id: true } },
      payrollAgentProfile: { select: { status: true } },
      storeItems: {
        where: equippedStoreItemsWhere(),
        select: {
          item: { select: { id: true, name: true, image: true, previewImage: true, category: true, level: true } },
        },
      },
      tags: userTagsOrderedInclude,
    },
  });
  if (!user) throw new AppError('User not found', 404);

  // Backfill: if activeSpecialId exists but level is missing, resolve from inventory
  if (user.activeSpecialId && !user.activeSpecialIdLevel) {
    const inv = await prisma.specialIdInventory.findFirst({
      where: { userId, status: 'active' },
      include: { specialId: { select: { level: true } } },
    });
    if (inv) {
      user.activeSpecialIdLevel = inv.specialId.level;
      await prisma.user.update({
        where: { id: userId },
        data: { activeSpecialIdLevel: inv.specialId.level },
      });
    }
  }

  const tags: TagSummary[] = mapSortedUserTags(user.tags);
  const { canInspectAllStateRankings } = await import(
    '../leaderboard/state-ranking.service'
  );
  const canInspectStateRankings = await canInspectAllStateRankings(userId);
  return toSafeUser(user, tags, { canInspectStateRankings });
}

/**
 * Complete onboarding: set username, displayName, country, generate hakaId.
 * Forward-only — cannot be called again once onboardingComplete is true.
 * Called by PATCH /api/v1/auth/onboarding
 */
export async function completeOnboarding(
  userId: string,
  data: {
    username: string;
    displayName: string;
    country: string;
    city?: string;
    state?: string;
    gender?: string;
    dateOfBirth?: Date;
  },
): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  if (user.onboardingComplete) throw new AppError('Onboarding already completed', 400);

  if (data.state?.trim()) {
    const { isValidStateForCountry, normalizeCountryCode } = await import(
      '../leaderboard/state-ranking.constants'
    );
    if (!isValidStateForCountry(normalizeCountryCode(data.country), data.state)) {
      throw new AppError('Invalid state for selected country', 400);
    }
  }

  // Check username uniqueness
  const taken = await prisma.user.findUnique({ where: { username: data.username } });
  if (taken) throw new AppError('Username already taken', 409);

  const hakaId = await generateUniqueHakaId();

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      username: data.username,
      displayName: data.displayName,
      country: data.country,
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.state !== undefined ? { state: data.state.trim().toUpperCase() } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
      hakaId,
      onboardingComplete: true,
    },
    include: { coinSellerProfile: { select: { id: true } } },
  });

  // Greet the brand-new member with a one-time Haka Team welcome DM. Fire-and-forget
  // so a chat/socket hiccup never fails onboarding. completeOnboarding runs exactly
  // once per user (guarded above), so this won't double-send.
  scheduleWelcomeDm(updated.id);

  return toSafeUser(updated);
}

/**
 * Update profile fields (avatar, bio, displayName).
 * Called by PATCH /api/v1/auth/profile
 */
export async function updateProfile(
  userId: string,
  data: {
    displayName?: string;
    bio?: string;
    avatar?: string;
    country?: string;
    city?: string;
    state?: string;
    gender?: string;
    dateOfBirth?: Date | null;
    preferredWithdrawalCountryCode?: string;
  },
): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingComplete: true, hakaId: true, country: true, gender: true, state: true },
  });
  if (!user) throw new AppError('User not found', 404);

  const locked =
    user.onboardingComplete && user.hakaId != null && user.hakaId !== '';

  if (locked) {
    if (data.country !== undefined && data.country !== user.country) {
      throw new AppError(
        'Country cannot be changed after your Haka ID is created. Contact support if you need help.',
        400,
      );
    }
    if (data.gender !== undefined && data.gender !== user.gender) {
      throw new AppError(
        'Gender cannot be changed after your Haka ID is created. Contact support if you need help.',
        400,
      );
    }
    if (data.state !== undefined && data.state !== user.state) {
      throw new AppError(
        'State cannot be changed after your Haka ID is created. Contact support if you need help.',
        400,
      );
    }
  }

  if (data.state !== undefined && data.state.trim()) {
    const country = data.country ?? user.country;
    const { isValidStateForCountry, normalizeCountryCode } = await import(
      '../leaderboard/state-ranking.constants'
    );
    if (!isValidStateForCountry(normalizeCountryCode(country), data.state)) {
      throw new AppError('Invalid state for selected country', 400);
    }
    data.state = data.state.trim().toUpperCase();
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    include: { coinSellerProfile: { select: { id: true } } },
  });
  return toSafeUser(updated);
}

/**
 * Bind a phone number to the current user's account.
 * Accepts a Supabase access token from phone OTP verification.
 * Called by PATCH /api/v1/auth/bind-phone
 */
export async function bindPhone(userId: string, accessToken: string): Promise<{ phone: string }> {
  if (!supabase) throw new AppError('Supabase is not configured', 500);

  const { data: { user: sbUser }, error } = await supabase.auth.getUser(accessToken);
  if (error || !sbUser) throw new AppError('Invalid Supabase access token', 401);

  const phone = normalizeAuthPhone(sbUser.phone);
  if (!phone) throw new AppError('Supabase session does not contain a phone number', 400);

  // Ensure no other account already owns this phone
  const existing = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } }, select: { id: true } });
  if (existing) throw new AppError('This phone number is already linked to another account', 409);

  await prisma.user.update({ where: { id: userId }, data: { phone } });
  return { phone };
}

/**
 * Bind an already-OTP-verified phone number to the current user's account.
 * The caller (WhatsApp OTP controller) MUST have already verified the OTP for this phone.
 * Same collision check + update + return shape as `bindPhone`, minus the Supabase token step.
 */
export async function bindPhoneByValue(userId: string, phone: string): Promise<{ phone: string }> {
  const normalized = normalizeAuthPhone(phone);
  if (!normalized) throw new AppError('A valid phone number is required', 400);

  const existing = await prisma.user.findFirst({
    where: { phone: normalized, NOT: { id: userId } },
    select: { id: true },
  });
  if (existing) throw new AppError('This phone number is already linked to another account', 409);

  await prisma.user.update({ where: { id: userId }, data: { phone: normalized } });
  return { phone: normalized };
}

/**
 * Set or change the user's password.
 * Every change must be confirmed with an email OTP: the caller passes a Supabase
 * access token obtained from `signInWithOtp({ email }) → verifyOtp(...)`, and we
 * require its verified email to match the account's email. If the user already
 * has a password, currentPassword must also be provided and verified (2nd factor).
 * Called by PATCH /api/v1/auth/password
 */
export async function setPassword(
  userId: string,
  newPassword: string,
  accessToken: string,
  currentPassword?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, email: true },
  });
  if (!user) throw new AppError('User not found', 404);

  // The account must have an email to receive the verification OTP.
  if (!user.email) {
    throw new AppError('Add an email to your account before changing your password.', 400);
  }

  // Verify the Supabase email-OTP token and confirm it belongs to this account.
  if (!supabase) throw new AppError('Email verification is not configured', 500);
  let verifiedEmail: string | null = null;
  try {
    const { data: { user: sbUser }, error } = await supabase.auth.getUser(accessToken);
    if (error || !sbUser) throw new Error('invalid token');
    verifiedEmail = sbUser.email ?? null;
  } catch {
    throw new AppError('Email verification failed. Please request a new code.', 401);
  }
  if (!verifiedEmail || verifiedEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError('The verification code does not match your account email.', 403);
  }

  if (user.password) {
    if (!currentPassword) throw new AppError('Current password is required', 400);
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new AppError('Current password is incorrect', 401);
  }

  const hash = await bcrypt.hash(newPassword, 12);
  let snapshot = '';
  try {
    snapshot = encryptPasswordSnapshot(newPassword);
  } catch {
    // PAYMENT_ENCRYPTION_KEY not configured — still save hash; admin sees ••••••
  }
  await prisma.user.update({
    where: { id: userId },
    data: { password: hash, passwordSnapshot: snapshot },
  });
}

/**
 * List all registered devices for the user.
 * Called by GET /api/v1/auth/devices
 */
export async function getDevices(userId: string): Promise<DeviceEntry[]> {
  const devices = await prisma.userDevice.findMany({
    where: { userId },
    orderBy: { lastLoginAt: 'desc' },
  });
  return devices.map((d) => ({
    id: d.id,
    deviceId: d.deviceId,
    deviceModel: d.deviceModel,
    platform: d.platform,
    appVersion: d.appVersion,
    lastLoginAt: d.lastLoginAt,
    createdAt: d.createdAt,
  }));
}

/**
 * Remove a device from the user's device list.
 * Called by DELETE /api/v1/auth/devices/:deviceId
 */
export async function removeDevice(userId: string, deviceId: string): Promise<void> {
  const device = await prisma.userDevice.findFirst({ where: { userId, deviceId } });
  if (!device) throw new AppError('Device not found', 404);
  await prisma.userDevice.delete({ where: { id: device.id } });
}
