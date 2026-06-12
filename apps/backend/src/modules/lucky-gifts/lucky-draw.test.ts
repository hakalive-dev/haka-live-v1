import {
  runLuckyDraw,
  luckyReceiverBeans,
  expectedReturn,
  totalPayoutRatio,
  pickWinTier,
  averageWinMultiplier,
  averageRewardCoins,
  normalizeWinMultiplierTiers,
} from './lucky-draw';

const CONFIG = {
  winProbability: 0.2,
  winMultiplierTiers: [{ multiplier: 3, rewardCoins: 300, weight: 1 }],
  receiverBenefitPercent: 1.5,
};

describe('runLuckyDraw', () => {
  it('wins when rng < winProbability and credits tier rewardCoins (not stake × mult)', () => {
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

  it('same stake with different tier rewardCoins yields different payouts', () => {
    const tiersConfig = {
      ...CONFIG,
      winProbability: 1,
      winMultiplierTiers: [
        { multiplier: 2, rewardCoins: 50, weight: 1 },
        { multiplier: 10, rewardCoins: 500, weight: 1 },
      ],
    };
    const low = runLuckyDraw(tiersConfig, 100, () => 0);
    const high = runLuckyDraw(tiersConfig, 100, () => 0.6);
    expect(low.rewardCoins).toBe(50);
    expect(high.rewardCoins).toBe(500);
    expect(low.winMultiplier).toBe(2);
    expect(high.winMultiplier).toBe(10);
  });

  it('loses when rng >= winProbability (boundary)', () => {
    const result = runLuckyDraw(CONFIG, 100, () => 0.2);
    expect(result.isWin).toBe(false);
    expect(result.winMultiplier).toBe(0);
    expect(result.rewardCoins).toBe(0);
  });

  it('rounds tier rewardCoins to whole coins', () => {
    const result = runLuckyDraw(
      {
        ...CONFIG,
        winMultiplierTiers: [{ multiplier: 5, rewardCoins: 37.6, weight: 1 }],
      },
      25,
      () => 0,
    );
    expect(result.rewardCoins).toBe(38);
  });

  it('computes the receiver bean pool on win AND lose', () => {
    const win = runLuckyDraw(CONFIG, 1000, () => 0);
    const lose = runLuckyDraw(CONFIG, 1000, () => 0.99);
    expect(win.receiverBeans).toBe(15);
    expect(lose.receiverBeans).toBe(15);
  });

  it('never wins at probability 0 and always wins below probability 1', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(runLuckyDraw({ ...CONFIG, winProbability: 0 }, 100, () => r).isWin).toBe(false);
      expect(runLuckyDraw({ ...CONFIG, winProbability: 1 }, 100, () => r).isWin).toBe(true);
    }
  });

  it('observed win rate over N samples matches winProbability', () => {
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

  it('draws different tiers from weighted table', () => {
    const tiers = [
      { multiplier: 2, rewardCoins: 20, weight: 1 },
      { multiplier: 10, rewardCoins: 200, weight: 1 },
    ];
    const seen = new Set<number>();
    let seed = 7;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 200; i++) {
      seen.add(pickWinTier(tiers, lcg).rewardCoins);
    }
    expect(seen.has(20)).toBe(true);
    expect(seen.has(200)).toBe(true);
  });
});

describe('luckyReceiverBeans', () => {
  it('rounds the receiver cut', () => {
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 100)).toBe(2);
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 90)).toBe(1);
    expect(luckyReceiverBeans({ receiverBenefitPercent: 1.5 }, 10)).toBe(0);
    expect(luckyReceiverBeans({ receiverBenefitPercent: 0 }, 1000)).toBe(0);
  });
});

describe('normalizeWinMultiplierTiers / averages', () => {
  it('falls back to scalar when tiers are empty', () => {
    expect(normalizeWinMultiplierTiers([], 3)).toEqual([
      { multiplier: 3, rewardCoins: 3, weight: 1 },
    ]);
  });

  it('computes weighted averages', () => {
    const tiers = [
      { multiplier: 2, rewardCoins: 100, weight: 1 },
      { multiplier: 4, rewardCoins: 400, weight: 1 },
    ];
    expect(averageWinMultiplier(tiers)).toBe(3);
    expect(averageRewardCoins(tiers)).toBe(250);
  });
});

describe('expectedReturn / totalPayoutRatio', () => {
  it('TRP = probability × avg reward / reference stake', () => {
    expect(expectedReturn(CONFIG)).toBeCloseTo(0.6);
  });

  it('total payout adds the receiver cut', () => {
    expect(totalPayoutRatio(CONFIG)).toBeCloseTo(0.615);
  });
});
