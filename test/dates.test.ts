import { describe, expect, it } from 'vitest';
import { formatActionDue, parseDue, parseHours, parseSince, parseWhen } from '../src/dates.ts';

describe('parseWhen', () => {
  const now = new Date('2026-10-19T15:30:00Z');
  it('defaults to now', () => {
    expect(parseWhen(undefined, now)).toEqual({ timestamp: now.getTime(), dateOnly: false });
  });
  it('stores day-only dates at 12:00 UTC like the web app', () => {
    expect(parseWhen('2026-10-19', now)).toEqual({ timestamp: Date.UTC(2026, 9, 19, 12), dateOnly: true });
  });
  it('accepts ISO date-times exactly', () => {
    expect(parseWhen('2026-10-19T09:15:00Z', now)).toEqual({ timestamp: Date.UTC(2026, 9, 19, 9, 15), dateOnly: false });
  });
  it('rejects nonsense and impossible days', () => {
    expect(() => parseWhen('last tuesday', now)).toThrow(/Invalid date/);
    expect(() => parseWhen('2026-02-30', now)).toThrow(/Invalid date/);
  });
});

describe('other parsers', () => {
  it('parses durations into hours', () => {
    expect(parseHours('6h')).toBe('6');
    expect(parseHours('90m')).toBe('1.5');
    expect(parseHours('2h30m')).toBe('2.5');
    expect(parseHours('3')).toBe('3');
    expect(() => parseHours('soon')).toThrow(/Invalid time/);
  });
  it('formats 1:1 action due dates like the app', () => {
    expect(formatActionDue('2026-10-20')).toBe('Oct 20, 2026');
  });
  it('validates goal due dates', () => {
    expect(parseDue('2026-12-31')).toBe('2026-12-31');
    expect(() => parseDue('Dec 31')).toThrow();
  });
  it('parses --since', () => {
    const now = Date.UTC(2026, 9, 19);
    expect(parseSince('7d', now)).toBe(now - 7 * 86_400_000);
    expect(parseSince('2026-10-01', now)).toBe(Date.UTC(2026, 9, 1));
    expect(() => parseSince('lately', now)).toThrow();
  });
});
