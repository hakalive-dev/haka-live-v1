import {
  WITHDRAWAL_PAYOUT_METHODS,
  type WithdrawalPayoutMethod,
} from '../../shared-types/withdrawal-payout-methods';
import { resetDb, createTestUser } from '../../tests/db-helpers';
import * as paymentMethodsService from './payment-methods.service';
import type { BindInput } from './payment-methods.service';

function bindInputForCatalog(entry: WithdrawalPayoutMethod): BindInput {
  const base = {
    countryCode: entry.countryCode,
    provider: entry.provider,
    nickname: '',
  };

  switch (entry.methodType) {
    case 'mobile_wallet':
      return { ...base, methodType: 'mobile_wallet', accountNo: '09171234567' };
    case 'bank_account': {
      const bankAccountNo =
        entry.provider === 'sepa_iban'
          ? 'IT60X0542811101000000123456'
          : '1234567890';
      const bankPayload = {
        ...base,
        methodType: 'bank_account' as const,
        bankAccountNo,
        bankName: entry.provider === 'sepa_iban' ? '' : 'Test Bank',
        accountHolderName: 'Test User',
        ...(entry.provider === 'bank_inr' ? { ifscCode: 'SBIN0001234' } : {}),
      };
      return bankPayload;
    }
    case 'upi':
      return {
        ...base,
        methodType: 'upi',
        vpa: 'user@upi',
      };
    case 'epay':
      return { ...base, methodType: 'epay', epayAccount: 'user@example.com' };
    case 'binance_bep20':
      return {
        ...base,
        methodType: 'binance_bep20',
        bep20Address: `0x${'a'.repeat(40)}`,
      };
    case 'usdt_trc20':
      return {
        ...base,
        methodType: 'usdt_trc20',
        trc20Address: `T${'A'.repeat(33)}`,
      };
    default:
      throw new Error(`Unhandled methodType: ${entry.methodType}`);
  }
}

describe('payment-methods catalog bind', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it.each(WITHDRAWAL_PAYOUT_METHODS)(
    'binds $countryCode $provider ($methodType)',
    async (entry) => {
      const user = await createTestUser();
      const method = await paymentMethodsService.bindMethod(
        user.id,
        bindInputForCatalog(entry),
      );

      expect(method.country_code).toBe(entry.countryCode);
      expect(method.provider).toBe(entry.provider);
      expect(method.label).toBe(entry.label);
      expect(method.method_type).toBe(entry.methodType);
      expect(method.masked_account).toBeTruthy();
    },
  );
});
