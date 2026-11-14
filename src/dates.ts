import { CliError } from './errors.ts';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface When {
  /** Epoch ms. The API keys items on (userId, timestamp), so this must be unique per user. */
  timestamp: number;
  /** True when only a day was given; the web app stores those at 12:00 UTC, which is clash-prone. */
  dateOnly: boolean;
}

function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayAtNoonUtc(day: string): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new CliError(`Invalid date "${day}". Use YYYY-MM-DD.`, 'usage', 2);
  const t = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, 12);
  if (new Date(t).getUTCDate() !== +m[3]!) throw new CliError(`Invalid date "${day}".`, 'usage', 2);
  return t;
}

/**
 * --date: when it happened. Defaults to now. Accepts YYYY-MM-DD, today, yesterday or an ISO
 * date-time. Like the Slack and Teams forms, it can't be later than now.
 */
export function parseWhen(input: string | undefined, now = new Date()): When {
  if (!input || input === 'now') return { timestamp: now.getTime(), dateOnly: false };
  const day =
    input === 'today' ? localDay(now) : input === 'yesterday' ? localDay(new Date(now.getTime() - 86_400_000)) : DAY_RE.test(input) ? input : undefined;
  if (day) {
    const timestamp = dayAtNoonUtc(day);
    if (day > localDay(now)) throw new CliError(`The date ${day} is in the future; entries record what already happened.`, 'usage', 2);
    // East of UTC, 12:00 UTC today can still be ahead of the clock.
    return timestamp > now.getTime() ? { timestamp: now.getTime(), dateOnly: false } : { timestamp, dateOnly: true };
  }
  const t = Date.parse(input);
  if (Number.isNaN(t)) throw new CliError(`Invalid date "${input}". Use YYYY-MM-DD or an ISO date-time.`, 'usage', 2);
  if (t > now.getTime() + 60_000) throw new CliError(`The date ${input} is in the future; entries record what already happened.`, 'usage', 2);
  return { timestamp: t, dateOnly: false };
}

/** --due for goals: YYYY-MM-DD, which is what the API stores. */
export function parseDue(input: string): string {
  dayAtNoonUtc(input); // validates
  return input;
}

/** 1:1 action items store their due date as "Oct 16, 2026". */
export function formatActionDue(day: string): string {
  return new Date(dayAtNoonUtc(day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** --time: "6h", "90m", "2h30m" or a bare number of hours → hours as the string the API stores. */
export function parseHours(input: string): string {
  const s = input.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return String(Number(s));
  const m = /^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+)m)?$/.exec(s);
  if (!m || (!m[1] && !m[2])) throw new CliError(`Invalid time "${input}". Use e.g. 6h, 90m or 2h30m.`, 'usage', 2);
  const hours = Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60;
  return String(Math.round(hours * 100) / 100);
}

/** --since: "7d", "24h", "2w" or YYYY-MM-DD → epoch ms. */
export function parseSince(input: string, now = Date.now()): number {
  const m = /^(\d+)([hdw])$/.exec(input.trim());
  if (m) return now - Number(m[1]) * { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2] as 'h' | 'd' | 'w'];
  if (DAY_RE.test(input)) return Date.UTC(+input.slice(0, 4), +input.slice(5, 7) - 1, +input.slice(8, 10));
  throw new CliError(`Invalid --since "${input}". Use e.g. 7d, 24h, 2w or YYYY-MM-DD.`, 'usage', 2);
}

/**
 * Any date the API sends → YYYY-MM-DD. Entries made in the web app, Slack or Teams don't all
 * store dates the same way: day strings, ISO strings, epoch ms or seconds, or {seconds} objects.
 */
export function toDay(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    if (/^\d+$/.test(value)) return toDay(Number(value));
    const t = Date.parse(value);
    return Number.isNaN(t) ? value : new Date(t).toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e11 ? value * 1000 : value).toISOString().slice(0, 10);
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return toDay(o.seconds ?? o._seconds ?? o.$date ?? o.value);
  }
  return undefined;
}

export function formatDay(timestamp: unknown): string {
  return toDay(timestamp) ?? '';
}
