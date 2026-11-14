// Terminal styling. Colour only when stdout is a terminal and NO_COLOR isn't set.

const useColor = () => !!process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

const style = (code: string) => (s: string) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);

export const dim = style('2');
export const bold = style('1');
/** Uncola's orange (#E67E22) where the terminal supports 24-bit colour, else plain yellow. */
export const orange = (s: string) =>
  style(/truecolor|24bit/i.test(process.env.COLORTERM ?? '') ? '38;2;230;126;34' : '33')(s);

/** Terminal width, or a sensible width when output is piped. */
export function termWidth(): number {
  return process.stdout.columns || 100;
}

/**
 * Text from the server without terminal control characters (escape sequences, carriage returns,
 * bidirectional overrides), which could otherwise rewrite what a prompt shows. Keeps newlines and tabs.
 */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '');
}

/** The text without colour codes. */
export function stripColor(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Visible length, ignoring colour codes. */
export function visibleLength(s: string): number {
  return [...stripColor(s)].length;
}

/** Cuts plain text to `max` characters, ending in an ellipsis. */
export function truncate(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return max <= 1 ? chars.slice(0, max).join('') : chars.slice(0, max - 1).join('').trimEnd() + '…';
}

/** The first line of some text, with whitespace collapsed. */
export function firstLine(text: unknown): string {
  return typeof text === 'string' ? (text.split('\n').find((l) => l.trim()) ?? '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * "━━━━━━━━━━" for a percentage: orange up to the percentage, dim after it. Thin bars keep
 * a gap between rows, where full blocks would merge into one shape.
 */
export function progressBar(percent: number, width = 10): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  // Without colour, the empty part needs a different character to be visible.
  return orange('━'.repeat(filled)) + dim((process.stdout.isTTY && !process.env.NO_COLOR ? '━' : '─').repeat(width - filled));
}

/** A 24-bit colour like "#5BD6A0" where the terminal supports it, else the nearest basic colour code. */
export function rgb(hex: string, basic: string): (s: string) => string {
  if (!/truecolor|24bit/i.test(process.env.COLORTERM ?? '')) return style(basic);
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return style(`38;2;${r};${g};${b}`);
}

/** The colour `t` (0–1) of the way from hex colour `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const ch = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [ch(a), ch(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('');
}
