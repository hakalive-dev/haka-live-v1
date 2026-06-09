/**
 * API stores commission rates as decimals (0.04 = 4%). Some fixtures use whole percents (15.00).
 * Normalize for display with a trailing % in the UI.
 */
export function formatCommissionRatePercent(rate: string | undefined | null): string {
  if (rate == null || rate === "") return "0.00";
  const n = Number.parseFloat(rate);
  if (!Number.isFinite(n)) return rate;
  if (n > 0 && n <= 1) return (n * 100).toFixed(2);
  return n.toFixed(2);
}
