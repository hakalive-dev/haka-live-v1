import {
  getPayoutBindConfirmPairs,
  getPayoutBindFields,
  type PayoutBindFieldKey,
} from '@haka-live/shared-types/withdrawal-payout-methods';

export {
  getPayoutBindConfirmPairs,
  getPayoutBindFields,
  getRequiredPayoutBindFieldKeys,
  type PayoutBindFieldKey,
  type PayoutBindFieldSpec,
  type PayoutBindKeyboardType,
} from '@haka-live/shared-types/withdrawal-payout-methods';

export type PayoutBindFormValues = Partial<Record<PayoutBindFieldKey, string>>;

/** Returns true when all required fields are non-empty and confirm pairs match. */
export function isPayoutBindFormValid(
  countryCode: string,
  provider: string,
  values: PayoutBindFormValues,
): boolean {
  const fields = getPayoutBindFields(countryCode, provider);
  for (const field of fields) {
    if (field.required && !values[field.key]?.trim()) {
      return false;
    }
  }

  for (const [a, b] of getPayoutBindConfirmPairs(countryCode, provider)) {
    const left = values[a]?.trim() ?? '';
    const right = values[b]?.trim() ?? '';
    if (a === 'vpa' && b === 'confirmVpa') {
      if (left.toLowerCase() !== right.toLowerCase()) return false;
    } else if (left !== right) {
      return false;
    }
  }

  if (values.bep20Address?.trim()) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(values.bep20Address.trim())) return false;
  }
  if (values.trc20Address?.trim()) {
    if (!/^T[a-zA-Z0-9]{33}$/.test(values.trc20Address.trim())) return false;
  }

  return true;
}
