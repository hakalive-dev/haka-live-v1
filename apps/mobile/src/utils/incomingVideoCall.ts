import type { CallType } from '@haka-live/shared-types/events';
import {
  dismissIncomingCallFromExternal,
  showIncomingCallFromExternal,
  type IncomingCallPayload,
} from '@/components/IncomingCallOverlay';

export type CallIncomingSocketPayload = IncomingCallPayload & {
  expiresAt?: string;
};

function normalizeCallType(value: unknown): CallType {
  return value === 'voice' ? 'voice' : 'video';
}

export function promptIncomingVideoCallFromSocket(payload: CallIncomingSocketPayload) {
  showIncomingCallFromExternal({
    callerId: payload.callerId,
    callerDisplayName: payload.callerDisplayName,
    callType: normalizeCallType(payload.callType),
    channelId: payload.channelId,
    agoraToken: payload.agoraToken,
    appId: payload.appId,
    uid: payload.uid,
  });
}

export function promptIncomingVideoCallFromPush(
  callerId: string,
  callerDisplayName: string,
  callType: CallType = 'video',
) {
  showIncomingCallFromExternal({
    callerId,
    callerDisplayName,
    callType,
  });
}

export function dismissIncomingCall(callerId?: string) {
  dismissIncomingCallFromExternal(callerId);
}
