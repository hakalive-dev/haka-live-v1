import { supabase } from '../../config/supabase';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { logAdminAction } from '../../utils/audit';
import {
  FACE_CHALLENGE_KEYS,
  FACE_CHALLENGE_STEPS,
  FACE_STORAGE_BUCKET,
} from './face-verification.constants';
import { indexUserFace, validateSessionFrames, deleteUserFace } from './rekognition-faces.service';
import {
  notifyAdminsFaceVerificationSubmitted,
  notifyUserFaceVerificationApproved,
  notifyUserFaceVerificationRejected,
} from './face-verification-notify.service';

export function getChallengeDefinitions() {
  return FACE_CHALLENGE_STEPS;
}

export async function getUserFaceStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      faceVerificationStatus: true,
      facePhotoUrl: true,
      faceRejectedReason: true,
      faceVerifiedAt: true,
    },
  });
  if (!user) throw new AppError('User not found', 404);

  const pendingSession = await prisma.faceVerificationSession.findFirst({
    where: { userId, status: 'pending_admin' },
    orderBy: { submittedAt: 'desc' },
    select: { id: true, submittedAt: true },
  });

  return {
    status: user.faceVerificationStatus,
    facePhotoUrl: user.faceVerificationStatus === 'approved' ? user.facePhotoUrl : '',
    rejectReason: user.faceRejectedReason,
    verifiedAt: user.faceVerifiedAt,
    pendingSessionId: pendingSession?.id ?? null,
    canStart: !['approved', 'pending_admin'].includes(user.faceVerificationStatus),
  };
}

export async function createSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { faceVerificationStatus: true },
  });
  if (!user) throw new AppError('User not found', 404);
  if (user.faceVerificationStatus === 'approved') {
    throw new AppError('Face verification already approved', 400);
  }
  if (user.faceVerificationStatus === 'pending_admin') {
    throw new AppError('Verification is under admin review', 400);
  }

  await prisma.faceVerificationSession.updateMany({
    where: { userId, status: 'in_progress' },
    data: { status: 'cancelled' },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      faceVerificationStatus: 'in_progress',
      faceRejectedReason: '',
    },
  });
  const session = await prisma.faceVerificationSession.create({
    data: {
      userId,
      status: 'in_progress',
      frameUrls: {},
      challengeResults: [],
    },
  });

  return {
    sessionId: session.id,
    challenges: FACE_CHALLENGE_STEPS,
  };
}

export async function signFrameUpload(
  userId: string,
  sessionId: string,
  step: string,
  ext: 'jpg' | 'jpeg' | 'png' | 'webp',
) {
  if (!FACE_CHALLENGE_KEYS.includes(step as (typeof FACE_CHALLENGE_KEYS)[number])) {
    throw new AppError('Invalid challenge step', 400);
  }

  const session = await prisma.faceVerificationSession.findFirst({
    where: { id: sessionId, userId, status: 'in_progress' },
  });
  if (!session) throw new AppError('Session not found or already submitted', 404);
  if (!supabase) throw new AppError('Storage not configured', 500);

  const path = `face-verification/${userId}/${sessionId}/${step}.${ext}`;
  const { data, error } = await supabase.storage
    .from(FACE_STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new AppError(`Failed to sign upload: ${error?.message ?? 'unknown'}`, 500);
  }
  const { data: pub } = supabase.storage.from(FACE_STORAGE_BUCKET).getPublicUrl(path);

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: pub.publicUrl,
  };
}

export async function registerFrame(
  userId: string,
  sessionId: string,
  step: string,
  publicUrl: string,
) {
  if (!FACE_CHALLENGE_KEYS.includes(step as (typeof FACE_CHALLENGE_KEYS)[number])) {
    throw new AppError('Invalid challenge step', 400);
  }

  const session = await prisma.faceVerificationSession.findFirst({
    where: { id: sessionId, userId, status: 'in_progress' },
  });
  if (!session) throw new AppError('Session not found or already submitted', 404);

  const frameUrls = {
    ...(session.frameUrls as Record<string, string>),
    [step]: publicUrl,
  };

  await prisma.faceVerificationSession.update({
    where: { id: sessionId },
    data: { frameUrls },
  });

  return { frameUrls, completedSteps: Object.keys(frameUrls) };
}

export async function submitSession(userId: string, sessionId: string) {
  const session = await prisma.faceVerificationSession.findFirst({
    where: { id: sessionId, userId, status: 'in_progress' },
  });
  if (!session) throw new AppError('Session not found or already submitted', 404);

  const frameUrls = session.frameUrls as Record<string, string>;

  try {
    const { referenceUrl, similarities } = await validateSessionFrames(
      frameUrls,
      [...FACE_CHALLENGE_KEYS],
    );

    const challengeResults = FACE_CHALLENGE_KEYS.map((key) => ({
      key,
      passed: true,
      frameUrl: frameUrls[key],
      similarity: similarities[key] ?? null,
    }));

    await prisma.$transaction([
      prisma.faceVerificationSession.update({
        where: { id: sessionId },
        data: {
          status: 'pending_admin',
          referenceFrameUrl: referenceUrl,
          challengeResults,
          submittedAt: new Date(),
          rejectReason: '',
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          faceVerificationStatus: 'pending_admin',
          faceRejectedReason: '',
        },
      }),
    ]);

    void notifyAdminsFaceVerificationSubmitted(userId, sessionId).catch(() => {});

    return {
      status: 'pending_admin',
      message: 'Verification submitted. An admin will review your submission.',
    };
  } catch (err) {
    const reason =
      err instanceof AppError ? err.message : 'Automated verification failed';

    await prisma.$transaction([
      prisma.faceVerificationSession.update({
        where: { id: sessionId },
        data: {
          status: 'auto_rejected',
          rejectReason: reason,
          submittedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          faceVerificationStatus: 'rejected',
          faceRejectedReason: reason,
        },
      }),
    ]);

    notifyUserFaceVerificationRejected(userId, sessionId, reason);

    throw err instanceof AppError ? err : new AppError(reason, 400);
  }
}

