import type { WithdrawalRequest } from '@prisma/client';
import {
  WITHDRAWAL_MESSAGE_DISPLAY_NAME,
  type WithdrawalUpdateDmPayload,
} from '../../shared-types/withdrawal-message-dm';
import { getWithdrawalMessageUserId } from '../../constants/withdrawal-message';
import { prisma } from '../../config/prisma';
import { notifyAccountAlert } from '../notifications/notifications.service';
import { parsePayoutSnapshot } from '../payroll-agent/payout-snapshot';
import { insertServerDirectMessage } from './chat.service';

const DM_TYPE = 'withdrawal_update';
const AUTO_CONFIRM_MS = 2 * 60 * 60 * 1000;

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  GBP: '£',
  USD: '$',
  EUR: '€',
  PHP: '₱',
  PKR: '₨',
  BDT: '৳',
  NGN: '₦',
  KES: 'KSh',
  GHS: '₵',
};

function currencySymbol(code: string): string {
  const c = code.trim().toUpperCase();
  return CURRENCY_SYMBOLS[c] ?? c;
}

function formatPaymentAmount(localAmount: number | null, currency: string): string {
  if (localAmount == null || Number.isNaN(localAmount)) return '—';
  const sym = currencySymbol(currency);
  const formatted = localAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${formatted}`;
}

function formatDmTimestamp(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadWithdrawalContext(withdrawalId: string) {
  const row = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: {
      assignedAgent: { select: { displayName: true } },
    },
  });
  if (!row) return null;
  const snap = parsePayoutSnapshot(row.payoutSnapshot);
  const agentName = row.assignedAgent?.displayName?.trim() || 'Coinseller';
  return { row, snap, agentName };
}

function buildPayload(opts: {
  phase: WithdrawalUpdateDmPayload['phase'];
  row: WithdrawalRequest;
  snap: ReturnType<typeof parsePayoutSnapshot>;
  agentName: string;
}): WithdrawalUpdateDmPayload {
  const { phase, row, snap, agentName } = opts;
  const localAmount = row.localAmount != null ? Number(row.localAmount) : null;
  const paymentAmount = formatPaymentAmount(localAmount, row.currency);
  const remitAt = row.proofUploadedAt ?? row.updatedAt;

  if (phase === 'pending_confirm') {
    return {
      kind: 'withdrawal_update',
      phase,
      withdrawalId: row.id,
      orderId: row.orderId,
      title: `Withdrawal by ${agentName}`,
      statusLabel: 'To be confirmed',
      description:
        'Withdrawal is successful. Please check if you have received. The withdrawal status will be automatically confirmed after 2 hours.',
      paymentAmount,
      currency: row.currency,
      paymentMethodProvider: snap?.provider ?? '',
      paymentMethodType: snap?.methodType ?? '',
      remitTime: remitAt.toISOString(),
      footerAction: 'to_confirm',
    };
  }

  const successAt = row.verifiedAt ?? row.processedAt ?? row.updatedAt;
  return {
    kind: 'withdrawal_update',
    phase: 'success',
    withdrawalId: row.id,
    orderId: row.orderId,
    title: `Withdrawal by ${agentName}`,
    statusLabel: 'Success',
    description: 'The withdrawal status is finished by system automatically.',
    paymentAmount,
    currency: row.currency,
    paymentMethodProvider: snap?.provider ?? '',
    paymentMethodType: snap?.methodType ?? '',
    successTime: successAt.toISOString(),
    footerAction: 'check_details',
  };
}

async function sendWithdrawalDm(
  userId: string,
  payload: WithdrawalUpdateDmPayload,
  pushTitle: string,
): Promise<void> {
  const senderId = getWithdrawalMessageUserId();
  const content = JSON.stringify(payload);
  const pushPreview = payload.statusLabel;

  await insertServerDirectMessage({
    senderId,
    recipientId: userId,
    content,
    messageType: DM_TYPE,
  });

  await notifyAccountAlert(userId, DM_TYPE, pushTitle, pushPreview, {
    senderId,
    messageType: DM_TYPE,
    open: 'withdrawal_message_dm',
    withdrawalId: payload.withdrawalId,
    phase: payload.phase,
  });
}

/** After payroll agent uploads proof — prompt user to confirm receipt. */
export async function notifyWithdrawalPendingConfirm(withdrawalId: string): Promise<void> {
  const ctx = await loadWithdrawalContext(withdrawalId);
  if (!ctx) return;
  const { row, snap, agentName } = ctx;

  const proofUploadedAt = row.proofUploadedAt ?? new Date();
  const userConfirmAutoAt = new Date(proofUploadedAt.getTime() + AUTO_CONFIRM_MS);

  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      userConfirmAutoAt,
      ...(row.proofUploadedAt ? {} : { proofUploadedAt }),
    },
  });

  const payload = buildPayload({
    phase: 'pending_confirm',
    row: { ...row, proofUploadedAt },
    snap,
    agentName,
  });

  await sendWithdrawalDm(
    row.userId,
    payload,
    WITHDRAWAL_MESSAGE_DISPLAY_NAME,
  );
}

/** After admin verifies payout — success card in Withdrawal Message thread. */
export async function notifyWithdrawalSuccess(withdrawalId: string): Promise<void> {
  const ctx = await loadWithdrawalContext(withdrawalId);
  if (!ctx) return;
  const { row, snap, agentName } = ctx;

  const payload = buildPayload({
    phase: 'success',
    row,
    snap,
    agentName,
  });

  await sendWithdrawalDm(
    row.userId,
    payload,
    'Withdrawal successful',
  );
}

/** Fire-and-forget wrapper. */
export function scheduleWithdrawalPendingConfirm(withdrawalId: string): void {
  void notifyWithdrawalPendingConfirm(withdrawalId).catch((err) => {
    console.error('[withdrawal-message] pending confirm notify failed:', err);
  });
}

export function scheduleWithdrawalSuccess(withdrawalId: string): void {
  void notifyWithdrawalSuccess(withdrawalId).catch((err) => {
    console.error('[withdrawal-message] success notify failed:', err);
  });
}
