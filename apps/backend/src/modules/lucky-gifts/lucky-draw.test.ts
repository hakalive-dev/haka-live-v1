import {
  runLuckyDraw,
  luckyReceiverBeans,
  expectedReturn,
  totalPayoutRatio,
  pickWinTier,
  averagePayoutPercent,
  averageRewardCoins,
  normalizeWinMultiplierTiers,
  rewardCoinsForTier,
} from './lucky-draw';

const CONFIG = {
  winProbability: 0.2,
  winMultiplierTiers: [{ payoutPercent: 300, weight: 1 }],
  receiverBenefitPercent: 1.5,
};

describe('runLuckyDraw', () => {
  it('wins when rng < winProbability and credits stake × payoutPercent / 100', () => {
    let call = 0;
    const rng = () => {
      call += 1;
      return call === 1 ? 0.19 : 0;
    };
    const result = runLuckyDraw(CONFIG, 100, rng);
    expect(result.isWin).toBe(true);
    expect(result.winMultiplier).toBe(300);
    expect(result.rewardCoins).toBe(300);
  });

  it('same tier scales reward with coinCost', () => {
    const tiersConfig = {
      ...CONFIG,
      winProbability: 1,
      winMultiplierTiers: [{ payoutPercent: 105, weight: 1 }],
    };
    expect(runLuckyDraw(tiersConfig, 1000, () => 0).rewardCoins).toBe(1050);
    expect(runLuckyDraw(tiersConfig, 2999, () => 0).rewardCoins).toBe(3149);
  });

  it('different tiers yield different payouts at the same stake', () => {
    const tiersConfig = {
      ...CONFIG,
      winProbability: 1,
      winMultiplierTiers: [
        { payoutPercent: 40, weight: 1 },
        { payoutPercent: 520, weight: 1 },
      ],
    };
    const low = runLuckyDraw(tiersConfig, 100, () => 0);
    const high = runLuckyDraw(tiersConfig, 100, () => 0.6);
    expect(low.rewardCoins).toBe(40);
    expect(high.rewardCoins).toBe(520);
    expect(low.winMultiplier).toBe(40);
    expect(high.winMultiplier).toBe(520);
  });

  it('loses when rng >= winProbability (boundary)', () => {
    const result = runLuckyDraw(CONFIG, 100, () => 0.2);
    expect(result.isWin).toBe(false);
    expect(result.winMultiplier).toBe(0);
    expect(result.rewardCoins).toBe(0);
  });

  it('rounds stake-based reward to whole coins', () => {
    const result = runLuckyDraw(
      {
        ...CONFIG,
        winMultiplierTiers: [{ payoutPercent: 37.6, weight: 1 }],
      },
      25,
      () => 0,
    );
    expect(result.rewardCoins).toBe(9);
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
      { payoutPercent: 40, weight: 1 },
      { payoutPercent: 520, weight: 1 },
    ];
    const seen = new Set<number>();
    let seed = 7;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 200; i++) {
      seen.add(pickWinTier(tiers, lcg).payoutPercent);
    }
    expect(seen.has(40)).toBe(true);
    expect(seen.has(520)).toBe(true);
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
    expect(normalizeWinMultiplierTiers([], 3)).toEqual([{ payoutPercent: 3, weight: 1 }]);
  });

  it('parses legacy rewardCoins rows as payoutPercent', () => {
    expect(
      normalizeWinMultiplierTiers([{ rewardCoins: 220, weight: 1 } as never]),
    ).toEqual([{ payoutPercent: 220, weight: 1 }]);
  });

  it('computes weighted averages', () => {
    const tiers = [
      { payoutPercent: 100, weight: 1 },
      { payoutPercent: 200, weight: 1 },
    ];
    expect(averagePayoutPercent(tiers)).toBe(150);
    expect(averageRewardCoins(tiers)).toBe(150);
  });
});

describe('rewardCoinsForTier', () => {
  it('computes rounded stake payout', () => {
    expect(rewardCoinsForTier({ payoutPercent: 220, weight: 1 }, 100)).toBe(220);
  });
});

describe('expectedReturn / totalPayoutRatio', () => {
  it('TRP = probability × avg payout % / 100', () => {
    expect(expectedReturn(CONFIG)).toBeCloseTo(0.6);
  });

  it('total payout adds the receiver cut', () => {
    expect(totalPayoutRatio(CONFIG)).toBeCloseTo(0.615);
  });

  it('default house-favored tiers stay below 100% TRP at 98% win rate', () => {
    const config = {
      winProbability: 0.98,
      winMultiplierTiers: [
        { payoutPercent: 40, weight: 30 },
        { payoutPercent: 88, weight: 25 },
        { payoutPercent: 95, weight: 20 },
        { payoutPercent: 105, weight: 12 },
        { payoutPercent: 220, weight: 6 },
        { payoutPercent: 350, weight: 3 },
        { payoutPercent: 520, weight: 1 },
      ],
      receiverBenefitPercent: 1.5,
    };
    expect(expectedReturn(config)).toBeLessThan(1);
    expect(totalPayoutRatio(config)).toBeLessThan(1);
  });
});
