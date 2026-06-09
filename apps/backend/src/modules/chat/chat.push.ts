import type { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { assertCannotReplyToSystemDm } from './haka-team-guard';
import { isHakaTeamUserId } from '../../constants/haka-team';
import { isWithdrawalMessageUserId } from '../../constants/withdrawal-message';
import {
  createNotification,
  sendPushOnly,
  userWantsMessagePush,
  userAcceptsCalls,
  sendIncomingCallPush,
} from '../notifications/notifications.service';
import { generateRtcToken, getOrAssignUid } from '../rooms/agora.service';
import { getIO } from '../../sockets';
import { CALL_EVENTS } from '../../shared-types';
import { deriveCallChannelName } from './call-channel';

const PREVIEW_MAX = 120;

function truncate(s: string, max = PREVIEW_MAX) {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * After a DM is stored — persist in-app notification + FCM if recipient opted in.
 */
export async function notifyDmRecipient(opts: {
  recipientId: string;
  senderId: string;
  preview: string;
  messageType?: string;
}) {
  const { recipientId, senderId, preview, messageType = 'text' } = opts;
  if (!(await userWantsMessagePush(recipientId))) return;

  // FCM + in-app row sent via notifyAccountAlert (avoid duplicate push).
  if (
    messageType === 'seller_recharge_approved' ||
    messageType === 'support_reply' ||
    messageType === 'face_verification_approved' ||
    messageType === 'face_verification_rejected' ||
    messageType === 'coin_transfer' ||
    messageType === 'withdrawal_update'
  ) {
    return;
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { displayName: true },
  });
  const name = isHakaTeamUserId(senderId)
    ? 'Haka Team'
    : isWithdrawalMessageUserId(senderId)
      ? 'Withdrawal Message'
      : sender?.displayName?.trim() || 'Someone';

  let body: string;
  if (messageType === 'gift') {
    body = preview;
  } else if (messageType === 'image') {
    body = preview ? `📷 ${truncate(preview)}` : '📷 Photo';
  } else {
    body = truncate(preview);
  }

  let title: string;
  if (messageType === 'gift') {
    title = `${name} sent a gift`;
  } else if (messageType === 'image') {
    title = `${name} sent a photo`;
  } else {
    title = `Message from ${name}`;
  }

  void createNotification(
    recipientId,
    'dm',
    title,
    body,
    { senderId, messageType },
  ).catch(() => {});
}

/**
 * Room chat: push to host, seated users, members, and anyone currently in the Socket.io room
 * (excluding sender). Push-only to avoid flooding the notifications table.
 */
export async function notifyRoomChatRecipients(opts: {
  io: Server;
  roomId: string;
  senderId: string;
  preview: string;
  isImage?: boolean;
}) {
  const { io, roomId, senderId, preview, isImage } = opts;

  const socketIds = [...(io.sockets.adapter.rooms.get(roomId) ?? [])];
  const fromSockets = new Set<string>();
  for (const sid of socketIds) {
    const uid = io.sockets.sockets.get(sid)?.data?.userId as string | undefined;
    if (uid) fromSockets.add(uid);
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      title: true,
      hostId: true,
      seats: { where: { userId: { not: null } }, select: { userId: true } },
      members: { select: { userId: true } },
    },
  });
  if (!room) return;

  const recipientIds = new Set<string>([
    room.hostId,
    ...room.seats.map((s) => s.userId!),
    ...room.members.map((m) => m.userId),
    ...fromSockets,
  ]);
  recipientIds.delete(senderId);

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { displayName: true },
  });
  const senderName = sender?.displayName?.trim() || 'Someone';
  const body = isImage ? `${senderName} sent a photo` : truncate(preview);
  const title = `${room.title}: ${senderName}`;

  const settings = await prisma.userSettings.findMany({
    where: { userId: { in: [...recipientIds] } },
    select: { userId: true, messageNotifications: true },
  });
  const messagePushOff = new Set(
    settings.filter((s) => s.messageNotifications === false).map((s) => s.userId),
  );

  for (const uid of recipientIds) {
    if (messagePushOff.has(uid)) continue;
    void sendPushOnly(uid, title, body, {
      type: 'room_chat',
      roomId,
      senderId,
    }).catch(() => {});
  }
}

async function assertCanSignalCall(callerId: string, calleeId: string) {
  if (callerId === calleeId) throw new AppError('Invalid call target', 400);
  const callee = await prisma.user.findUnique({ where: { id: calleeId }, select: { id: true } });
  if (!callee) throw new AppError('User not found', 404);
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { actorId: callerId, targetId: calleeId },
        { actorId: calleeId, targetId: callerId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new AppError('You cannot call this user', 403);
}

/**
 * Signal callee over socket + high-priority FCM. Callee mints their own Agora token (same channel).
 */
export async function signalOutgoingVideoCall(callerId: string, calleeId: string) {
  assertCannotReplyToSystemDm(calleeId);
  await assertCanSignalCall(callerId, calleeId);

  if (!(await userAcceptsCalls(calleeId))) {
    throw new AppError('This user has disabled video calls', 403);
  }

  const caller = await prisma.user.findUnique({
    where: { id: callerId },
    select: { displayName: true },
  });
  const callerDisplayName = caller?.displayName?.trim() || 'Someone';

  const channel = deriveCallChannelName(callerId, calleeId);
  const calleeUid = await getOrAssignUid(calleeId, channel);
  const { token, appId, expiresAt } = generateRtcToken(channel, calleeUid, 'publisher');

  const payload = {
    callerId,
    callerDisplayName,
    channelId: channel,
    agoraToken: token,
    appId,
    uid: calleeUid,
    expiresAt: String(expiresAt),
  };

  try {
    getIO().to(`user:${calleeId}`).emit(CALL_EVENTS.INCOMING, payload);
  } catch {
    /* tests / no io */
  }

  void sendIncomingCallPush(
    calleeId,
    'Incoming video call',
    `${callerDisplayName} is calling`,
    {
      type: 'video_call',
      callerId,
      callerDisplayName,
      channelId: channel,
    },
  ).catch(() => {});
}

function emitCallToUser(targetUserId: string, event: string, peerId: string) {
  try {
    getIO().to(`user:${targetUserId}`).emit(event, { peerId });
  } catch {
    /* tests / no io */
  }
}

/** Callee declined — notify caller. */
export async function signalCallDeclined(calleeId: string, callerId: string) {
  assertCannotReplyToSystemDm(callerId);
  await assertCanSignalCall(calleeId, callerId);
  emitCallToUser(callerId, CALL_EVENTS.DECLINED, calleeId);
}

/** Either party ended the call — notify the other user. */
export async function signalCallEnded(userId: string, otherId: string) {
  if (userId === otherId) throw new AppError('Invalid call target', 400);
  emitCallToUser(otherId, CALL_EVENTS.ENDED, userId);
}

/** Caller cancelled before callee answered — notify callee. */
export async function signalCallCancelled(callerId: string, calleeId: string) {
  assertCannotReplyToSystemDm(calleeId);
  await assertCanSignalCall(callerId, calleeId);
  emitCallToUser(calleeId, CALL_EVENTS.CANCELLED, callerId);
}
