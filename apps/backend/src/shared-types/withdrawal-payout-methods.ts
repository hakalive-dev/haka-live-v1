export type WithdrawalPayoutCategory =
  | 'mobile_wallet'
  | 'bank'
  | 'upi'
  | 'crypto'
  | 'epay'
  | 'remittance';

export type WithdrawalBindMethodType =
  | 'mobile_wallet'
  | 'bank_account'
  | 'upi'
  | 'epay'
  | 'usdt_trc20'
  | 'binance_bep20';

export interface WithdrawalPayoutMethod {
  countryCode: string;
  provider: string;
  label: string;
  category: WithdrawalPayoutCategory;
  methodType: WithdrawalBindMethodType;
}

/** ISO 3166-1 alpha-2 codes allowed for bean withdrawal. */
export const WITHDRAWAL_COUNTRY_CODES = [
  'IN', 'KE', 'NP', 'NG', 'PK', 'PH', 'ZA', 'VN', 'BD', 'US', 'ET', 'GH', 'IT',
] as const;

export type WithdrawalCountryCode = (typeof WITHDRAWAL_COUNTRY_CODES)[number];

export const WITHDRAWAL_COUNTRY_META: Array<{
  countryCode: WithdrawalCountryCode;
  countryName: string;
  currency: string;
  symbol: string;
  usdRate: number;
  minWithdrawalBeans?: number;
}> = [
  {
    countryCode: 'IN',
    countryName: 'India',
    currency: 'INR',
    symbol: '₹',
    usdRate: 92,
    minWithdrawalBeans: 100_000,
  },
  { countryCode: 'KE', countryName: 'Kenya', currency: 'KES', symbol: 'KSh', usdRate: 129 },
  { countryCode: 'NP', countryName: 'Nepal', currency: 'NPR', symbol: 'Rs', usdRate: 133 },
  { countryCode: 'NG', countryName: 'Nigeria', currency: 'NGN', symbol: '₦', usdRate: 1600 },
  { countryCode: 'PK', countryName: 'Pakistan', currency: 'PKR', symbol: '₨', usdRate: 278 },
  { countryCode: 'PH', countryName: 'Philippines', currency: 'PHP', symbol: '₱', usdRate: 56 },
  { countryCode: 'ZA', countryName: 'South Africa', currency: 'ZAR', symbol: 'R', usdRate: 18.5 },
  { countryCode: 'VN', countryName: 'Vietnam', currency: 'VND', symbol: '₫', usdRate: 25300 },
  { countryCode: 'BD', countryName: 'Bangladesh', currency: 'BDT', symbol: '৳', usdRate: 110 },
  { countryCode: 'US', countryName: 'United States', currency: 'USD', symbol: '$', usdRate: 1 },
  { countryCode: 'ET', countryName: 'Ethiopia', currency: 'ETB', symbol: 'Br', usdRate: 56 },
  { countryCode: 'GH', countryName: 'Ghana', currency: 'GHS', symbol: '₵', usdRate: 15.5 },
  { countryCode: 'IT', countryName: 'Italy', currency: 'EUR', symbol: '€', usdRate: 0.92 },
];

