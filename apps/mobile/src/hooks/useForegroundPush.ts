/**
 * Shows DM push banners while the app is in the foreground (RN Firebase).
 */
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';

import { navigationRef } from '@/navigation/navigationRef';
import { isRnFirebaseMessagingLinked } from '@/utils/rnfbMessaging';
import { showSeatInviteFromExternal } from '@/components/SeatInvitePrompt';
import { seatInvitationFromPushData } from '@/utils/seatInvitePayload';
import { invalidateChatUnreadQueries } from './useDMConnection';

function isViewingDmConversation(senderId: string | undefined): boolean {
  if (!senderId || !navigationRef.isReady()) return false;
  const route = navigationRef.getCurrentRoute();
  if (route?.name !== 'DMConversation') return false;
  const params = route.params as { userId?: string } | undefined;
  return params?.userId === senderId;
}

export function useForegroundPush(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !isRnFirebaseMessagingLinked()) return;

    let unsub: (() => void) | undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');
      const { getMessaging, onMessage } = mod;
      const m = getMessaging();

      unsub = onMessage(m, async (remoteMessage) => {
        const data = remoteMessage.data ?? {};
        const type = data.type;

        if (type === 'room_seat_invite') {
          const invite = seatInvitationFromPushData(data as Record<string, string | undefined>);
          if (invite) showSeatInviteFromExternal(invite);
          return;
        }

        if (type !== 'dm' && data.open !== 'haka_team_dm') return;

        const senderId = data.senderId as string | undefined;
        if (isViewingDmConversation(senderId)) return;

        const title = remoteMessage.notification?.title ?? 'New message';
        const body = remoteMessage.notification?.body ?? '';

        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              data: data as Record<string, string>,
              sound: true,
            },
            trigger: null,
          });
        } catch {
          /* ignore present errors */
        }

        invalidateChatUnreadQueries(queryClient);
      });
    } catch {
      /* RNFB unavailable */
    }

    return () => {
      try {
        unsub?.();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, queryClient]);
}
