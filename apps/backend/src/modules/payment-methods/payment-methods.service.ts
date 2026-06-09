import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { findPayoutMethod } from '../../shared-types/withdrawal-payout-methods';
import { assertPayoutMethod } from '../payments/withdrawal-payout.service';
import {
  encrypt,
  maskBankAccount,
  maskEpay,
  maskWalletAddress,
} from '../../utils/encryption';

const MAX_METHODS = 10;

interface BindBase {
  countryCode: string;
  provider: string;
  nickname: string;
  accountLabel?: string;
}

export interface BindEpayInput extends BindBase {
  methodType: 'epay';
  epayAccount: string;
}

export interface BindBinanceBep20Input extends BindBase {
  methodType: 'binance_bep20';
  bep20Address: string;
}

export interface BindUsdtTrc20Input extends BindBase {
  methodType: 'usdt_trc20';
  trc20Address: string;
}

export interface BindBankAccountInput extends BindBase {
  methodType: 'bank_account';
  bankAccountNo: string;
  bankName: string;
  accountHolderName: string;
  ifscCode?: string;
  countryName?: string;
}

export interface BindMobileWalletInput extends BindBase {
  methodType: 'mobile_wallet';
  accountNo: string;
  accountHolderName?: string;
}

export interface BindUpiInput extends BindBase {
  methodType: 'upi';
  vpa: string;
  accountHolderName?: string;
}

export type BindInput =
  | BindEpayInput
  | BindBinanceBep20Input
  | BindUsdtTrc20Input
  | BindBankAccountInput
  | BindMobileWalletInput
  | BindUpiInput;

function maskMobileAccount(accountNo: string): string {
  if (accountNo.length <= 4) return '****';
  return `****${accountNo.slice(-4)}`;
}

function serializeMethod(m: {
  id: string;
  methodType: string;
  countryCode: string;
  provider: string;
  isDefault: boolean;
  nickname: string;
  maskedAccount: string;
  accountLabel: string;
  isVerified: boolean;
  createdAt: Date;
}) {
  const catalog = m.countryCode && m.provider
    ? findPayoutMethod(m.countryCode, m.provider)
    : undefined;

  return {
    id: m.id,
    method_type: m.methodType,
    country_code: m.countryCode,
    provider: m.provider,
    label: catalog?.label ?? m.provider,
    is_default: m.isDefault,
    nickname: m.nickname,
    masked_account: m.maskedAccount,
    account_label: m.accountLabel,
    isVerified: m.isVerified,
    created_at: m.createdAt.toISOString(),
  };
}

/**
 * List all payment methods for a user (sensitive fields excluded).
 */
export async function listMethods(userId: string) {
  const methods = await prisma.userPaymentMethod.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return methods.map(serializeMethod);
}

/**
 * Bind a new payment method for withdrawal payout.
 */
export async function bindMethod(userId: string, input: BindInput) {
  const catalog = assertPayoutMethod(input.countryCode, input.provider);
  if (catalog.methodType !== input.methodType) {
    throw new AppError('Method type does not match payout provider', 400);
  }

  const countryCode = input.countryCode.toUpperCase();

  const duplicate = await prisma.userPaymentMethod.findFirst({
    where: { userId, countryCode, provider: input.provider },
  });
  if (duplicate) {
    throw new AppError('This payout method is already bound for this country', 400);
  }

  const count = await prisma.userPaymentMethod.count({ where: { userId } });
  if (count >= MAX_METHODS) {
    throw new AppError(`Maximum ${MAX_METHODS} payment methods allowed`, 400);
  }

  const isDefault = count === 0;
  const accountLabel = input.accountLabel?.trim() ?? '';
  const base = {
    userId,
    countryCode,
    provider: input.provider,
    accountLabel,
    isDefault,
    nickname: input.nickname,
    methodType: input.methodType,
  };

  let data: Record<string, unknown>;
  let maskedAccount: string;

  switch (input.methodType) {
    case 'epay': {
      maskedAccount = maskEpay(input.epayAccount);
      data = {
        ...base,
        epayAccount: encrypt(input.epayAccount),
        maskedAccount,
      };
      break;
    }
    case 'binance_bep20': {
      maskedAccount = maskWalletAddress(input.bep20Address);
      data = {
        ...base,
        bep20Address: encrypt(input.bep20Address),
        maskedAccount,
      };
      break;
    }
    case 'usdt_trc20': {
      maskedAccount = maskWalletAddress(input.trc20Address);
      data = {
        ...base,
        trc20Address: encrypt(input.trc20Address),
        maskedAccount,
      };
      break;
    }
    case 'bank_account': {
      maskedAccount = maskBankAccount(input.bankAccountNo);
      const bankName =
        input.bankName?.trim() ||
        (catalog.provider === 'sepa_iban' ? 'SEPA' : '');
      if (!bankName) {
        throw new AppError('Bank name is required', 400);
      }
      data = {
        ...base,
        bankAccountNo: encrypt(input.bankAccountNo),
        bankName: encrypt(bankName),
        accountHolderName: encrypt(input.accountHolderName),
        ifscCode: input.ifscCode ? encrypt(input.ifscCode) : null,
        countryName: input.countryName ?? null,
        maskedAccount,
      };
      break;
    }
    case 'mobile_wallet': {
      maskedAccount = maskMobileAccount(input.accountNo);
      data = {
        ...base,
        bankAccountNo: encrypt(input.accountNo),
        accountHolderName: input.accountHolderName
          ? encrypt(input.accountHolderName)
          : null,
        maskedAccount,
      };
      break;
    }
    case 'upi': {
      maskedAccount = maskMobileAccount(input.vpa);
      data = {
        ...base,
        bankAccountNo: encrypt(input.vpa),
        accountHolderName: input.accountHolderName
          ? encrypt(input.accountHolderName)
          : null,
        maskedAccount,
      };
      break;
    }
    default:
      throw new AppError('Unsupported method type', 400);
  }

  const method = await prisma.userPaymentMethod.create({ data: data as any });
  return serializeMethod(method);
}

export async function setDefault(userId: string, methodId: string) {
  return prisma.$transaction(async (tx) => {
    const method = await tx.userPaymentMethod.findFirst({
      where: { id: methodId, userId },
    });
    if (!method) throw new AppError('Payment method not found', 404);

    await tx.userPaymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    await tx.userPaymentMethod.update({
      where: { id: methodId },
      data: { isDefault: true },
    });

    return { success: true };
  });
}

export async function deleteMethod(userId: string, methodId: string) {
  return prisma.$transaction(async (tx) => {
    const method = await tx.userPaymentMethod.findFirst({
      where: { id: methodId, userId },
    });
    if (!method) throw new AppError('Payment method not found', 404);

    await tx.userPaymentMethod.delete({ where: { id: methodId } });

    if (method.isDefault) {
      const oldest = await tx.userPaymentMethod.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) {
        await tx.userPaymentMethod.update({
          where: { id: oldest.id },
          data: { isDefault: true },
        });
      }
    }

    return { success: true };
  });
}

export async function hasPaymentMethod(userId: string): Promise<boolean> {
  const count = await prisma.userPaymentMethod.count({ where: { userId } });
  return count > 0;
}

export async function hasPaymentMethodForCountry(
  userId: string,
  countryCode: string,
): Promise<boolean> {
  const count = await prisma.userPaymentMethod.count({
    where: { userId, countryCode: countryCode.toUpperCase() },
  });
  return count > 0;
}
