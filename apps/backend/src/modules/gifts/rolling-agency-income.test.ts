import {
  clampRollingWindowStart,
  illustrativeCompanyShareForAgencyPath,
  COMMISSION_ROLLING_DAYS,
} from './rolling-agency-income';

describe('clampRollingWindowStart', () => {
  it('uses sliding start when agency is older than rolling window', () => {
    const end = new Date('2026-06-01T12:00:00.000Z');
    const notBefore = new Date('2020-01-01T00:00:00.000Z');
    const got = clampRollingWindowStart(end, COMMISSION_ROLLING_DAYS, notBefore);
    const sliding = new Date(end.getTime() - COMMISSION_ROLLING_DAYS * 24 * 60 * 60 * 1000);
    expect(got.getTime()).toBe(sliding.getTime());
  });

  it('uses notBefore when agency is younger than full rolling window', () => {
    const end = new Date('2026-06-01T12:00:00.000Z');
    const notBefore = new Date('2026-05-28T00:00:00.000Z');
    const got = clampRollingWindowStart(end, COMMISSION_ROLLING_DAYS, notBefore);
    expect(got.getTime()).toBe(notBefore.getTime());
  });
});

describe('illustrativeCompanyShareForAgencyPath', () => {
  it('matches integer remainder at 4% commission, no bonus/parent', () => {
    const ill = illustrativeCompanyShareForAgencyPath({ commissionRate: 0.04 });
    expect(ill.hostBeans).toBe(700_000);
    expect(ill.directCommissionBeans).toBe(28_000);
    expect(ill.companyBeans).toBe(1_000_000 - 700_000 - 28_000);
    expect(ill.companyPercentOfGross).toBeCloseTo(27.2, 5);
  });
});
