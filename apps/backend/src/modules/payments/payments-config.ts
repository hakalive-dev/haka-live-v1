import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

const DIRECT_TOPUP_KEY = 'payments.direct_user_topup_enabled';

export const DIRECT_TOPUP_DISABLED_MESSAGE =
  'Direct top-up is temporarily unavailable. Please recharge via a coin seller.';

/** Allowed seller→company recharge methods (manual proof + admin approval). */
export const SELLER_RECHARGE_PAYMENT_METHODS = [
  'epay',
  'usdt_trc20',
  'usdt_bep20',
] as const;

export type SellerRechargePaymentMethod =
  (typeof SELLER_RECHARGE_PAYMENT_METHODS)[number];

export function isSellerRechargePaymentMethod(
  value: string,
): value is SellerRechargePaymentMethod {
  return (SELLER_RECHARGE_PAYMENT_METHODS as readonly string[]).includes(value);
}

export async function isDirectUserTopupEnabled(): Promise<boolean> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: DIRECT_TOPUP_KEY },
  });
  if (!row) return false;
  const v = row.value;
  return v === true || v === 'true';
}

export async function getPaymentsPublicConfig() {
  return {
    direct_user_topup_enabled: await isDirectUserTopupEnabled(),
  };
}

export async function assertDirectUserTopupEnabled(): Promise<void> {
  if (!(await isDirectUserTopupEnabled())) {
    throw new AppError(DIRECT_TOPUP_DISABLED_MESSAGE, 503);
  }
}
