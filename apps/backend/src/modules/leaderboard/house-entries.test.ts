import { mergeAndRank, mergeStateTotals, houseIncomeByState } from './house-entries.service';

describe('mergeAndRank', () => {
  const real = [
    { userId: 'r1', score: 900 },
    { userId: 'r2', score: 500 },
    { userId: 'r3', score: 100 },
  ];

  it('ranks house entries by their income alongside real entries', () => {
    const { entries, houseIds } = mergeAndRank(real, [{ userId: 'h1', income: 1000 }], 10);
    expect(entries.map((e) => e.userId)).toEqual(['h1', 'r1', 'r2', 'r3']);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    expect(entries[0].isHouse).toBe(true);
    expect(entries[1].isHouse).toBe(false);
    expect(houseIds.has('h1')).toBe(true);
  });

  it('pushes real users down — a real #1 becomes #2 behind a house entry', () => {
    const { entries } = mergeAndRank(real, [{ userId: 'h1', income: 1000 }], 10);
    const r1 = entries.find((e) => e.userId === 'r1');
    expect(r1?.rank).toBe(2); // was the top real user; now behind the house entry
  });

  it('never lowers a real account that is itself a house entry (uses max of income/real)', () => {
    // r1 has real 900 but is seeded at only 50 — keep 900, and mark it house.
    const { entries } = mergeAndRank(real, [{ userId: 'r1', income: 50 }], 10);
    const r1 = entries.find((e) => e.userId === 'r1');
    expect(r1?.score).toBe(900);
    expect(r1?.isHouse).toBe(true);
  });

  it('respects the limit', () => {
    const { entries } = mergeAndRank(real, [{ userId: 'h1', income: 1000 }], 2);
    expect(entries.map((e) => e.userId)).toEqual(['h1', 'r1']);
  });

  it('flags every house id so settlement can skip them', () => {
    const { houseIds } = mergeAndRank(real, [
      { userId: 'h1', income: 1000 },
      { userId: 'h2', income: 800 },
    ], 10);
    expect([...houseIds].sort()).toEqual(['h1', 'h2']);
  });
});

describe('houseIncomeByState', () => {
  it('sums incomes per state', () => {
    const map = houseIncomeByState([
      { income: 100, stateCode: 'MH' },
      { income: 50, stateCode: 'MH' },
      { income: 200, stateCode: 'DL' },
    ]);
    expect(map.get('MH')).toBe(150);
    expect(map.get('DL')).toBe(200);
  });
});

describe('mergeStateTotals', () => {
  const real = [
    { stateCode: 'MH', score: 1000 },
    { stateCode: 'DL', score: 400 },
  ];

  it('adds house income to a state total and re-sorts', () => {
    // DL gets +900 → overtakes MH.
    const merged = mergeStateTotals(real, new Map([['DL', 900]]));
    expect(merged.map((s) => s.stateCode)).toEqual(['DL', 'MH']);
    expect(merged.find((s) => s.stateCode === 'DL')?.score).toBe(1300);
  });

  it('introduces a state that had no real activity', () => {
    const merged = mergeStateTotals(real, new Map([['KA', 5000]]));
    expect(merged[0]).toEqual({ stateCode: 'KA', score: 5000 });
  });
});
