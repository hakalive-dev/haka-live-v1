export interface CsvColumn<T> { header: string; value: (row: T) => string | number | null | undefined }

export function exportToCsv<T>(rows: T[], columns: CsvColumn<T>[], filename: string): void {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(c => esc(c.header)).join(',');
  const body = rows.map(r => columns.map(c => esc(c.value(r))).join(',')).join('\n');
  const blob = new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