export async function listPendingSessions(params: {
  page: number;
  limit: number;
}) {
  const { page, limit } = params;
  const skip = (page - 1) * limit;
  const where = { status: 'pending_admin' };

  const [items, total] = await Promise.all([
    prisma.faceVerificationSession.findMany({
      where,
      skip,
      take: limit,
      orderBy: { submittedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            hakaId: true,
            avatar: true,
            facePhotoUrl: true,
          },
        },
      },
    }),
    prisma.faceVerificationSession.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSessionDetail(sessionId: string) {
  const session = await prisma.faceVerificationSession.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          hakaId: true,
          avatar: true,
          faceVerificationStatus: true,
        },
      },
    },
  });
  if (!session) throw new AppError('Session not found', 404);
  return session;
}

export async function approveSession(
  adminId: string,
  sessionId: string,
  ipAddress?: string,
) {
  const session = await prisma.faceVerificationSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) throw new AppError('Session not found', 404);
  if (session.status !== 'pending_admin') {
    throw new AppError('Session is not pending review', 400);
  }

  const referenceUrl = session.referenceFrameUrl || (session.frameUrls as Record<string, string>).nod;
  if (!referenceUrl) throw new AppError('No reference frame on session', 400);

  const faceEnrollmentId = await indexUserFace(session.userId, referenceUrl);

  await prisma.$transaction([
    prisma.faceVerificationSession.update({
      where: { id: sessionId },
      data: {
        status: 'admin_approved',
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
      },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: {
        faceVerificationStatus: 'approved',
        facePhotoUrl: referenceUrl,
        faceEnrollmentId,
        faceVerifiedAt: new Date(),
        faceRejectedReason: '',
      },
    }),
  ]);

  await logAdminAction(
    adminId,
    'face_verification.approve',
    'FaceVerificationSession',
    sessionId,
    { userId: session.userId, faceEnrollmentId },
    ipAddress,
  );

  notifyUserFaceVerificationApproved(session.userId, sessionId);

  return { approved: true, faceEnrollmentId };
}

export async function rejectSession(
  adminId: string,
  sessionId: string,
  reason: string,
  ipAddress?: string,
) {
  const session = await prisma.faceVerificationSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new AppError('Session not found', 404);
  if (session.status !== 'pending_admin') {
    throw new AppError('Session is not pending review', 400);
  }

  const rejectReason = reason.trim() || 'Rejected by admin';

  await prisma.$transaction([
    prisma.faceVerificationSession.update({
      where: { id: sessionId },
      data: {
        status: 'admin_rejected',
        rejectReason,
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
      },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: {
        faceVerificationStatus: 'rejected',
        faceRejectedReason: rejectReason,
      },
    }),
  ]);

  await logAdminAction(
    adminId,
    'face_verification.reject',
    'FaceVerificationSession',
    sessionId,
    { userId: session.userId, reason: rejectReason },
    ipAddress,
  );

  notifyUserFaceVerificationRejected(session.userId, sessionId, rejectReason);

  return { rejected: true };
}

/** Admin: force user to re-enroll face verification from scratch. */
export async function resetFaceVerification(
  userId: string,
  adminId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      faceEnrollmentId: true,
      faceVerificationStatus: true,
    },
  });
  if (!user) throw new AppError('User not found', 404);

  if (user.faceEnrollmentId) {
    await deleteUserFace(user.faceEnrollmentId);
  }

  await prisma.$transaction([
    prisma.faceVerificationSession.updateMany({
      where: {
        userId,
        status: { in: ['in_progress', 'pending_admin'] },
      },
      data: { status: 'cancelled' },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        faceVerificationStatus: 'none',
        facePhotoUrl: '',
        faceEnrollmentId: '',
        faceVerifiedAt: null,
        faceRejectedReason: '',
      },
    }),
  ]);

  await logAdminAction(
    adminId,
    'face.reset',
    'User',
    userId,
    { previousStatus: user.faceVerificationStatus },
    ipAddress,
  );

  return { reset: true };
}

export type FaceVerificationUserFields = {
  faceVerificationStatus: string;
  facePhotoUrl: string;
  faceRejectedReason: string;
};

export function mapFaceFieldsForClient(user: {
  faceVerificationStatus: string;
  facePhotoUrl: string;
  faceRejectedReason: string;
}): FaceVerificationUserFields {
  return {
    faceVerificationStatus: user.faceVerificationStatus,
    facePhotoUrl: user.faceVerificationStatus === 'approved' ? user.facePhotoUrl : '',
    faceRejectedReason: user.faceRejectedReason,
  };
}
