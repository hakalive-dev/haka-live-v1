import { rewardForRank, parseTiers, type RankingRewardTier } from './ranking-rewards.service';

const TIERS: RankingRewardTier[] = [
  { rankMin: 1, rankMax: 1, amount: 10_000 },
  { rankMin: 2, rankMax: 3, amount: 5_000 },
  { rankMin: 4, rankMax: 10, amount: 1_000 },
];

describe('rewardForRank', () => {
  it('returns the tier amount for a covered rank', () => {
    expect(rewardForRank(1, TIERS)).toBe(10_000);
    expect(rewardForRank(2, TIERS)).toBe(5_000);
    expect(rewardForRank(3, TIERS)).toBe(5_000);
    expect(rewardForRank(10, TIERS)).toBe(1_000);
  });

  it('returns 0 for ranks no tier covers', () => {
    expect(rewardForRank(11, TIERS)).toBe(0);
    expect(rewardForRank(0, TIERS)).toBe(0);
  });

  it('floors fractional amounts and never goes negative', () => {
    expect(rewardForRank(1, [{ rankMin: 1, rankMax: 1, amount: 99.9 }])).toBe(99);
    expect(rewardForRank(1, [{ rankMin: 1, rankMax: 1, amount: -50 }])).toBe(0);
  });
});

describe('parseTiers', () => {
  it('passes through well-formed tiers', () => {
    expect(parseTiers(TIERS)).toEqual(TIERS);
  });

  it('drops malformed entries and non-arrays', () => {
    expect(parseTiers(null)).toEqual([]);
    expect(parseTiers('nope')).toEqual([]);
    expect(
      parseTiers([
        { rankMin: 1, rankMax: 1, amount: 100 },
        { rankMin: 'x', rankMax: 2, amount: 50 }, // malformed
        { rankMin: 3, amount: 50 }, // missing rankMax
        null,
      ]),
    ).toEqual([{ rankMin: 1, rankMax: 1, amount: 100 }]);
  });

  it('rejects string-valued fields (strict — config drives real payouts)', () => {
    expect(parseTiers([{ rankMin: '1', rankMax: '2', amount: '500' }])).toEqual([]);
  });
});