export const WITHDRAWAL_PAYOUT_METHODS: WithdrawalPayoutMethod[] = [
  // India
  { countryCode: 'IN', provider: 'upi', label: 'UPI', category: 'upi', methodType: 'upi' },
  { countryCode: 'IN', provider: 'bank_inr', label: 'Bank', category: 'bank', methodType: 'bank_account' },

  // Kenya
  { countryCode: 'KE', provider: 'mpesa', label: 'M-Pesa', category: 'mobile_wallet', methodType: 'mobile_wallet' },

  // Nepal
  { countryCode: 'NP', provider: 'esewa', label: 'eSewa', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'NP', provider: 'khalti', label: 'Khalti', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'NP', provider: 'bank_npr', label: 'Bank NPR', category: 'bank', methodType: 'bank_account' },

  // Nigeria
  { countryCode: 'NG', provider: 'bank_ngn', label: 'Bank NGN', category: 'bank', methodType: 'bank_account' },
  { countryCode: 'NG', provider: 'opay', label: 'Opay', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'NG', provider: 'palmpay', label: 'PalmPay', category: 'mobile_wallet', methodType: 'mobile_wallet' },

  // Pakistan
  { countryCode: 'PK', provider: 'easypaisa', label: 'Easypaisa', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'PK', provider: 'jazzcash', label: 'JazzCash', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'PK', provider: 'bank_pkr', label: 'Bank PKR', category: 'bank', methodType: 'bank_account' },

  // Philippines
  { countryCode: 'PH', provider: 'gcash', label: 'GCash', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'PH', provider: 'maya', label: 'Maya', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'PH', provider: 'bank_php', label: 'Bank PHP', category: 'bank', methodType: 'bank_account' },

  // South Africa
  { countryCode: 'ZA', provider: 'payshap', label: 'Payshap', category: 'bank', methodType: 'bank_account' },

  // Vietnam
  { countryCode: 'VN', provider: 'bank_vnd', label: 'Bank VND', category: 'bank', methodType: 'bank_account' },
  { countryCode: 'VN', provider: 'momo', label: 'MoMo', category: 'mobile_wallet', methodType: 'mobile_wallet' },

  // Bangladesh
  { countryCode: 'BD', provider: 'bkash', label: 'bKash', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'BD', provider: 'nagad', label: 'Nagad', category: 'mobile_wallet', methodType: 'mobile_wallet' },

  // USA — remittance + crypto/epay only here
  { countryCode: 'US', provider: 'whish_lbp_usd', label: 'Whish Money (LBP) USD', category: 'remittance', methodType: 'mobile_wallet' },
  { countryCode: 'US', provider: 'local_office_syp_usd', label: 'Local Office (SYP) USD', category: 'remittance', methodType: 'mobile_wallet' },
  { countryCode: 'US', provider: 'local_office_lyd_usd', label: 'Local Office (LYD) USD', category: 'remittance', methodType: 'mobile_wallet' },
  { countryCode: 'US', provider: 'usdt_trc20', label: 'USDT TRC20', category: 'crypto', methodType: 'usdt_trc20' },
  { countryCode: 'US', provider: 'usdt_bep20', label: 'USDT BEP20', category: 'crypto', methodType: 'binance_bep20' },
  { countryCode: 'US', provider: 'epay', label: 'Epay', category: 'epay', methodType: 'epay' },

  // Ethiopia
  { countryCode: 'ET', provider: 'telebirr', label: 'Telebirr', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'ET', provider: 'cbe_birr', label: 'CBE Birr', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'ET', provider: 'awash_bank', label: 'Awash Bank', category: 'bank', methodType: 'bank_account' },
  { countryCode: 'ET', provider: 'abyssinia_bank', label: 'Abyssinia Bank', category: 'bank', methodType: 'bank_account' },

  // Ghana
  { countryCode: 'GH', provider: 'mtn_momo', label: 'MTN Mobile Money', category: 'mobile_wallet', methodType: 'mobile_wallet' },
  { countryCode: 'GH', provider: 'vodafone_cash', label: 'Vodafone Cash', category: 'mobile_wallet', methodType: 'mobile_wallet' },

  // Italy
  { countryCode: 'IT', provider: 'sepa_iban', label: 'SEPA (IBAN)', category: 'bank', methodType: 'bank_account' },
];

const withdrawalCountrySet = new Set<string>(WITHDRAWAL_COUNTRY_CODES);

export function isWithdrawalCountry(countryCode: string): boolean {
  return withdrawalCountrySet.has(countryCode.toUpperCase());
}

export function getPayoutMethodsForCountry(countryCode: string): WithdrawalPayoutMethod[] {
  const code = countryCode.toUpperCase();
  return WITHDRAWAL_PAYOUT_METHODS.filter((m) => m.countryCode === code);
}

export function findPayoutMethod(
  countryCode: string,
  provider: string,
): WithdrawalPayoutMethod | undefined {
  const code = countryCode.toUpperCase();
  return WITHDRAWAL_PAYOUT_METHODS.find(
    (m) => m.countryCode === code && m.provider === provider,
  );
}

// ── Payout bind form fields (mobile + validation) ───────────────────────────

