import { Alert } from 'react-native';
import { chatApi } from '../api/chat';
import { navigationRef } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/types';

export async function startVideoCall(userId: string, displayName: string): Promise<void> {
  try {
    const [t] = await Promise.all([
      chatApi.getCallToken(userId),
      chatApi.postCallInvite(userId),
    ]);
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('VideoCall', {
      userId,
      displayName,
      channelId: t.channel,
      agoraToken: t.token,
      appId: t.appId,
      uid: t.uid,
    });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message;
    Alert.alert('Video call', msg || 'Could not start the call');
  }
}

/** Close VideoCall screen when the remote party declines or ends the call. */
export function leaveVideoCallIfActive(peerId?: string): void {
  if (!navigationRef.isReady()) return;
  const route = navigationRef.getCurrentRoute();
  if (route?.name !== 'VideoCall') return;
  const params = route.params as RootStackParamList['VideoCall'];
  if (peerId && params.userId !== peerId) return;
  navigationRef.goBack();
}
