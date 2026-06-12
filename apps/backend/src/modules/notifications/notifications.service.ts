import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { firebaseAdmin } from '../../config/firebase';
import { Prisma } from '@prisma/client';
import type { Message } from 'firebase-admin/messaging';
import { getIO } from '../../sockets';

function fcmDataPayload(data?: Record<string, unknown>) {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === undefined || v === null ? '' : String(v)]),
  );
}

async function sendFcmToToken(
  fcmToken: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    imageUrl?: string;
    highPriority?: boolean;
  },
) {
  const msg: Message = {
    token: fcmToken,
    notification: {
      title: payload.title,
      body: payload.body,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    },
    data: fcmDataPayload(payload.data),
    android: payload.highPriority ? { priority: 'high' } : undefined,
    apns: payload.highPriority
      ? {
          headers: { 'apns-priority': '10' },
          payload: {
            aps: {
              sound: 'default',
              contentAvailable: true,
            },
          },
        }
      : undefined,
  };
  await firebaseAdmin.messaging().send(msg);
}

/**
 * Broadcast push to all devices subscribed to an FCM topic (e.g. team announcements).
 */
export async function sendFcmToTopic(
  topic: string,
  payload: { title: string; body: string; data?: Record<string, unknown> },
) {
  try {
    const msg: Message = {
      topic,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: fcmDataPayload(payload.data),
    };
    await firebaseAdmin.messaging().send(msg);
  } catch {
    /* ignore FCM errors */
  }
}

/**
 * Whether the user wants message-related pushes (DM + room chat). Defaults true if no settings row.
 */
export async function userWantsMessagePush(userId: string): Promise<boolean> {
  const s = await prisma.userSettings.findUnique({
    where: { userId },
    select: { messageNotifications: true },
  });
  return s?.messageNotifications !== false;
}

/**
 * Whether the user accepts incoming 1:1 video calls. Defaults true if no settings row.
 */
export async function userAcceptsCalls(userId: string): Promise<boolean> {
  const s = await prisma.userSettings.findUnique({
    where: { userId },
    select: { callsEnabled: true },
  });
  return s?.callsEnabled !== false;
}

/**
 * FCM only (no in-app notification row). For high-volume or ephemeral alerts.
 */
export async function sendPushOnly(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: { imageUrl?: string; highPriority?: boolean },
) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (!user?.fcmToken) return;
    await sendFcmToToken(user.fcmToken, {
      title,
      body,
      data,
      imageUrl: options?.imageUrl,
      highPriority: options?.highPriority,
    });
  } catch {
    // ignore FCM errors
  }
}

/**
 * High-priority push for an incoming video call.
 *
 * Android: DATA-ONLY (no `notification` block) so the app's background FCM
 * handler can render the full-screen Notifee call UI instead of the SDK's
 * plain tray notification. Old builds without the handler show nothing —
 * the socket path still covers them in the foreground.
 *
 * iOS: regular APNs alert; `apns-collapse-id` = callId lets a later
 * "Missed video call" alert replace the ringing alert instead of stacking.
 */
export async function sendIncomingCallPush(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> & { callId?: string },
) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (!user?.fcmToken) return;
    const collapseId = typeof data.callId === 'string' && data.callId ? data.callId : undefined;
    const msg: Message = {
      token: user.fcmToken,
      data: fcmDataPayload({ ...data, title, body }),
      android: { priority: 'high' },
      apns: {
        headers: {
          'apns-priority': '10',
          ...(collapseId ? { 'apns-collapse-id': collapseId } : {}),
        },
        payload: { aps: { alert: { title, body }, sound: 'default' } },
      },
    };
    await firebaseAdmin.messaging().send(msg);
  } catch {
    // ignore FCM errors
  }
}

/**
 * Data push mirroring a call lifecycle signal (declined/ended/cancelled/missed)
 * so the peer's device settles even when its socket is dead. Android consumes it
 * in the background handler (dismisses the ringing notification); iOS shows the
 * optional alert, replacing the original ring alert via `apns-collapse-id`.
 */
export async function sendCallSignalPush(
  userId: string,
  data: Record<string, unknown> & { callId?: string },
  iosAlert?: { title: string; body: string },
) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (!user?.fcmToken) return;
    const collapseId = typeof data.callId === 'string' && data.callId ? data.callId : undefined;
    const msg: Message = {
      token: user.fcmToken,
      data: fcmDataPayload(data),
      android: { priority: 'high' },
      apns: {
        headers: {
          // Silent pushes must use priority 5 per APNs rules.
          'apns-priority': iosAlert ? '10' : '5',
          ...(collapseId ? { 'apns-collapse-id': collapseId } : {}),
        },
        payload: {
          aps: iosAlert
            ? { alert: iosAlert, sound: 'default' }
            : { contentAvailable: true },
        },
      },
    };
    await firebaseAdmin.messaging().send(msg);
  } catch {
    // ignore FCM errors
  }
}

/**
 * Create a notification in the DB and send a push via FCM if user has a token.
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  imageUrl?: string,
  options?: { highPriority?: boolean },
) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      imageUrl: imageUrl ?? '',
      data: data !== undefined ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (user?.fcmToken) {
      await sendFcmToToken(user.fcmToken, {
        title,
        body,
        data: { type, ...data },
        imageUrl,
        highPriority: options?.highPriority === true,
      });
    }
  } catch {
    // Silently ignore FCM errors — notification is already saved to DB
  }

  try {
    getIO().to(`user:${userId}`).emit('notification:new', {
      id: notification.id,
      type,
      title,
      body,
      data: data ?? null,
    });
  } catch {
    /* Socket.io not initialised */
  }

  return notification;
}

/**
 * Account / system alert (recharge approved, coins credited, etc.).
 * Sends FCM whenever the device has a token — not gated on in-app "message notifications".
 * OS notification permission is the only user-facing toggle that matters here.
 */
export async function notifyAccountAlert(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  return createNotification(userId, type, title, body, data, undefined, {
    highPriority: true,
  });
}

/**
 * Get paginated notifications for a user (unread first).
 */
export async function getNotifications(userId: string, page: number, limit: number) {
  const where = { userId };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/**
 * Mark a single notification as read.
 */
export async function markRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) throw new AppError('Notification not found', 404);
  if (notification.userId !== userId) throw new AppError('Forbidden', 403);

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { updated: result.count };
}

/**
 * Get unread notification count.
 */
export async function getUnreadCount(userId: string) {
  const count = await prisma.notification.count({ where: { userId, isRead: false } });
  return { count };
}

/**
 * Update the FCM token for a user.
 */
export async function updateFcmToken(userId: string, token: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { fcmToken: token },
  });
  return { updated: true };
}
