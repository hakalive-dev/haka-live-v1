import type { CallType } from '@haka-live/shared-types/events';
import { navigationRef } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/types';

export type CallIncomingSocketPayload = {
  callId?: string;
  callerId: string;
  callerDisplayName: string;
  callType?: CallType;
  channelId: string;
  agoraToken: string;
  appId: string;
  uid: number;
};

function isOnCallScreen(): boolean {
  const route = navigationRef.getCurrentRoute();
  return route?.name === 'VideoCall' || route?.name === 'IncomingCall';
}

/** Open the full-screen ringing UI (no-op if a call screen is already up). */
export function presentIncomingCall(params: RootStackParamList['IncomingCall']): void {
  if (!navigationRef.isReady()) return;
  if (isOnCallScreen()) return; // server-side busy handles the real race; don't stack call UIs
  navigationRef.navigate('IncomingCall', params);
}

/** Socket path — payload already carries this callee's Agora token. */
export function promptIncomingVideoCallFromSocket(payload: CallIncomingSocketPayload): void {
  presentIncomingCall({
    callId: payload.callId,
    callerId: payload.callerId,
    callerDisplayName: payload.callerDisplayName,
    callType: payload.callType === 'voice' ? 'voice' : 'video',
    channelId: payload.channelId,
    agoraToken: payload.agoraToken,
    appId: payload.appId,
    uid: payload.uid,
  });
}

/** Push path — no token in the payload; IncomingCallScreen fetches one on answer. */
export function promptIncomingVideoCallFromPush(
  callerId: string,
  callerDisplayName: string,
  opts?: { callId?: string; autoAnswer?: boolean; callType?: CallType },
): void {
  presentIncomingCall({
    callerId,
    callerDisplayName,
    callId: opts?.callId,
    autoAnswer: opts?.autoAnswer,
    callType: opts?.callType === 'voice' ? 'voice' : 'video',
  });
}

/** Close the ringing UI when the caller cancels / the call times out. */
export function dismissIncomingCallIfActive(peerId?: string): void {
  if (!navigationRef.isReady()) return;
  const route = navigationRef.getCurrentRoute();
  if (route?.name !== 'IncomingCall') return;
  const params = route.params as RootStackParamList['IncomingCall'] | undefined;
  if (peerId && params?.callerId !== peerId) return;
  if (navigationRef.canGoBack()) navigationRef.goBack();
}
