/**
 * Handles notification taps and cold-start opens (FCM / Expo) when the app was backgrounded or killed.
 */
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { navigateFromPushData } from '@/utils/pushNavigation';
import { isRnFirebaseMessagingLinked } from '@/utils/rnfbMessaging';

function dataFromFcm(
  remoteMessage: { data?: Record<string, unknown> } | null | undefined,
): Record<string, string | undefined> | undefined {
  // RNFB types FCM `data` values as `string | object`; in practice our payloads
  // are string-keyed strings, so narrow here for the navigation helper.
  return remoteMessage?.data as Record<string, string | undefined> | undefined;
}

export function usePushNotificationOpen(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const subs: Array<() => void> = [];

    if (isRnFirebaseMessagingLinked()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');
        const { getMessaging, onNotificationOpenedApp, getInitialNotification } = mod;
        const m = getMessaging();

        subs.push(
          onNotificationOpenedApp(m, (msg) => {
            navigateFromPushData(dataFromFcm(msg));
          }),
        );

        void getInitialNotification(m)
          .then((msg) => {
            navigateFromPushData(dataFromFcm(msg));
          })
          .catch(() => {});
      } catch {
        /* RNFB unavailable */
      }
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, string | undefined>
          | undefined;
        navigateFromPushData(data);
      },
    );
    subs.push(() => responseSub.remove());

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as
          | Record<string, string | undefined>
          | undefined;
        navigateFromPushData(data);
      })
      .catch(() => {});

    return () => {
      subs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
    };
  }, [enabled]);
}
