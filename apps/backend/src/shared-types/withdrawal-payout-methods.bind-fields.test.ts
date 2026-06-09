import {
  WITHDRAWAL_PAYOUT_METHODS,
  getPayoutBindFields,
  getRequiredPayoutBindFieldKeys,
  type WithdrawalPayoutMethod,
} from './withdrawal-payout-methods';

function expectedRequiredKeys(entry: WithdrawalPayoutMethod): string[] {
  switch (entry.methodType) {
    case 'upi':
      return ['vpa', 'confirmVpa'];
    case 'mobile_wallet':
      return ['accountNo', 'confirmAccountNo'];
    case 'bank_account':
      if (entry.provider === 'sepa_iban') {
        return ['iban', 'confirmIban', 'accountHolderName'];
      }
      if (entry.provider === 'bank_inr') {
        return [
          'bankAccountNo',
          'confirmBankAccountNo',
          'bankName',
          'ifscCode',
          'accountHolderName',
        ];
      }
      return ['bankAccountNo', 'confirmBankAccountNo', 'bankName', 'accountHolderName'];
    case 'epay':
      return ['epayAccount', 'confirmEpayAccount'];
    case 'usdt_trc20':
      return ['trc20Address', 'confirmTrc20Address'];
    case 'binance_bep20':
      return ['bep20Address', 'confirmBep20Address'];
    default:
      return [];
  }
}

describe('withdrawal payout bind fields catalog', () => {
  it('covers every catalog entry', () => {
    expect(WITHDRAWAL_PAYOUT_METHODS.length).toBe(33);
  });

  it.each(WITHDRAWAL_PAYOUT_METHODS)(
    'has bind fields for $countryCode $provider ($methodType)',
    (entry) => {
      const fields = getPayoutBindFields(entry.countryCode, entry.provider, entry.methodType);
      expect(fields.length).toBeGreaterThan(0);

      const required = getRequiredPayoutBindFieldKeys(entry.countryCode, entry.provider);
      expect(required.sort()).toEqual(expectedRequiredKeys(entry).sort());
    },
  );
});
