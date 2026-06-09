import { prisma } from '../../config/prisma';
import { supabase } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { forceLogout } from '../moderation/revocation.service';
import { deleteUserFace } from '../face-verification/rekognition-faces.service';
import { FACE_STORAGE_BUCKET } from '../face-verification/face-verification.constants';

/**
 * Self-service account deletion (Google Play account-deletion requirement).
 *
 * Strategy: anonymize-in-place. The User row survives with all PII stripped so
 * financial/ledger records (gifts, wallet transactions, payments, withdrawals,
 * payroll) keep their FK integrity for legal retention. The person can
 * re-register fresh because every unique identity column is set to NULL.
 */

const AVATAR_BUCKET = 'admin-uploads'; // avatars live under u/{userId}/ (see profile.routes.ts)
export const DELETION_SUPPORT_EMAIL = 'support@hakalive.com';

export type DeletionBlockCode =
  | 'pending_withdrawal'
  | 'owned_agency'
  | 'owned_family'
  | 'coin_seller_balance'
  | 'live_room';

export interface DeletionBlockReason {
  code: DeletionBlockCode;
  message: string;
}

export interface DeletionEligibility {
  eligible: boolean;
  reasons: DeletionBlockReason[];
}

/**
 * Pure read — shared by GET /auth/me/deletion-eligibility (UI pre-check) and
 * the DELETE endpoint itself, so both paths apply identical rules.
 */
export async function checkDeletionEligibility(userId: string): Promise<DeletionEligibility> {
  const [pendingWithdrawal, ownedAgency, ownedFamily, coinSeller, liveRoom] = await Promise.all([
    prisma.withdrawalRequest.findFirst({
      where: { userId, status: { notIn: ['completed', 'rejected'] } },
      select: { id: true },
    }),
    prisma.agency.findFirst({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true },
    }),
    prisma.family.findFirst({ where: { ownerId: userId }, select: { id: true } }),
    prisma.coinSellerProfile.findUnique({
      where: { userId },
      select: { availableBalance: true, securityDeposit: true },
    }),
    prisma.room.findFirst({
      where: { hostId: userId, status: 'live' },
      select: { id: true },
    }),
  ]);

  const reasons: DeletionBlockReason[] = [];
  if (pendingWithdrawal) {
    reasons.push({
      code: 'pending_withdrawal',
      message: 'You have a withdrawal request that is still being processed.',
    });
  }
  if (ownedAgency) {
    reasons.push({
      code: 'owned_agency',
      message: 'You own an active agency. Transfer or dissolve it first.',
    });
  }
  if (ownedFamily) {
    reasons.push({
      code: 'owned_family',
      message: 'You own a family. Transfer or dissolve it first.',
    });
  }
  if (coinSeller && (coinSeller.availableBalance > 0n || coinSeller.securityDeposit > 0n)) {
    reasons.push({
      code: 'coin_seller_balance',
      message: 'Your coin seller account still holds a balance or security deposit.',
    });
  }
  if (liveRoom) {
    reasons.push({
      code: 'live_room',
      message: 'You are currently hosting a live room. End it first.',
    });
  }

  return { eligible: reasons.length === 0, reasons };
}

export type DeletionResult = { deleted: true } | { alreadyDeleted: true };

/**
 * Execute the deletion. Ordering is crash-safe:
 *  1. Idempotency check (already deleted → no-op success).
 *  2. Eligibility re-check (race protection vs. the UI pre-check).
 *  3. ONE $transaction: wipe refresh tokens + anonymize User row + audit row.
 *     After commit the account cannot be refreshed (tokens gone, isActive=false)
 *     and no login path can match it (phone/hakaId/email/UIDs are NULL).
 *  4. Best-effort external cleanup (Redis revocation, Supabase auth,
 *     storage, Rekognition). Failures are logged, never re-thrown — the DB
 *     invariant already holds, and a retry of each cleanup is idempotent.
 */
