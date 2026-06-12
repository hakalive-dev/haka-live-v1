/**
 * Android incoming-call notifications (Notifee): full-screen intent ringing UI when the
 * app is backgrounded/killed, fed by the backend's data-only `video_call` FCM pushes.
 *
 * Notifee is a native dependency — every entry point is guarded so Expo Go and dev
 * clients built before the package was added just no-op. iOS is Phase 3 (CallKit);
 * these helpers no-op there too (iOS gets a regular APNs alert from the backend).
 */
import { Platform } from 'react-native';

export const INCOMING_CALL_CHANNEL_ID = 'incoming_call';
/** Keep above the backend's 40s ring timeout so the dismissal signal usually wins. */
const RING_NOTIFICATION_TIMEOUT_MS = 45_000;

type NotifeeModule = typeof import('@notifee/react-native');

let cached: NotifeeModule | null | undefined;

export function getNotifeeModule(): NotifeeModule | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@notifee/react-native') as NotifeeModule;
  } catch {
    cached = null;
  }
  return cached;
}

export async function ensureIncomingCallChannel(): Promise<void> {
  const mod = getNotifeeModule();
  if (!mod) return;
  try {
    await mod.default.createChannel({
      id: INCOMING_CALL_CHANNEL_ID,
      name: 'Incoming calls',
      importance: mod.AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      vibrationPattern: [300, 600],
    });
  } catch {
    /* best-effort */
  }
}

function ringNotificationId(callId?: string, callerId?: string): string {
  return `call_${callId || callerId || 'unknown'}`;
}

export async function displayIncomingCallNotification(data: {
  callId?: string;
  callerId: string;
  callerDisplayName?: string;
}): Promise<void> {
  const mod = getNotifeeModule();
  if (!mod) return;
  try {
    await ensureIncomingCallChannel();
    const name = data.callerDisplayName?.trim() || 'Someone';
    await mod.default.displayNotification({
      id: ringNotificationId(data.callId, data.callerId),
      title: 'Incoming video call',
      body: `${name} is calling`,
      data: {
        type: 'video_call',
        callId: data.callId ?? '',
        callerId: data.callerId,
        callerDisplayName: name,
      },
      android: {
        channelId: INCOMING_CALL_CHANNEL_ID,
        category: mod.AndroidCategory.CALL,
        importance: mod.AndroidImportance.HIGH,
        ongoing: true,
        autoCancel: false,
        loopSound: true,
        timeoutAfter: RING_NOTIFICATION_TIMEOUT_MS,
        // Lights up over the lock screen like a native call.
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          { title: 'Decline', pressAction: { id: 'decline' } },
          { title: 'Answer', pressAction: { id: 'answer', launchActivity: 'default' } },
        ],
      },
    });
  } catch {
    /* best-effort */
  }
}

/** Dismiss the ringing notification (call settled). Falls back to scanning when callId is unknown. */
export async function cancelIncomingCallNotification(callId?: string): Promise<void> {
  const mod = getNotifeeModule();
  if (!mod) return;
  try {
    if (callId) {
      await mod.default.cancelNotification(ringNotificationId(callId));
      return;
    }
    // No callId (legacy signal paths) — sweep any leftover ring notification.
    const displayed = await mod.default.getDisplayedNotifications();
    await Promise.all(
      displayed
        .filter((n) => n.notification.data?.type === 'video_call')
        .map((n) => (n.id ? mod.default.cancelNotification(n.id) : Promise.resolve())),
    );
  } catch {
    /* best-effort */
  }
}

export async function displayMissedCallNotification(data: {
  callerId: string;
  callerDisplayName?: string;
}): Promise<void> {
  const mod = getNotifeeModule();
  if (!mod) return;
  try {
    const name = data.callerDisplayName?.trim() || 'Someone';
    await mod.default.displayNotification({
      title: 'Missed video call',
      body: `${name} tried to call you`,
      data: {
        type: 'video_call_missed',
        senderId: data.callerId,
        senderName: name,
      },
      android: {
        // `default` channel is created by applyNotificationPrefs (expo-notifications).
        channelId: 'default',
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch {
    /* best-effort */
  }
}
