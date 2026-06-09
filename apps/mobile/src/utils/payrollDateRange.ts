export type PayrollDatePreset = '7d' | '30d' | '90d' | 'custom';

export type PayrollDateRange = {
  preset: PayrollDatePreset;
  from: string;
  to: string;
  label: string;
};

const PRESET_LABELS: Record<Exclude<PayrollDatePreset, 'custom'>, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export function resolvePayrollRange(
  preset: PayrollDatePreset,
  customFrom?: Date,
  customTo?: Date,
): PayrollDateRange {
  const to = endOfDay(new Date());

  if (preset === 'custom' && customFrom && customTo) {
    const from = startOfDay(customFrom);
    const toCustom = endOfDay(customTo);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return {
      preset: 'custom',
      from: from.toISOString(),
      to: toCustom.toISOString(),
      label: `${fmt(from)} – ${fmt(toCustom)}`,
    };
  }

  const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
  const from = daysAgo(days);
  return {
    preset: preset === 'custom' ? '30d' : preset,
    from: from.toISOString(),
    to: to.toISOString(),
    label: PRESET_LABELS[preset === 'custom' ? '30d' : preset],
  };
}

export const PAYROLL_PRESET_OPTIONS: { key: Exclude<PayrollDatePreset, 'custom'>; label: string }[] = [
  { key: '7d', label: PRESET_LABELS['7d'] },
  { key: '30d', label: PRESET_LABELS['30d'] },
  { key: '90d', label: PRESET_LABELS['90d'] },
];

/** Selectable calendar days for custom range (no native date picker required). */
export function payrollDayOptions(dayCount = 90): { label: string; date: Date }[] {
  const out: { label: string; date: Date }[] = [];
  const today = startOfDay(new Date());
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const day = startOfDay(d);
    out.push({
      label: day.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      date: day,
    });
  }
  return out;
}
