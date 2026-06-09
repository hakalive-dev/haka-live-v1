import {
  findPayoutMethod,
  getPayoutMethodsForCountry,
  isWithdrawalCountry,
  WITHDRAWAL_COUNTRY_CODES,
  type WithdrawalPayoutMethod,
} from '../../shared-types/withdrawal-payout-methods';
import { AppError } from '../../middleware/error.middleware';
import { prisma } from '../../config/prisma';

export function assertWithdrawalCountry(countryCode: string) {
  const code = countryCode.toUpperCase();
  if (!isWithdrawalCountry(code)) {
    throw new AppError('Withdrawal country is not supported', 400);
  }
  return code;
}

export function getCatalogForCountry(countryCode: string): WithdrawalPayoutMethod[] {
  const code = assertWithdrawalCountry(countryCode);
  const methods = getPayoutMethodsForCountry(code);
  if (methods.length === 0) {
    throw new AppError('No payout methods configured for this country', 400);
  }
  return methods;
}

export function assertPayoutMethod(countryCode: string, provider: string) {
  const code = assertWithdrawalCountry(countryCode);
  const entry = findPayoutMethod(code, provider);
  if (!entry) {
    throw new AppError('Payout method is not available for this country', 400);
  }
  return entry;
}

export async function listWithdrawalMethodsForUser(
  userId: string,
  countryCode: string,
) {
  const code = assertWithdrawalCountry(countryCode);
  const catalog = getPayoutMethodsForCountry(code);

  const bound = await prisma.userPaymentMethod.findMany({
    where: { userId, countryCode: code },
    select: { provider: true },
  });
  const boundSet = new Set(bound.map((b) => b.provider));

  return catalog.map((m) => ({
    countryCode: m.countryCode,
    provider: m.provider,
    label: m.label,
    category: m.category,
    methodType: m.methodType,
    alreadyBound: boundSet.has(m.provider),
  }));
}

export { WITHDRAWAL_COUNTRY_CODES };
