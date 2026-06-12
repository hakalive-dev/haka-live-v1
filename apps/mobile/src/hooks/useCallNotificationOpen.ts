/**
 * Routes Notifee call-notification interactions into the in-app call UI:
 * - cold start / full-screen-intent launch → ringing screen (getInitialNotification)
 * - taps and Answer/Decline action presses while the app is alive (onForegroundEvent)
 */
import { useEffect } from 'react';

import { chatApi } from '@api/chat';
import { getNotifeeModule } from '@/services/callNotifications';
import { promptIncomingVideoCallFromPush } from '@/utils/incomingVideoCall';
import { navigateFromPushData } from '@/utils/pushNavigation';

type NotificationData = Record<string, unknown> | undefined;

function openFromCallNotification(data: NotificationData, actionId?: string) {
  if (!data || data.type !== 'video_call') {
    // e.g. missed-call notification → DM thread
    navigateFromPushData(data as Record<string, string | undefined> | undefined);
    return;
  }
  const callerId = typeof data.callerId === 'string' ? data.callerId : '';
  if (!callerId) return;

  if (actionId === 'decline') {
    void chatApi.postCallDecline(callerId).catch(() => {});
    return;
  }
  promptIncomingVideoCallFromPush(
    callerId,
    typeof data.callerDisplayName === 'string' ? data.callerDisplayName : 'Someone',
    {
      callId: typeof data.callId === 'string' && data.callId ? data.callId : undefined,
      autoAnswer: actionId === 'answer',
    },
  );
}

export function useCallNotificationOpen(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const mod = getNotifeeModule();
    if (!mod) return;

    void mod.default
      .getInitialNotification()
      .then((initial) => {
        if (!initial) return;
        openFromCallNotification(
          initial.notification.data,
          initial.pressAction?.id,
        );
      })
      .catch(() => {});

    const unsub = mod.default.onForegroundEvent(({ type, detail }) => {
      if (type !== mod.EventType.PRESS && type !== mod.EventType.ACTION_PRESS) return;
      const actionId =
        type === mod.EventType.ACTION_PRESS ? detail.pressAction?.id : undefined;
      openFromCallNotification(detail.notification?.data, actionId);
      // Any interaction settles the ring — don't leave it in the shade while
      // the in-app screen mounts.
      if (detail.notification?.id) {
        void mod.default.cancelNotification(detail.notification.id).catch(() => {});
      }
    });

    return unsub;
  }, [enabled]);
}
