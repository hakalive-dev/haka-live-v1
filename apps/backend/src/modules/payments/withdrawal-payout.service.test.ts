import { WITHDRAWAL_COUNTRY_CODES } from '../../shared-types/withdrawal-payout-methods';
import {
  assertPayoutMethod,
  assertWithdrawalCountry,
  getCatalogForCountry,
} from './withdrawal-payout.service';

describe('withdrawal-payout.service', () => {
  it('exposes exactly 13 withdrawal countries', () => {
    expect(WITHDRAWAL_COUNTRY_CODES).toHaveLength(13);
  });

  it('PH catalog includes GCash and Maya, not Epay', () => {
    const methods = getCatalogForCountry('PH');
    const labels = methods.map((m) => m.label);
    expect(labels).toEqual(expect.arrayContaining(['GCash', 'Maya']));
    expect(labels.some((l) => /epay/i.test(l))).toBe(false);
    expect(methods.every((m) => m.countryCode === 'PH')).toBe(true);
  });

  it('IN catalog includes UPI and Bank, not Epay', () => {
    const methods = getCatalogForCountry('IN');
    const providers = methods.map((m) => m.provider);
    expect(providers).toContain('upi');
    expect(providers).toContain('bank_inr');
    expect(providers).not.toContain('epay');
  });

  it('US catalog includes Epay and USDT rails', () => {
    const methods = getCatalogForCountry('US');
    const providers = methods.map((m) => m.provider);
    expect(providers).toContain('epay');
    expect(providers).toContain('usdt_trc20');
    expect(providers).toContain('usdt_bep20');
  });

  it('rejects unsupported withdrawal country', () => {
    expect(() => assertWithdrawalCountry('GB')).toThrow(/not supported/i);
  });

  it('rejects gcash provider for India', () => {
    expect(() => assertPayoutMethod('IN', 'gcash')).toThrow(/not available/i);
  });
});
