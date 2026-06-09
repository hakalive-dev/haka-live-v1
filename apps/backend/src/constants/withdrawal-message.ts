import { env } from '../config/env';

/** Default UUID for seeded Withdrawal Message user (`supabaseUid`: system_uid_withdrawal_message). */
export const DEFAULT_WITHDRAWAL_MESSAGE_USER_ID = 'f2222222-2222-4222-8222-222222222222';

export const WITHDRAWAL_MESSAGE_DISPLAY_NAME = 'Withdrawal Message';

export function getWithdrawalMessageUserId(): string {
  return env.WITHDRAWAL_MESSAGE_USER_ID ?? DEFAULT_WITHDRAWAL_MESSAGE_USER_ID;
}

export function isWithdrawalMessageUserId(userId: string | undefined | null): boolean {
  if (!userId) return false;
  return userId === getWithdrawalMessageUserId();
}
