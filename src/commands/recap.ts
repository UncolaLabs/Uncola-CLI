import type { Environment } from '../config.ts';
import { loadSession } from '../credentials.ts';
import { formatDay, parseSince, toDay } from '../dates.ts';
import { fetchFeed, titleOf, type FeedItem } from '../feed.ts';
import { emit, type OutputOptions } from '../output.ts';
import { bold, dim, orange, progressBar, termWidth, truncate, visibleLength } from '../term.ts';
import { fetchGoals, type Goal } from './goal.ts';

export interface RecapOptions extends OutputOptions {
  since?: string;
}

export interface Recap {
  from: string;
  to: string;
  email: string | null;
  counts: { achievements: number; activities: number; oneOnOnes: number; goals: number };
  hoursLogged: number;
  endorsements: number;
  achievements: { title: string; date: string }[];
  goals: { title: string; progress: number; due: string | null }[];
  topSkills: string[];
}

/** `recap`: your highlights over a period, drawn as a card. */
export async function recap(env: Environment, opts: RecapOptions): Promise<void> {
  const since = parseSince(opts.since ?? '90d');
  const [items, { goals }, session] = await Promise.all([fetchFeed(env), fetchGoals(env), loadSession(env.name).catch(() => undefined)]);
  const data = summarize(items, goals, since, Date.now(), session?.email);
  emit(opts, data, recapCard(data));
}

export function summarize(items: FeedItem[], goals: Goal[], since: number, now: number, email?: string): Recap {
  const inRange = items.filter((i) => i.timestamp >= since && i.timestamp <= now);
  const of = (type: FeedItem['type']) => inRange.filter((i) => i.type === type).sort((a, b) => b.timestamp - a.timestamp);
  const achievements = of('achievement');
  const activities = of('activity');

  const skills = new Map<string, number>();
  for (const i of [...achievements, ...activities]) {
    for (const s of Array.isArray(i.skills) ? i.skills : []) if (typeof s === 'string' && s.trim()) skills.set(s.trim(), (skills.get(s.trim()) ?? 0) + 1);
  }
  const hours = activities.reduce((sum, a) => sum + (Number.parseFloat(String(a.timeSpent ?? '')) || 0), 0);

  return {
    from: formatDay(since),
    to: formatDay(now),
    email: email ?? null,
    counts: { achievements: achievements.length, activities: activities.length, oneOnOnes: of('1on1').length, goals: goals.length },
    hoursLogged: Math.round(hours * 10) / 10,
    endorsements: achievements.reduce((n, a) => n + (Array.isArray(a.endorsements) ? a.endorsements.length : 0), 0),
    achievements: achievements.map((a) => ({ title: titleOf(a), date: formatDay(a.timestamp) })),
    goals: goals
      .filter((g) => g.status !== 'abandoned')
      .sort((a, b) => Number(b.progress ?? 0) - Number(a.progress ?? 0))
      .map((g) => ({ title: titleOf(g as unknown as FeedItem), progress: Number(g.progress ?? 0), due: toDay(g.dueDate) ?? null })),
    topSkills: [...skills.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([s]) => s),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function recapCard(b: Recap, width = Math.min(76, termWidth())): string {
  const inner = width - 4;
  const line = (s = '') => `${orange('│')} ${s}${' '.repeat(Math.max(0, inner - visibleLength(s)))} ${orange('│')}`;
  const rule = (l: string, r: string) => orange(l + '─'.repeat(width - 2) + r);
  const stats = [
    plural(b.counts.achievements, 'win'),
    plural(b.counts.activities, 'activity', 'activities'),
    ...(b.hoursLogged ? [`${b.hoursLogged} h logged`] : []),
    plural(b.counts.oneOnOnes, '1:1'),
    ...(b.endorsements ? [plural(b.endorsements, 'endorsement')] : []),
  ];
  // Wrap the stats onto as many lines as the card's width needs.
  const statLines: string[][] = [[]];
  for (const stat of stats) {
    const current = statLines.at(-1)!;
    if (current.length && [...[...current, stat].join(' · ')].length > inner) statLines.push([stat]);
    else current.push(stat);
  }

  const out = [
    rule('╭', '╮'),
    line(`${orange('★')} ${bold('RECAP')}${b.email ? dim(`  ${truncate(b.email, inner - 9)}`) : ''}`),
    line(dim(`${b.from} → ${b.to}`)),
    rule('├', '┤'),
    ...statLines.map((l) => line(l.join(dim(' · ')))),
  ];
  if (b.achievements.length) {
    out.push(line(), line(bold('WINS')));
    for (const a of b.achievements.slice(0, 6)) {
      const title = truncate(a.title, inner - 14);
      out.push(line(`${orange('★')} ${title}${' '.repeat(inner - 12 - [...title].length)}${dim(a.date)}`));
    }
    if (b.achievements.length > 6) out.push(line(dim(`  …and ${b.achievements.length - 6} more`)));
  }
  if (b.goals.length) {
    out.push(line(), line(bold('GOALS')));
    for (const g of b.goals.slice(0, 5)) out.push(line(`${progressBar(g.progress)} ${String(g.progress).padStart(3)}%  ${truncate(g.title, inner - 18)}`));
  }
  if (b.topSkills.length) out.push(line(), line(`${bold('SKILLS')}  ${truncate(b.topSkills.join(' · '), inner - 8)}`));
  if (!b.achievements.length && !b.counts.activities) out.push(line(), line(dim('Nothing logged in this period yet. Try: log win <what you did>')));
  out.push(rule('╰', '╯'));
  return out.join('\n');
}
