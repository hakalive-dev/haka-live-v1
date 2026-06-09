import { AppError } from '../../middleware/error.middleware';
import { isHakaTeamUserId } from '../../constants/haka-team';
import { isWithdrawalMessageUserId } from '../../constants/withdrawal-message';

/** Block sending messages/gifts/calls *to* one-way system chat users. */
export function assertCannotReplyToHakaTeam(recipientId: string, message = 'cannot_reply_to_haka_team') {
  if (isHakaTeamUserId(recipientId)) {
    throw new AppError(message, 403);
  }
}

export function assertCannotReplyToWithdrawalMessage(
  recipientId: string,
  message = 'cannot_reply_to_withdrawal_message',
) {
  if (isWithdrawalMessageUserId(recipientId)) {
    throw new AppError(message, 403);
  }
}

/** Block replies to Haka Team and Withdrawal Message system users. */
export function assertCannotReplyToSystemDm(recipientId: string) {
  assertCannotReplyToHakaTeam(recipientId);
  assertCannotReplyToWithdrawalMessage(recipientId);
}
