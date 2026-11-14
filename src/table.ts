import { visibleLength } from './term.ts';

/** Renders rows as aligned columns; the last column isn't padded. Cells may contain colour codes. */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => visibleLength(r[i] ?? ''))));
  const pad = (c: string, w: number) => c + ' '.repeat(Math.max(0, w - visibleLength(c)));
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : pad(c, widths[i]!))).join('  ').trimEnd();
  return [line(headers), ...rows.map(line)].join('\n');
}

/** How much room the last column gets so each row fits in `total` characters. */
export function lastColumnWidth(headers: string[], rows: string[][], total: number): number {
  const widths = headers.slice(0, -1).map((h, i) => Math.max(h.length, ...rows.map((r) => visibleLength(r[i] ?? ''))));
  return Math.max(20, total - widths.reduce((a, w) => a + w + 2, 0));
}
