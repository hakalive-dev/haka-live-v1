import { periodWindow, growthPct } from './staff-metrics';

describe('staff-metrics pure helpers', () => {
  it('periodWindow("month") returns current + previous month bounds', () => {
    const at = new Date('2026-05-27T10:00:00.000Z');
    const w = periodWindow('month', at);
    expect(w.start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(w.prevStart.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(w.prevEnd.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('periodWindow("week") returns Monday-based current + previous week', () => {
    // 2026-05-27 is a Wednesday → week starts Mon 2026-05-25.
    const at = new Date('2026-05-27T10:00:00.000Z');
    const w = periodWindow('week', at);
    expect(w.start.toISOString()).toBe('2026-05-25T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(w.prevStart.toISOString()).toBe('2026-05-18T00:00:00.000Z');
    expect(w.prevEnd.toISOString()).toBe('2026-05-25T00:00:00.000Z');
  });

  it('growthPct computes percentage change, 0 prev → null', () => {
    expect(growthPct(120n, 100n)).toBe(20);
    expect(growthPct(80n, 100n)).toBe(-20);
    expect(growthPct(50n, 0n)).toBeNull();
  });
});
