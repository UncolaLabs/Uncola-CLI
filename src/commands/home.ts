import type { Environment } from '../config.ts';
import { loadSession } from '../credentials.ts';
import { toDay } from '../dates.ts';
import { fetchFeed, saveLastList, titleOf } from '../feed.ts';
import { emit, type OutputOptions } from '../output.ts';
import { bold, dim, orange, progressBar, termWidth, truncate } from '../term.ts';
import { feedTable } from './feed.ts';
import { fetchGoals } from './goal.ts';

const LOGO = [
  '██╗   ██╗███╗   ██╗ ██████╗ ██████╗ ██╗      █████╗ ',
  '██║   ██║████╗  ██║██╔════╝██╔═══██╗██║     ██╔══██╗',
  '██║   ██║██╔██╗ ██║██║     ██║   ██║██║     ███████║',
  '██║   ██║██║╚██╗██║██║     ██║   ██║██║     ██╔══██║',
  '╚██████╔╝██║ ╚████║╚██████╗╚██████╔╝███████╗██║  ██║',
  ' ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝',
];

/** The logo, with a one-word fallback for narrow terminals. */
export function banner(version: string, env: Environment, email: string | undefined): string {
  const who = email ? `signed in as ${email}` : 'not signed in';
  const tagline = dim(`Uncola your career · v${version} · ${env.name} · ${who}`);
  if (termWidth() < LOGO[0]!.length + 2) return `${orange(bold('UNCOLA'))}\n${tagline}`;
  return `${LOGO.map((l) => orange(l)).join('\n')}\n${tagline}`;
}

/** The commands people use most, in the bots' words. `prefix` is "uncola " outside the shell. */
export function shortHelp(prefix = ''): string {
  const rows: [string, string][] = [
    ['log <type> <text>', 'save an entry in one line, e.g. log win Shipped the CLI'],
    ['<type>', 'add one step by step, e.g. achievement'],
    ['feed [type]', 'your recent entries (also: list)'],
    ['show <# or title>', 'one entry in full (also: get)'],
    ['goal list', 'goals with progress · goal progress <goal> <percent>'],
    ['edit <#>', 'change an entry, e.g. edit 2 --title "New title"'],
    ['delete <#>', 'delete an entry (also: rm)'],
    ['brag <#>', 'share an entry publicly, with its card'],
    ['recap', 'your highlights as a card'],
    ['home', 'this dashboard'],
    ['login · logout · status', 'your Uncola account'],
    ['help', 'every command, with its options'],
  ];
  const width = Math.max(...rows.map(([c]) => c.length)) + prefix.length;
  return [
    bold('Commands'),
    ...rows.map(([c, d]) => `  ${(prefix + c).padEnd(width)}  ${dim(d)}`),
    '',
    `${bold('Types')}  goal · activity (act) · achievement (ach, win) · 1on1 (1:1, meeting)`,
  ].join('\n');
}

export interface HomeOptions extends OutputOptions {
  /** Set by the shell, which shows help without the "uncola " prefix. */
  inRepl?: boolean;
}

/** `home`: the banner, the latest entries and goal progress, like the bots' dashboard. */
export async function home(env: Environment, version: string, opts: HomeOptions): Promise<void> {
  const session = await loadSession(env.name).catch(() => undefined);
  const parts = [banner(version, env, session?.email)];
  const prefix = opts.inRepl ? '' : 'uncola ';
  if (!session) {
    emit(opts, { env: env.name, loggedIn: false }, [...parts, '', `Sign in first: ${prefix}login`, '', shortHelp(prefix)].join('\n'));
    return;
  }

  const [{ goals }, recent] = await Promise.all([fetchGoals(env), fetchFeed(env, 50)]);
  const latest = recent.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  if (!opts.json) await saveLastList(env, latest);

  parts.push('', bold('Feed latest'));
  parts.push(latest.length ? feedTable(latest, {}, termWidth() - 2).replace(/\n\n.*$/s, '').replace(/^/gm, '  ') : `  Nothing yet. Try: ${prefix}log win <what you did>`);
  const titleWidth = Math.max(20, termWidth() - 36);
  if (goals.length) {
    parts.push('', bold('Goals'));
    for (const g of goals.slice(0, 5)) {
      const due = toDay(g.dueDate) ?? '';
      parts.push(`  ${progressBar(Number(g.progress ?? 0))} ${String(g.progress ?? 0).padStart(3)}%  ${dim((due ? `due ${due}` : '').padEnd(14))}  ${truncate(titleOf(g as never), titleWidth)}`);
    }
    if (goals.length > 5) parts.push(dim(`  …and ${goals.length - 5} more: ${prefix}goal list`));
  }
  parts.push('', shortHelp(prefix));
  emit(opts, { env: env.name, loggedIn: true, email: session.email ?? null, goals, latest }, parts.join('\n'));
}
