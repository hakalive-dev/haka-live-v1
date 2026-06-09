import { prisma } from '../../config/prisma';
import { getHakaTeamUserId } from '../../constants/haka-team';
import { emitAdminDataChanged } from '../../sockets/admin-realtime';
import { insertServerDirectMessage } from '../chat/chat.service';
import { notifyAccountAlert } from '../notifications/notifications.service';
import { createAdminNotification } from '../admin/notifications/admin-notifications.service';

type HakaTeamFaceMessageType = 'face_verification_approved' | 'face_verification_rejected';

async function notifyUserViaHakaTeam(opts: {
  userId: string;
  sessionId: string;
  messageType: HakaTeamFaceMessageType;
  pushTitle: string;
  content: string;
}) {
  const hakaTeamId = getHakaTeamUserId();
  const body = opts.content.trim();
  const pushBody = body.split('\n')[0] ?? body;

  void insertServerDirectMessage({
    senderId: hakaTeamId,
    recipientId: opts.userId,
    content: body,
    messageType: opts.messageType,
  }).catch(() => {});

  void notifyAccountAlert(
    opts.userId,
    opts.messageType,
    opts.pushTitle,
    pushBody,
    {
      sessionId: opts.sessionId,
      senderId: hakaTeamId,
      messageType: opts.messageType,
      open: 'haka_team_dm',
    },
  ).catch(() => {});
}

/** Alert staff in the admin panel (realtime + notification bell). */
export async function notifyAdminsFaceVerificationSubmitted(
  userId: string,
  sessionId: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, hakaId: true },
  });

  await createAdminNotification({
    type: 'face_verification_submitted',
    title: 'Face verification pending review',
    body: `${user?.displayName ?? 'User'} (${user?.hakaId ?? '—'}) completed liveness verification`,
    linkPath: '/face-verifications',
    entityType: 'FaceVerificationSession',
    entityId: sessionId,
  });

  emitAdminDataChanged('face_verifications', { sessionId, status: 'pending_admin' });
}

export function notifyUserFaceVerificationApproved(userId: string, sessionId: string) {
  void notifyUserViaHakaTeam({
    userId,
    sessionId,
    messageType: 'face_verification_approved',
    pushTitle: 'Face verification approved',
    content:
      'Your face verification was approved. You are now face certified on Haka Live.',
  });
}

export function notifyUserFaceVerificationRejected(
  userId: string,
  sessionId: string,
  reason: string,
) {
  const trimmed = reason.trim();
  const content = trimmed
    ? `Your face verification was not approved.\nReason: ${trimmed}\nYou can try again from Profile → Authentication.`
    : 'Your face verification was not approved. You can try again from Profile → Authentication.';

  void notifyUserViaHakaTeam({
    userId,
    sessionId,
    messageType: 'face_verification_rejected',
    pushTitle: 'Face verification not approved',
    content,
  });
}
