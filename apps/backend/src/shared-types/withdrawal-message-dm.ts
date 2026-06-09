/** Display name for the one-way Withdrawal Message system chat user. */
export const WITHDRAWAL_MESSAGE_DISPLAY_NAME = 'Withdrawal Message';

export type WithdrawalDmPhase = 'pending_confirm' | 'success';

export type WithdrawalDmFooterAction = 'to_confirm' | 'check_details';

/** JSON stored in DirectMessage.content for messageType withdrawal_update. */
export interface WithdrawalUpdateDmPayload {
  kind: 'withdrawal_update';
  phase: WithdrawalDmPhase;
  withdrawalId: string;
  orderId: string;
  title: string;
  statusLabel: string;
  description: string;
  paymentAmount: string;
  currency: string;
  paymentMethodProvider: string;
  paymentMethodType: string;
  remitTime?: string;
  successTime?: string;
  footerAction: WithdrawalDmFooterAction;
}

export function isWithdrawalUpdateDmPayload(
  value: unknown,
): value is WithdrawalUpdateDmPayload {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return o.kind === 'withdrawal_update' && typeof o.withdrawalId === 'string';
}
