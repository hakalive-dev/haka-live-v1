/**
 * Android background/killed handling for call pushes. Must be registered at module
 * scope of the app entry (before any UI mounts) so RNFB headless delivery works.
 *
 * - Data-only `video_call` FCM → full-screen Notifee ringing notification.
 * - `video_call_signal` (declined/ended/cancelled/missed) → dismiss the ring,
 *   surface "Missed video call" when appropriate.
 * - Notifee "Decline" action → lean REST call (no apiClient import chain in headless JS).
 *   "Answer"/press launch the activity; the app routes via the initial-notification hook.
 */
import { Platform } from 'react-native';

import { isRnFirebaseMessagingLinked } from '@/utils/rnfbMessaging';
import { TokenStorage } from '@/storage';
import {
  getNotifeeModule,
  displayIncomingCallNotification,
  displayMissedCallNotification,
  cancelIncomingCallNotification,
} from '@/services/callNotifications';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010/api/v1';

export type CallPushData = Record<string, string | undefined>;

async function declineCallViaRest(callerId: string): Promise<void> {
  try {
    const token = await TokenStorage.getAccess();
    if (!token) return;
    await fetch(`${API_BASE_URL}/chat/conversations/${callerId}/call-decline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* best-effort — the 40s backend timeout settles the call regardless */
  }
}

/**
 * Render/dismiss call notifications for an FCM data payload.
 * Returns true when the payload was call-related (so callers can stop processing).
 */
export async function handleCallPushData(data: CallPushData): Promise<boolean> {
  const type = data.type;

  if (type === 'video_call' && data.callerId) {
    await displayIncomingCallNotification({
      callId: data.callId,
      callerId: data.callerId,
      callerDisplayName: data.callerDisplayName,
    });
    return true;
  }

  if (type === 'video_call_signal') {
    await cancelIncomingCallNotification(data.callId);
    if (
      (data.signal === 'missed' || data.signal === 'cancelled') &&
      data.peerId
    ) {
      await displayMissedCallNotification({
        callerId: data.peerId,
        callerDisplayName: data.callerDisplayName,
      });
    }
    return true;
  }

  return false;
}

/** Idempotent — call once from the app entry module. No-op outside Android. */
export function registerCallPushHandlers(): void {
  if (Platform.OS !== 'android') return;

  if (isRnFirebaseMessagingLinked()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');
      const { getMessaging, setBackgroundMessageHandler } = mod;
      // RNFB allows exactly ONE background handler app-wide and this is it.
      // Only the call pushes are data-only today (everything else carries a
      // notification block the OS displays natively) — if another data-only
      // push type is ever added, route it from handleCallPushData's false branch.
      setBackgroundMessageHandler(getMessaging(), async (remoteMessage) => {
        await handleCallPushData((remoteMessage.data ?? {}) as CallPushData);
      });
    } catch {
      /* RNFB unavailable */
    }
  }

  const notifee = getNotifeeModule();
  if (notifee) {
    try {
      notifee.default.onBackgroundEvent(async ({ type, detail }) => {
        if (
          type === notifee.EventType.ACTION_PRESS &&
          detail.pressAction?.id === 'decline'
        ) {
          const callerId = detail.notification?.data?.callerId;
          if (typeof callerId === 'string' && callerId) {
            await declineCallViaRest(callerId);
          }
          if (detail.notification?.id) {
            await notifee.default.cancelNotification(detail.notification.id);
          }
        }
      });
    } catch {
      /* best-effort */
    }
  }
}
