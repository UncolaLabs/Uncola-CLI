import { apiJson } from '../api.ts';
import type { Environment } from '../config.ts';
import { parseDue, parseWhen, toDay } from '../dates.ts';
import { createEntry, parseVisibility, quickTitle, resolveCompany, updateEntry, type WriteOptions } from '../entries.ts';
import { CliError } from '../errors.ts';
import { resolveItem, saveLastList, shortId, titleOf, type FeedItem } from '../feed.ts';
import { merge, readInput } from '../input.ts';
import { emit, type OutputOptions } from '../output.ts';
import { lastColumnWidth, table } from '../table.ts';
import { dim, progressBar, termWidth } from '../term.ts';
import { titleCell } from './feed.ts';
import { joinWords, type Words } from './log.ts';

export interface Goal {
  itemId: string;
  title: string;
  description?: string;
  progress?: number;
  /** Usually YYYY-MM-DD, but goals made elsewhere may store other shapes; read it with toDay(). */
  dueDate?: unknown;
  status?: string;
  visibility?: string;
  timestamp: number;
}

export interface GoalListOptions extends OutputOptions {
  ids?: boolean;
  body?: boolean;
}

export async function fetchGoals(env: Environment): Promise<{ goals: Goal[]; hasMore?: boolean }> {
  const res = await apiJson<{ goals: Goal[]; hasMore?: boolean }>(env, '/career-feed/goals');
  // Goals without a due date go last.
  const due = (g: Goal) => toDay(g.dueDate) ?? '9999';
  return { ...res, goals: [...(res.goals ?? [])].sort((a, b) => due(a).localeCompare(due(b))) };
}

export async function goalList(env: Environment, opts: GoalListOptions): Promise<void> {
  const res = await fetchGoals(env);
  const goals = res.goals;
  if (!opts.json) await saveLastList(env, goals.map((g) => ({ ...g, type: 'goal' }) as FeedItem));
  emit(
    opts,
    goals.map((g) => ({ id: g.itemId, ...g })),
    goals.length
      ? goalTable(goals, opts) + (res.hasMore ? '\n(more goals exist than the API returned)' : '') + `\n\n${dim(referenceHint(goals))}`
      : 'No goals yet. Add one with: uncola log goal <title>',
  );
}

export function goalTable(goals: Goal[], opts: { ids?: boolean; body?: boolean } = {}): string {
  const headers = ['#', ...(opts.ids ? ['ID'] : []), 'PROGRESS', 'DUE', 'TITLE'];
  const rows = goals.map((g, n) => [
    String(n + 1),
    ...(opts.ids ? [shortId(g.itemId)] : []),
    `${progressBar(Number(g.progress ?? 0))} ${String(g.progress ?? 0).padStart(3)}%${g.status === 'completed' ? ` ${dim('completed')}` : ''}`,
    toDay(g.dueDate) ?? '-',
    '',
  ]);
  const width = lastColumnWidth(headers, rows, termWidth());
  goals.forEach((g, n) => (rows[n]![rows[n]!.length - 1] = titleCell({ ...g, type: 'goal' } as FeedItem, width, opts.body !== false)));
  return table(headers, rows);
}

/** Shows how to refer to a goal, using a row number and a title word no other goal contains. */
export function referenceHint(goals: Goal[]): string {
  const titles = goals.map((g) => titleOf(g as FeedItem).toLowerCase());
  for (const goal of goals) {
    const word = titleOf(goal as FeedItem)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .find((w) => w.length >= 4 && titles.filter((t) => t.includes(w)).length === 1);
    if (word) return `Refer to a goal by its # or part of its title, e.g. --goal 1 or --goal ${word}.`;
  }
  return 'Refer to a goal by its # or part of its title, e.g. --goal 1.';
}

export interface GoalAddOptions extends WriteOptions {
  desc?: string;
  due?: string;
  progress?: string;
  date?: string;
  company?: string;
  visibility?: string;
  public?: boolean;
  input?: string;
}

export async function goalAdd(env: Environment, words: Words, flags: GoalAddOptions): Promise<void> {
  const o = merge(await readInput(flags.input), { ...flags, title: joinWords(words) });
  const { title, description } = quickTitle(o.title, o.desc);
  await createEntry(
    env,
    'goal',
    {
      ...(await resolveCompany(env, o.company)),
      title,
      description,
      dueDate: o.due ? parseDue(String(o.due)) : null,
      activities: [],
      progress: parseProgress(o.progress ?? 0),
      visibility: parseVisibility(o.visibility, o.public),
    },
    parseWhen(o.date as string | undefined),
    flags,
  );
}

export async function goalProgress(env: Environment, ref: string, percent: string, opts: WriteOptions): Promise<void> {
  const progress = parseProgress(percent);
  const goal = await resolveItem(env, ref, 'goal');
  // The API's PUT replaces the editable fields, so send them all back.
  const body = {
    title: goal.title,
    description: goal.description ?? '',
    dueDate: goal.dueDate ?? null,
    activities: goal.activities ?? [],
    progress,
    visibility: goal.visibility ?? 'Private',
    companyId: goal.companyId ?? null,
    companyName: goal.companyName ?? null,
    // The app shows a goal as Completed only by its status, so 100% completes it and less reopens it.
    status: progress === 100 ? 'completed' : 'in_progress',
  };
  const done = progress === 100 ? '  completed' : '';
  await updateEntry(env, goal, body, opts, `✓ ${titleOf(goal)}: ${goal.progress ?? 0}% → ${progress}%  ${progressBar(progress)}${done}`);
}

export function parseProgress(v: unknown): number {
  const n = Number(String(v).replace(/%$/, ''));
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new CliError(`Progress must be a whole number from 0 to 100, got "${v}".`, 'usage', 2);
  return n;
}
