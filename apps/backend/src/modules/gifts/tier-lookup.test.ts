import { resolveTier, clearTierCache } from './tier-lookup';

beforeEach(() => {
  clearTierCache();                               // force a fresh DB read per test
});

describe('resolveTier (real DB)', () => {
  it('picks A at exactly zero income', async () => {
    const t = await resolveTier(0n);
    expect(t.name).toBe('A');
    expect(t.commissionRate).toBe(0.04);
  });

  it('picks A below 2,000,000 rolling turnover', async () => {
    expect((await resolveTier(1n)).name).toBe('A');
    expect((await resolveTier(1_999_999n)).name).toBe('A');
  });

  it('picks B at 2,000,000 through 9,999,999', async () => {
    expect((await resolveTier(2_000_000n)).name).toBe('B');
    expect((await resolveTier(9_999_999n)).name).toBe('B');
  });

  it('picks C at 10,000,000 through 49,999,999', async () => {
    expect((await resolveTier(10_000_000n)).name).toBe('C');
    expect((await resolveTier(49_999_999n)).name).toBe('C');
  });

  it('picks D at 50,000,000 through 149,999,999', async () => {
    expect((await resolveTier(49_999_999n)).name).toBe('C');
    expect((await resolveTier(50_000_000n)).name).toBe('D');
    expect((await resolveTier(149_999_999n)).name).toBe('D');
  });

  it('picks E at 150,000,000 and above', async () => {
    expect((await resolveTier(150_000_000n)).name).toBe('E');
    expect((await resolveTier(999_999_999n)).name).toBe('E');
  });
});
