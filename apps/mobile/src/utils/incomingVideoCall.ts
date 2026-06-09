import { Alert } from 'react-native';
import { chatApi } from '../api/chat';
import { navigationRef } from '../navigation/navigationRef';

export type CallIncomingSocketPayload = {
  callerId: string;
  callerDisplayName: string;
  channelId: string;
  agoraToken: string;
  appId: string;
  uid: number;
};

function openVideoCallScreen(params: {
  userId: string;
  displayName: string;
  channelId: string;
  agoraToken: string;
  appId: string;
  uid: number;
}) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('VideoCall', params);
}

export function promptIncomingVideoCallFromSocket(payload: CallIncomingSocketPayload) {
  Alert.alert('Incoming video call', `${payload.callerDisplayName} is calling`, [
    {
      text: 'Decline',
      style: 'cancel',
      onPress: () => {
        void chatApi.postCallDecline(payload.callerId).catch(() => {});
      },
    },
    {
      text: 'Answer',
      onPress: () =>
        openVideoCallScreen({
          userId: payload.callerId,
          displayName: payload.callerDisplayName,
          channelId: payload.channelId,
          agoraToken: payload.agoraToken,
          appId: payload.appId,
          uid: payload.uid,
        }),
    },
  ]);
}

export function promptIncomingVideoCallFromPush(callerId: string, callerDisplayName: string) {
  Alert.alert('Incoming video call', `${callerDisplayName} is calling`, [
    {
      text: 'Decline',
      style: 'cancel',
      onPress: () => {
        void chatApi.postCallDecline(callerId).catch(() => {});
      },
    },
    {
      text: 'Answer',
      onPress: () => {
        void (async () => {
          try {
            const t = await chatApi.getCallToken(callerId);
            openVideoCallScreen({
              userId: callerId,
              displayName: callerDisplayName,
              channelId: t.channel,
              agoraToken: t.token,
              appId: t.appId,
              uid: t.uid,
            });
          } catch {
            /* ignore */
          }
        })();
      },
    },
  ]);
}
