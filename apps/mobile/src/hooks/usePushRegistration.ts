/**
 * Registers the device FCM token with the backend after login and on token refresh.
 */
import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notificationsApi } from '../api/notifications';
import { useMock } from '../api/config';
import { isRnFirebaseMessagingLinked } from '../utils/rnfbMessaging';
import { FCM_TEAM_ANNOUNCEMENTS_TOPIC } from '../constants/haka-team';
import { logDiagnostic } from '../diagnostics/releaseDiagnostics';

// Android 13+ (API 33) gates POST_NOTIFICATIONS behind a runtime grant — the
// manifest entry alone is no longer enough. Calling Firebase getToken() or
// showing any notification without the grant silently fails on 13+ and can
// surface as native exceptions on some OEM builds.
async function ensureAndroidNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch (e) {
    logDiagnostic('lifecycle', 'post_notif_request_failed', { error: String(e) });
  }
}

type RnfbMessaging = typeof import('@react-native-firebase/messaging');

function loadMessagingMod(): RnfbMessaging | null {
  if (!isRnFirebaseMessagingLinked()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/messaging');
  } catch {
    return null;
  }
}

export async function registerDevicePushToken(): Promise<void> {
  if (useMock) return;

  const mod = loadMessagingMod();
  if (mod) {
    try {
      const {
        getMessaging,
        requestPermission,
        getToken,
        registerDeviceForRemoteMessages,
        AuthorizationStatus,
        subscribeToTopic,
      } = mod;
      const m = getMessaging();
      if (Platform.OS === 'ios') {
        await registerDeviceForRemoteMessages(m);
      }
      await ensureAndroidNotificationPermission();
      const authStatus = await requestPermission(m);
      const okIos =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;
      if (Platform.OS === 'ios' && !okIos) return;

      const token = await getToken(m);
      if (token) await notificationsApi.updateFcmToken(token);
      try {
        await subscribeToTopic(m, FCM_TEAM_ANNOUNCEMENTS_TOPIC);
      } catch {
        /* topic subscribe optional */
      }
      return;
    } catch {
      /* fall through to Expo token */
    }
  }

  try {
    await ensureAndroidNotificationPermission();
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const device = await Notifications.getDevicePushTokenAsync();
    const t = typeof device.data === 'string' ? device.data : '';
    if (t) await notificationsApi.updateFcmToken(t);
  } catch {
    /* no-op */
  }
}

export function usePushRegistration(enabled: boolean) {
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void registerDevicePushToken();

    (async () => {
      const mod = loadMessagingMod();
      if (!mod || cancelled) return;
      try {
        const { getMessaging, onTokenRefresh } = mod;
        unsubRef.current = onTokenRefresh(getMessaging(), (token: string) => {
          void notificationsApi.updateFcmToken(token).catch(() => {});
        });
      } catch {
        /* no-op */
      }
    })();

    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [enabled]);
}
