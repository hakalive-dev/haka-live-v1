import type { ImageSourcePropType } from 'react-native';

/**
 * Must match backend seed (`system_uid_withdrawal_message`) / env WITHDRAWAL_MESSAGE_USER_ID.
 */
export const WITHDRAWAL_MESSAGE_USER_ID =
  process.env.EXPO_PUBLIC_WITHDRAWAL_MESSAGE_USER_ID ?? 'f2222222-2222-4222-8222-222222222222';

export const WITHDRAWAL_MESSAGE_DISPLAY_NAME = 'Withdrawal Message';

export const WITHDRAWAL_MESSAGE_AVATAR: ImageSourcePropType = require('../../assets/withdrawal_message_avatar.png');

export function isWithdrawalMessageUserId(id: string | undefined | null): boolean {
  return !!id && id === WITHDRAWAL_MESSAGE_USER_ID;
}