export async function selfDeleteAccount(userId: string, ipAddress?: string): Promise<DeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      phone: true,
      hakaId: true,
      supabaseUid: true,
      faceEnrollmentId: true,
    },
  });
  if (!user) throw new AppError('User not found', 404);
  if (user.deletedAt) return { alreadyDeleted: true };

  const eligibility = await checkDeletionEligibility(userId);
  if (!eligibility.eligible) {
    throw new AppError(
      `Account cannot be deleted: ${eligibility.reasons.map((r) => r.message).join(' ')} ` +
        `Please contact ${DELETION_SUPPORT_EMAIL} for help.`,
      409,
    );
  }

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        // Unique identity columns → NULL so the person can re-register fresh.
        phone: null,
        email: null,
        username: null,
        hakaId: null,
        supabaseUid: null,
        password: null,
        // PII content.
        displayName: 'Deleted User',
        avatar: '',
        bio: '',
        country: '',
        city: '',
        preferredWithdrawalCountryCode: '',
        gender: '',
        dateOfBirth: null,
        locationLat: null,
        locationLng: null,
        locationUpdatedAt: null,
        passwordSnapshot: '',
        facePhotoUrl: '',
        faceVerificationStatus: 'none',
        faceEnrollmentId: '',
        faceRejectedReason: '',
        faceVerifiedAt: null,
        fcmToken: null,
        // State flags.
        isActive: false,
        profileHidden: true, // exclude from search/discovery
        onboardingComplete: false,
        deletedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        adminId: userId, // actor is the user themselves; action string disambiguates
        action: 'user.self_delete',
        targetType: 'User',
        targetId: userId,
        metadata: {
          phoneLast4: user.phone?.slice(-4) ?? null,
          hakaId: user.hakaId,
        },
        ipAddress: ipAddress ?? '',
      },
    }),
  ]);

  // ── Best-effort post-commit cleanup ──────────────────────────────────────
  await forceLogout(userId, 'account_deleted').catch((err) => {
    console.error('[account-deletion] forceLogout failed', { userId, err });
  });

  if (user.supabaseUid && supabase) {
    await supabase.auth.admin.deleteUser(user.supabaseUid).catch((err: unknown) => {
      console.error('[account-deletion] Supabase auth deletion failed', { userId, err });
    });
  }

  await deleteUserStorage(userId).catch((err) => {
    console.error('[account-deletion] storage cleanup failed', { userId, err });
  });

  if (user.faceEnrollmentId) {
    await deleteUserFace(user.faceEnrollmentId).catch((err) => {
      console.error('[account-deletion] Rekognition face deletion failed', { userId, err });
    });
  }

  return { deleted: true };
}

/**
 * Remove the user's storage objects: avatars under u/{userId}/ and face
 * verification frames under face-verification/{userId}/{sessionId}/.
 * Best-effort — caller swallows errors.
 */
async function deleteUserStorage(userId: string): Promise<void> {
  if (!supabase) return;

  // Avatars: flat files directly under u/{userId}/.
  const avatarPrefix = `u/${userId}`;
  const { data: avatarFiles } = await supabase.storage.from(AVATAR_BUCKET).list(avatarPrefix, { limit: 100 });
  if (avatarFiles && avatarFiles.length > 0) {
    await supabase.storage
      .from(AVATAR_BUCKET)
      .remove(avatarFiles.map((f) => `${avatarPrefix}/${f.name}`));
  }

  // Face frames: one folder level per session — list sessions, then files.
  const facePrefix = `face-verification/${userId}`;
  const { data: sessions } = await supabase.storage.from(FACE_STORAGE_BUCKET).list(facePrefix, { limit: 100 });
  for (const session of sessions ?? []) {
    const sessionPrefix = `${facePrefix}/${session.name}`;
    const { data: frames } = await supabase.storage
      .from(FACE_STORAGE_BUCKET)
      .list(sessionPrefix, { limit: 100 });
    if (frames && frames.length > 0) {
      await supabase.storage
        .from(FACE_STORAGE_BUCKET)
        .remove(frames.map((f) => `${sessionPrefix}/${f.name}`));
    }
  }
}
