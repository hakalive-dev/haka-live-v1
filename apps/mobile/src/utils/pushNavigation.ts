import { navigationRef } from '@/navigation/navigationRef';
import { HAKA_TEAM_USER_ID } from '@/constants/haka-team';
import {
  WITHDRAWAL_MESSAGE_DISPLAY_NAME,
  WITHDRAWAL_MESSAGE_USER_ID,
} from '@/constants/withdrawal-message';
import { promptIncomingVideoCallFromPush } from '@/utils/incomingVideoCall';
import { showSeatInviteFromExternal } from '@/components/SeatInvitePrompt';
import { seatInvitationFromPushData } from '@/utils/seatInvitePayload';

export type PushNavigationData = Record<string, string | undefined>;

/** Open the right screen when the user taps a push notification or opens the app from one. */
export function navigateFromPushData(data: PushNavigationData | undefined | null): boolean {
  if (!data?.type || !navigationRef.isReady()) return false;

  const type = data.type;

  if (type === 'withdrawal_update' || data.open === 'withdrawal_message_dm') {
    navigationRef.navigate('DMConversation', {
      userId: data.senderId ?? WITHDRAWAL_MESSAGE_USER_ID,
      displayName: WITHDRAWAL_MESSAGE_DISPLAY_NAME,
    });
    return true;
  }

  if (
    type === 'seller_recharge_approved' ||
    type === 'coin_transfer' ||
    type === 'support_reply' ||
    type === 'dm' ||
    data.open === 'haka_team_dm'
  ) {
    const userId = data.senderId ?? HAKA_TEAM_USER_ID;
    navigationRef.navigate('DMConversation', {
      userId,
      displayName: 'Haka Team',
    });
    return true;
  }

  if ((type === 'video_call' || type === 'voice_call') && data.callerId) {
    const callType = data.callType === 'voice' || type === 'voice_call' ? 'voice' : 'video';
    promptIncomingVideoCallFromPush(data.callerId, data.callerDisplayName ?? 'Someone', {
      callId: data.callId,
      callType,
    });
    return true;
  }

  if (type === 'video_call_missed' && data.senderId) {
    navigationRef.navigate('DMConversation', {
      userId: data.senderId,
      displayName: data.senderName ?? 'Video call',
    });
    return true;
  }

  if (type === 'room_seat_invite') {
    const invite = seatInvitationFromPushData(data);
    if (invite) {
      showSeatInviteFromExternal(invite);
      return true;
    }
  }

  if (
    type === 'withdrawal_assigned' ||
    type === 'payroll_agent_promoted' ||
    data.open === 'payroll'
  ) {
    navigationRef.navigate('Payroll');
    return true;
  }

  if (type === 'invite_accepted') {
    navigationRef.navigate('InviteCreator');
    return true;
  }

  if (
    type === 'moment_like' ||
    type === 'moment_comment' ||
    type === 'moment_share' ||
    type === 'moment_gift' ||
    data.open === 'actor_profile'
  ) {
    if (data.actorId) {
      navigationRef.navigate('PublicProfile', { userId: data.actorId });
      return true;
    }
  }

  return false;
}