export type PayoutBindFieldKey =
  | 'vpa'
  | 'confirmVpa'
  | 'accountNo'
  | 'confirmAccountNo'
  | 'iban'
  | 'confirmIban'
  | 'bankAccountNo'
  | 'confirmBankAccountNo'
  | 'bankName'
  | 'ifscCode'
  | 'accountHolderName'
  | 'epayAccount'
  | 'confirmEpayAccount'
  | 'bep20Address'
  | 'confirmBep20Address'
  | 'trc20Address'
  | 'confirmTrc20Address'
  | 'nickname';

export type PayoutBindKeyboardType = 'default' | 'phone-pad' | 'email-address' | 'numeric';

export interface PayoutBindFieldSpec {
  key: PayoutBindFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  keyboardType?: PayoutBindKeyboardType;
  autoCapitalize?: 'none' | 'words' | 'characters';
  monospace?: boolean;
}

function bindField(
  key: PayoutBindFieldKey,
  label: string,
  placeholder: string,
  required: boolean,
  extras?: Partial<Omit<PayoutBindFieldSpec, 'key' | 'label' | 'placeholder' | 'required'>>,
): PayoutBindFieldSpec {
  return { key, label, placeholder, required, ...extras };
}

function upiBindFields(): PayoutBindFieldSpec[] {
  return [
    bindField('vpa', 'UPI ID (VPA)', 'name@upi', true, {
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    }),
    bindField('confirmVpa', 'Confirm UPI ID', 'Re-enter UPI ID', true, {
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    }),
  ];
}

function mobileWalletBindFields(label: string): PayoutBindFieldSpec[] {
  return [
    bindField('accountNo', `${label} mobile number`, 'Enter mobile number', true, {
      keyboardType: 'phone-pad',
      autoCapitalize: 'none',
    }),
    bindField('confirmAccountNo', 'Confirm mobile number', 'Re-enter mobile number', true, {
      keyboardType: 'phone-pad',
      autoCapitalize: 'none',
    }),
  ];
}

function remittanceBindFields(provider: string): PayoutBindFieldSpec[] {
  const idLabel = provider === 'whish_lbp_usd' ? 'Whish wallet ID' : 'Beneficiary ID';
  return [
    bindField('accountNo', idLabel, `Enter ${idLabel.toLowerCase()}`, true, {
      autoCapitalize: 'none',
    }),
    bindField('confirmAccountNo', `Confirm ${idLabel.toLowerCase()}`, `Re-enter ${idLabel.toLowerCase()}`, true, {
      autoCapitalize: 'none',
    }),
  ];
}

function bankIndiaBindFields(): PayoutBindFieldSpec[] {
  return [
    bindField('bankAccountNo', 'Bank account number', 'Enter account number', true, {
      keyboardType: 'numeric',
      autoCapitalize: 'none',
    }),
    bindField('confirmBankAccountNo', 'Confirm bank account number', 'Re-enter account number', true, {
      keyboardType: 'numeric',
      autoCapitalize: 'none',
    }),
    bindField('bankName', 'Bank name', 'Enter bank name', true),
    bindField('ifscCode', 'IFSC code', 'Enter IFSC code', true, { autoCapitalize: 'characters' }),
    bindField('accountHolderName', 'Account holder name', 'Name on account', true, {
      autoCapitalize: 'words',
    }),
  ];
}

function sepaBindFields(): PayoutBindFieldSpec[] {
  return [
    bindField('iban', 'IBAN', 'Enter IBAN', true, { autoCapitalize: 'characters' }),
    bindField('confirmIban', 'Confirm IBAN', 'Re-enter IBAN', true, { autoCapitalize: 'characters' }),
    bindField('accountHolderName', 'Account holder name', 'Name on account', true, {
      autoCapitalize: 'words',
    }),
  ];
}

function standardBankBindFields(): PayoutBindFieldSpec[] {
  return [
    bindField('bankAccountNo', 'Bank account number', 'Enter account number', true, {
      autoCapitalize: 'none',
    }),
    bindField('confirmBankAccountNo', 'Confirm bank account number', 'Re-enter account number', true, {
      autoCapitalize: 'none',
    }),
    bindField('bankName', 'Bank name', 'Enter bank name', true),
    bindField('accountHolderName', 'Account holder name', 'Name on account', true, {
      autoCapitalize: 'words',
    }),
  ];
}

