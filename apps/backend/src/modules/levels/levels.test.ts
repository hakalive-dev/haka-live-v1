import { calcLevel, XP_THRESHOLDS, MAX_LEVEL, getTiers, formatCoins } from './levels.service';

describe('Level System — calcLevel', () => {
  it('returns level 1 for 0 XP', () => {
    expect(calcLevel(0)).toBe(1);
  });

  it('returns level 1 below the level 2 threshold', () => {
    expect(calcLevel(XP_THRESHOLDS[1] - 1)).toBe(1);
  });

  it('returns level 2 exactly at the level 2 threshold', () => {
    expect(calcLevel(XP_THRESHOLDS[1])).toBe(2);
  });

  it('returns MAX_LEVEL at max threshold', () => {
    expect(calcLevel(XP_THRESHOLDS[MAX_LEVEL - 1])).toBe(MAX_LEVEL);
  });

  it('caps at MAX_LEVEL for very large XP', () => {
    expect(calcLevel(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
  });

  it('returns correct level at each threshold boundary', () => {
    XP_THRESHOLDS.forEach((threshold, idx) => {
      expect(calcLevel(threshold)).toBe(idx + 1);
    });
  });

  it('MAX_LEVEL is 100', () => {
    expect(MAX_LEVEL).toBe(100);
  });

  it('XP_THRESHOLDS has 100 entries', () => {
    expect(XP_THRESHOLDS).toHaveLength(100);
  });

  it('first threshold is 0', () => {
    expect(XP_THRESHOLDS[0]).toBe(0);
  });

  it('thresholds are monotonically increasing', () => {
    for (let i = 1; i < XP_THRESHOLDS.length; i++) {
      expect(XP_THRESHOLDS[i]).toBeGreaterThan(XP_THRESHOLDS[i - 1]);
    }
  });
});

describe('Level System — getTiers', () => {
  const tiers = getTiers();

  it('returns 22 tiers (Level 0 + 20 ranges + Super Level)', () => {
    expect(tiers).toHaveLength(22);
  });

  it('first tier is Level 0', () => {
    expect(tiers[0].label).toBe('Level 0');
  });

  it('last tier is Super Level', () => {
    expect(tiers[tiers.length - 1].isSuper).toBe(true);
    expect(tiers[tiers.length - 1].label).toBe('Super Level');
  });

  it('tier ranges are contiguous with no gaps', () => {
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].minLevel).toBe(tiers[i - 1].maxLevel + 1);
    }
  });
});

describe('Level System — formatCoins', () => {
  it('formats thousands', () => {
    expect(formatCoins(5_000)).toBe('5k');
  });

  it('formats millions', () => {
    expect(formatCoins(1_200_000)).toBe('1.2M');
  });

  it('formats billions', () => {
    expect(formatCoins(10_000_000_000)).toBe('10B');
  });
});
