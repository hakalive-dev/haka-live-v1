import type { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { isHakaTeamUserId } from '../../constants/haka-team';
import { isWithdrawalMessageUserId } from '../../constants/withdrawal-message';
import {
  createNotification,
  sendPushOnly,
  userWantsMessagePush,
} from '../notifications/notifications.service';

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

// 1:1 voice/video call signaling lives in call.service.ts (state machine + ring timeouts).
