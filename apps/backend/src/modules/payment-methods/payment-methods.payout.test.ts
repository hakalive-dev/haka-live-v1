import { resetDb, createTestUser } from '../../tests/db-helpers';
import * as paymentMethodsService from './payment-methods.service';

describe('payment-methods payout bind', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('binds GCash for Philippines', async () => {
    const user = await createTestUser();
    const method = await paymentMethodsService.bindMethod(user.id, {
      methodType: 'mobile_wallet',
      countryCode: 'PH',
      provider: 'gcash',
      accountNo: '09171234567',
      nickname: '',
    });
    expect(method.country_code).toBe('PH');
    expect(method.provider).toBe('gcash');
    expect(method.label).toBe('GCash');
  });

  it('rejects GCash bind for India', async () => {
    const user = await createTestUser();
    await expect(
      paymentMethodsService.bindMethod(user.id, {
        methodType: 'mobile_wallet',
        countryCode: 'IN',
        provider: 'gcash',
        accountNo: '9876543210',
        nickname: '',
      }),
    ).rejects.toThrow(/not available/i);
  });

  it('rejects UPI with wrong method type', async () => {
    const user = await createTestUser();
    await expect(
      paymentMethodsService.bindMethod(user.id, {
        methodType: 'bank_account',
        countryCode: 'IN',
        provider: 'upi',
        bankAccountNo: '1234567890',
        bankName: 'Test',
        accountHolderName: 'Test User',
        nickname: '',
      }),
    ).rejects.toThrow(/does not match/i);
  });
});
