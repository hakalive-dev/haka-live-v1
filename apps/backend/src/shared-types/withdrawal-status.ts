/** Canonical withdrawal workflow statuses (DB values). */
export const WITHDRAWAL_STATUS = {
  PENDING_REVIEW: 'pending_review',
  ASSIGNED: 'assigned',
  PROOF_SUBMITTED: 'proof_submitted',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  PENDING: 'pending',
  APPROVED: 'approved',
  DISPUTED: 'disputed',
} as const;

export type WithdrawalStatus =
  (typeof WITHDRAWAL_STATUS)[keyof typeof WITHDRAWAL_STATUS];

export const WITHDRAWAL_USER_DISPLAY: Record<string, string> = {
  pending_review: 'Under review',
  pending: 'Under review',
  assigned: 'Processing',
  proof_submitted: 'Processing',
  completed: 'Paid',
  approved: 'Paid',
  rejected: 'Rejected',
  disputed: 'Disputed',
};

export const WITHDRAWAL_AGENT_DISPLAY: Record<string, string> = {
  pending_review: 'Waiting for assignment',
  assigned: 'Pending payment',
  proof_submitted: 'Submitted for review',
  completed: 'Completed',
  rejected: 'Rejected',
  disputed: 'Disputed',
};

export function normalizeWithdrawalStatus(status: string): string {
  return status === WITHDRAWAL_STATUS.PENDING ? WITHDRAWAL_STATUS.PENDING_REVIEW : status;
}

export function isActiveWithdrawalStatus(status: string): boolean {
  const s = normalizeWithdrawalStatus(status);
  return (
    s === WITHDRAWAL_STATUS.PENDING_REVIEW ||
    s === WITHDRAWAL_STATUS.ASSIGNED ||
    s === WITHDRAWAL_STATUS.PROOF_SUBMITTED ||
    s === WITHDRAWAL_STATUS.DISPUTED
  );
}

export function isTerminalWithdrawalStatus(status: string): boolean {
  const s = normalizeWithdrawalStatus(status);
  return (
    s === WITHDRAWAL_STATUS.COMPLETED ||
    s === WITHDRAWAL_STATUS.REJECTED ||
    s === WITHDRAWAL_STATUS.APPROVED
  );
}
