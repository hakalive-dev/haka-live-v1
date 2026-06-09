import { resolveGiftBonusRateFromSetting } from './gift-bonus-rate';

describe('resolveGiftBonusRateFromSetting', () => {
  const base = {
    globallyEnabled: true,
    agencyEnabled: true,
    fallbackBonusRate: 0.15,
    tierRowCount: 0,
    tierBonusRate: null as number | null,
    overrideRate: null as number | null,
    overrideActive: false,
  };

  it('returns 0 when globally disabled', () => {
    expect(
      resolveGiftBonusRateFromSetting({
        ...base,
        globallyEnabled: false,
        overrideRate: 0.3,
        overrideActive: true,
      }),
    ).toBe(0);
  });

  it('returns 0 when per-agency disabled', () => {
    expect(
      resolveGiftBonusRateFromSetting({
        ...base,
        agencyEnabled: false,
        overrideRate: 0.3,
        overrideActive: true,
      }),
    ).toBe(0);
  });

  it('uses override when active', () => {
    expect(
      resolveGiftBonusRateFromSetting({
        ...base,
        overrideRate: 0.2,
        overrideActive: true,
      }),
    ).toBe(0.2);
  });

  it('uses fallback when no tiers', () => {
    expect(resolveGiftBonusRateFromSetting(base)).toBe(0.15);
  });

  it('uses tier rate when tiers exist', () => {
    expect(
      resolveGiftBonusRateFromSetting({
        ...base,
        tierRowCount: 2,
        tierBonusRate: 0.1,
      }),
    ).toBe(0.1);
  });
});
