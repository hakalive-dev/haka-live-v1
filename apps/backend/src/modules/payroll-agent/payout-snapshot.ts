import { findPayoutMethod } from '../../shared-types/withdrawal-payout-methods';
import type { PayoutSnapshot } from '../../shared-types/payout-display';
import { decrypt } from '../../utils/encryption';

export type { PayoutSnapshot };

function safeDecrypt(value: string | null | undefined): string {
  if (!value?.trim()) return '';
  try {
    return decrypt(value);
  } catch {
    return '';
  }
}

type PaymentMethodRow = {
  id: string;
  methodType: string;
  countryCode: string;
  provider: string;
  maskedAccount: string;
  accountLabel: string;
  bankAccountNo?: string | null;
  bankName?: string | null;
  ifscCode?: string | null;
  accountHolderName?: string | null;
  countryName?: string | null;
  epayAccount?: string | null;
  bep20Address?: string | null;
  trc20Address?: string | null;
};

export function buildPayoutSnapshotFromMethod(method: PaymentMethodRow): string {
  const catalog = method.countryCode && method.provider
    ? findPayoutMethod(method.countryCode, method.provider)
    : undefined;

  const snap: PayoutSnapshot = {
    paymentMethodId: method.id,
    methodType: method.methodType,
    countryCode: method.countryCode,
    provider: method.provider,
    label: catalog?.label ?? method.provider,
    maskedAccount: method.maskedAccount,
    accountLabel: method.accountLabel,
  };

  switch (method.methodType) {
    case 'bank_account': {
      snap.accountNumber = safeDecrypt(method.bankAccountNo);
      snap.bankName = safeDecrypt(method.bankName);
      snap.ifscCode = safeDecrypt(method.ifscCode);
      snap.accountHolderName = safeDecrypt(method.accountHolderName);
      snap.countryName = method.countryName ?? '';
      break;
    }
    case 'upi': {
      snap.accountNumber = safeDecrypt(method.bankAccountNo);
      snap.accountHolderName = safeDecrypt(method.accountHolderName) || method.accountLabel;
      break;
    }
    case 'mobile_wallet': {
      snap.accountNumber = safeDecrypt(method.bankAccountNo);
      snap.accountHolderName = safeDecrypt(method.accountHolderName) || method.accountLabel;
      break;
    }
    case 'epay': {
      snap.epayAccount = safeDecrypt(method.epayAccount);
      snap.accountNumber = snap.epayAccount;
      break;
    }
    case 'binance_bep20': {
      snap.bep20Address = safeDecrypt(method.bep20Address);
      snap.accountNumber = snap.bep20Address;
      break;
    }
    case 'usdt_trc20': {
      snap.trc20Address = safeDecrypt(method.trc20Address);
      snap.accountNumber = snap.trc20Address;
      break;
    }
    default:
      break;
  }

  return JSON.stringify(snap);
}

/** @deprecated use buildPayoutSnapshotFromMethod */
export function buildPayoutSnapshot(method: PaymentMethodRow): string {
  return buildPayoutSnapshotFromMethod(method);
}

export function parsePayoutSnapshot(raw: string): PayoutSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as PayoutSnapshot;
  } catch {
    return null;
  }
}

export function isPayoutSnapshotComplete(snap: PayoutSnapshot | null): boolean {
  if (!snap) return false;
  return !!(
    snap.accountNumber?.trim() ||
    snap.epayAccount?.trim() ||
    snap.bep20Address?.trim() ||
    snap.trc20Address?.trim()
  );
}

/** Rebuild and persist full payout fields when snapshot only has masked data. */
export async function ensureFullPayoutSnapshotForWithdrawal(
  withdrawalId: string,
  paymentMethodId: string | null,
  currentSnapshotRaw: string,
): Promise<string> {
  const snap = parsePayoutSnapshot(currentSnapshotRaw);
  if (isPayoutSnapshotComplete(snap)) return currentSnapshotRaw;
  if (!paymentMethodId?.trim()) return currentSnapshotRaw;

  const { prisma } = await import('../../config/prisma');
  const method = await prisma.userPaymentMethod.findUnique({ where: { id: paymentMethodId } });
  if (!method) return currentSnapshotRaw;

  const rebuilt = buildPayoutSnapshotFromMethod(method);
  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: { payoutSnapshot: rebuilt },
  });
  return rebuilt;
}
