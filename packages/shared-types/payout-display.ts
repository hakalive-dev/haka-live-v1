/** Frozen payout instructions on a withdrawal (decrypted at request time). */
export interface PayoutSnapshot {
  paymentMethodId: string;
  methodType: string;
  countryCode: string;
  provider: string;
  label: string;
  maskedAccount: string;
  accountLabel: string;
  accountHolderName?: string;
  bankName?: string;
  ifscCode?: string;
  accountNumber?: string;
  epayAccount?: string;
  bep20Address?: string;
  trc20Address?: string;
  countryName?: string;
}

export type PayoutDisplayRow = { label: string; value: string };

export function payoutDisplayRows(snap: PayoutSnapshot | null | undefined): PayoutDisplayRow[] {
  if (!snap) return [];
  const rows: PayoutDisplayRow[] = [];

  if (snap.label) rows.push({ label: 'Payment Method', value: snap.label });
  if (snap.bankName) rows.push({ label: 'Bank name', value: snap.bankName });
  if (snap.accountNumber) rows.push({ label: accountNumberLabel(snap), value: snap.accountNumber });
  else if (snap.maskedAccount) rows.push({ label: accountNumberLabel(snap), value: snap.maskedAccount });
  if (snap.ifscCode) rows.push({ label: 'IFSC', value: snap.ifscCode });
  if (snap.epayAccount) rows.push({ label: 'Epay account', value: snap.epayAccount });
  if (snap.bep20Address) rows.push({ label: 'BEP20 address', value: snap.bep20Address });
  if (snap.trc20Address) rows.push({ label: 'TRC20 address', value: snap.trc20Address });
  const holder = snap.accountHolderName || snap.accountLabel;
  if (holder) rows.push({ label: 'Full Name', value: holder });
  if (snap.countryName) rows.push({ label: 'Country', value: snap.countryName });

  return rows;
}

function accountNumberLabel(snap: PayoutSnapshot): string {
  const t = (snap.methodType || '').toLowerCase();
  if (t === 'upi') return 'UPI';
  if (t === 'mobile_wallet') return 'Mobile number';
  if (t === 'bank_account') return 'Account number';
  if (t === 'epay') return 'Epay account';
  if (t === 'binance_bep20') return 'BEP20 address';
  if (t === 'usdt_trc20') return 'TRC20 address';
  return 'Account';
}