function epayBindFields(): PayoutBindFieldSpec[] {
  return [
    bindField('epayAccount', 'Epay account', 'Enter Epay account', true, {
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    }),
    bindField('confirmEpayAccount', 'Confirm Epay account', 'Re-enter Epay account', true, {
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    }),
  ];
}

function trc20BindFields(): PayoutBindFieldSpec[] {
  return [
    bindField('trc20Address', 'TRC20 wallet address', 'Enter TRC20 address', true, {
      autoCapitalize: 'none',
      monospace: true,
    }),
    bindField('confirmTrc20Address', 'Confirm TRC20 address', 'Re-enter TRC20 address', true, {
      autoCapitalize: 'none',
      monospace: true,
    }),
  ];
}

function bep20BindFields(): PayoutBindFieldSpec[] {
  return [
    bindField('bep20Address', 'BEP20 wallet address', '0x...', true, {
      autoCapitalize: 'none',
      monospace: true,
    }),
    bindField('confirmBep20Address', 'Confirm BEP20 address', 'Re-enter BEP20 address', true, {
      autoCapitalize: 'none',
      monospace: true,
    }),
    bindField('nickname', 'Nickname (optional)', 'Give this method a nickname', false, {
      autoCapitalize: 'words',
    }),
  ];
}

/**
 * Bind form fields for a catalog payout method. Covers all WITHDRAWAL_PAYOUT_METHODS entries.
 */
export function getPayoutBindFields(
  countryCode: string,
  provider: string,
  methodType?: WithdrawalBindMethodType,
): PayoutBindFieldSpec[] {
  const entry = findPayoutMethod(countryCode, provider);
  if (!entry) {
    throw new Error(`No payout method found for ${countryCode}/${provider}`);
  }
  if (methodType && entry.methodType !== methodType) {
    throw new Error(`Method type mismatch for ${countryCode}/${provider}`);
  }

  switch (entry.methodType) {
    case 'upi':
      return upiBindFields();
    case 'mobile_wallet':
      return entry.category === 'remittance'
        ? remittanceBindFields(entry.provider)
        : mobileWalletBindFields(entry.label);
    case 'bank_account':
      if (entry.provider === 'bank_inr') return bankIndiaBindFields();
      if (entry.provider === 'sepa_iban') return sepaBindFields();
      return standardBankBindFields();
    case 'epay':
      return epayBindFields();
    case 'usdt_trc20':
      return trc20BindFields();
    case 'binance_bep20':
      return bep20BindFields();
    default: {
      const _exhaustive: never = entry.methodType;
      throw new Error(`Unhandled method type: ${_exhaustive}`);
    }
  }
}

export function getRequiredPayoutBindFieldKeys(
  countryCode: string,
  provider: string,
): PayoutBindFieldKey[] {
  return getPayoutBindFields(countryCode, provider)
    .filter((f) => f.required)
    .map((f) => f.key);
}

/** Pairs of field keys that must match on submit (case-sensitive unless noted). */
export function getPayoutBindConfirmPairs(
  countryCode: string,
  provider: string,
): Array<[PayoutBindFieldKey, PayoutBindFieldKey]> {
  const entry = findPayoutMethod(countryCode, provider);
  if (!entry) return [];

  switch (entry.methodType) {
    case 'upi':
      return [['vpa', 'confirmVpa']];
    case 'mobile_wallet':
      return [['accountNo', 'confirmAccountNo']];
    case 'bank_account':
      return entry.provider === 'sepa_iban'
        ? [['iban', 'confirmIban']]
        : [['bankAccountNo', 'confirmBankAccountNo']];
    case 'epay':
      return [['epayAccount', 'confirmEpayAccount']];
    case 'usdt_trc20':
      return [['trc20Address', 'confirmTrc20Address']];
    case 'binance_bep20':
      return [['bep20Address', 'confirmBep20Address']];
    default:
      return [];
  }
}
