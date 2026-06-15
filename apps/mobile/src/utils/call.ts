import { Alert } from 'react-native';
import type { CallType } from '@haka-live/shared-types/events';
import { chatApi } from '../api/chat';
import { navigationRef } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/types';

export type { CallType };

async function startCall(
  userId: string,
  displayName: string,
  callType: CallType,
): Promise<void> {
  try {
    const [t, invite] = await Promise.all([
      chatApi.getCallToken(userId),
      chatApi.postCallInvite(userId, callType),
    ]);
    if (invite.status === 'busy') {
      const label = callType === 'voice' ? 'Voice call' : 'Video call';
      Alert.alert(label, `${displayName} is on another call right now.`);
      return;
    }
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('VideoCall', {
      userId,
      displayName,
      callType,
      channelId: t.channel,
      agoraToken: t.token,
      appId: t.appId,
      uid: t.uid,
    });
  } catch (e: unknown) {
    const label = callType === 'voice' ? 'Voice call' : 'Video call';
    const msg = (e as { message?: string })?.message;
    Alert.alert(label, msg || 'Could not start the call');
  }
}

export function startVideoCall(userId: string, displayName: string): Promise<void> {
  return startCall(userId, displayName, 'video');
}

export function startVoiceCall(userId: string, displayName: string): Promise<void> {
  return startCall(userId, displayName, 'voice');
}

/** Close active call screen when the remote party declines or ends the call. */
export function leaveCallIfActive(peerId?: string): void {
  if (!navigationRef.isReady()) return;
  const route = navigationRef.getCurrentRoute();
  if (route?.name !== 'VideoCall') return;
  const params = route.params as RootStackParamList['VideoCall'];
  if (peerId && params.userId !== peerId) return;
  navigationRef.goBack();
}

/** @deprecated Use leaveCallIfActive */
export const leaveVideoCallIfActive = leaveCallIfActive;
