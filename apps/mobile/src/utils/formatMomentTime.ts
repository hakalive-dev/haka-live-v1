function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

/**
 * Moment post footer time: minutes/hours on the same local day,
 * calendar date once it is a previous day.
 */
export function formatMomentPostTime(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const now = new Date();
  if (!isSameLocalDay(then, now)) {
    return then.toLocaleDateString();
  }

  const diffSec = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 60) return '1 min ago';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins} min ago`;
  }
  const hours = Math.floor(diffSec / 3600);
  return `${hours} hour ago`;
}
