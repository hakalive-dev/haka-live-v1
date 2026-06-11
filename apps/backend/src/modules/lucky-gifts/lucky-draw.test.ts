import {
  runLuckyDraw,
  luckyReceiverBeans,
  expectedReturn,
  totalPayoutRatio,
} from './lucky-draw';

const CONFIG = {
  winProbability: 0.2,
  winMultiplier: 3.0,
  receiverBenefitPercent: 1.5,
};

describe('runLuckyDraw', () => {
  it('wins when rng < winProbability', () => {
    const result = runLuckyDraw(CONFIG, 100, () => 0.19);
    expect(result.isWin).toBe(true);
    expect(result.rewardCoins).toBe(300);
  });

  it('loses when rng >= winProbability (boundary)', () => {
    const result = runLuckyDraw(CONFIG, 100, () => 0.2);
    expect(result.isWin).toBe(false);
    expect(result.rewardCoins).toBe(0);
  });

  it('rounds the reward to whole coins', () => {
    const result = runLuckyDraw(
      { ...CONFIG, winMultiplier: 1.5 },
      25, // 25 × 1.5 = 37.5 → 38
      () => 0,
    );
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
});

describe('luckyReceiverBeans', () => {
  it('rounds the receiver cut', () => {
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 100)).toBe(2); // 1.5 → 2
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 90)).toBe(1); // 1.35 → 1
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 10)).toBe(0); // 0.15 → 0
    expect(luckyReceiverBeans({ receiverBenefitPercent: 0 }, 1000)).toBe(0);
  });
});

describe('expectedReturn / totalPayoutRatio', () => {
  it('TRP = probability × multiplier', () => {
    expect(expectedReturn(CONFIG)).toBeCloseTo(0.6);
  });

  it('total payout adds the receiver cut', () => {
    expect(totalPayoutRatio(CONFIG)).toBeCloseTo(0.615);
  });
});
