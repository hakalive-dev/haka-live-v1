import {
  runLuckyDraw,
  luckyReceiverBeans,
  expectedReturn,
  totalPayoutRatio,
  pickWinMultiplier,
  averageWinMultiplier,
  normalizeWinMultiplierTiers,
} from './lucky-draw';

const CONFIG = {
  winProbability: 0.2,
  winMultiplierTiers: [
    { multiplier: 3, weight: 1 },
  ],
  receiverBenefitPercent: 1.5,
};

describe('runLuckyDraw', () => {
  it('wins when rng < winProbability and draws a random multiplier', () => {
    let call = 0;
    const rng = () => {
      call += 1;
      return call === 1 ? 0.19 : 0;
    };
    const result = runLuckyDraw(CONFIG, 100, rng);
    expect(result.isWin).toBe(true);
    expect(result.winMultiplier).toBe(3);
    expect(result.rewardCoins).toBe(300);
  });

  it('loses when rng >= winProbability (boundary)', () => {
    const result = runLuckyDraw(CONFIG, 100, () => 0.2);
    expect(result.isWin).toBe(false);
    expect(result.winMultiplier).toBe(0);
    expect(result.rewardCoins).toBe(0);
  });

  it('rounds the reward to whole coins', () => {
    const result = runLuckyDraw(
      {
        ...CONFIG,
        winMultiplierTiers: [{ multiplier: 1.5, weight: 1 }],
      },
      25, // 25 × 1.5 = 37.5 → 38
      () => 0,
    );
    expect(result.winMultiplier).toBe(1.5);
    expect(result.rewardCoins).toBe(38);
  });

  it('computes the receiver bean pool on win AND lose', () => {
    const win = runLuckyDraw(CONFIG, 1000, () => 0);
    const lose = runLuckyDraw(CONFIG, 1000, () => 0.99);
    expect(win.receiverBeans).toBe(15); // 1000 × 1.5%
    expect(lose.receiverBeans).toBe(15);
  });

  it('never wins at probability 0 and always wins below probability 1', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(runLuckyDraw({ ...CONFIG, winProbability: 0 }, 100, () => r).isWin).toBe(false);
      expect(runLuckyDraw({ ...CONFIG, winProbability: 1 }, 100, () => r).isWin).toBe(true);
    }
  });

  it('observed win rate over N samples matches winProbability', () => {
    // Deterministic LCG so the test never flakes.
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const N = 100_000;
    let wins = 0;
    for (let i = 0; i < N; i++) {
      if (runLuckyDraw(CONFIG, 100, lcg).isWin) wins++;
    }
    const observed = wins / N;
    expect(observed).toBeGreaterThan(CONFIG.winProbability - 0.01);
    expect(observed).toBeLessThan(CONFIG.winProbability + 0.01);
  });

  it('draws different multipliers from weighted tiers', () => {
    const tiers = [
      { multiplier: 2, weight: 1 },
      { multiplier: 10, weight: 1 },
    ];
    const seen = new Set<number>();
    let seed = 7;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 200; i++) {
      seen.add(pickWinMultiplier(tiers, lcg));
    }
    expect(seen.has(2)).toBe(true);
    expect(seen.has(10)).toBe(true);
  });
});

describe('luckyReceiverBeans', () => {
  it('rounds the receiver cut', () => {
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 100)).toBe(2); // 1.5 → 2
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 90)).toBe(1); // 1.35 → 1
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 10)).toBe(0); // 0.15 → 0
    expect(luckyReceiverBeans({ receiverBenefitPercent: 0 }, 1000)).toBe(0);
  });
});

describe('normalizeWinMultiplierTiers / averageWinMultiplier', () => {
  it('falls back to scalar multiplier when tiers are empty', () => {
    expect(normalizeWinMultiplierTiers([], 3)).toEqual([{ multiplier: 3, weight: 1 }]);
    expect(averageWinMultiplier([])).toBe(3);
  });

  it('computes weighted average multiplier', () => {
    const tiers = [
      { multiplier: 2, weight: 1 },
      { multiplier: 4, weight: 1 },
    ];
    expect(averageWinMultiplier(tiers)).toBe(3);
  });
});

describe('expectedReturn / totalPayoutRatio', () => {
  it('TRP = probability × average multiplier', () => {
    expect(expectedReturn(CONFIG)).toBeCloseTo(0.6);
  });

  it('total payout adds the receiver cut', () => {
    expect(totalPayoutRatio(CONFIG)).toBeCloseTo(0.615);
  });
});
