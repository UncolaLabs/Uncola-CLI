import type { Environment } from '../config.ts';
import { formatActionDue, parseHours, parseWhen } from '../dates.ts';
import { createEntry, goalNote, parseVisibility, quickTitle, requireText, resolveCompany, resolveGoal, type WriteOptions } from '../entries.ts';
import { CliError } from '../errors.ts';
import { asList, asRepeatable, merge, readInput } from '../input.ts';

/** Typed words after the type, e.g. `log win Shipped the CLI` → "Shipped the CLI". */
export type Words = string[] | string | undefined;

export function joinWords(words: Words): string | undefined {
  const s = Array.isArray(words) ? words.join(' ') : words;
  return s?.trim() || undefined;
}

interface Common extends WriteOptions {
  desc?: string;
  company?: string;
  date?: string;
  visibility?: string;
  public?: boolean;
  input?: string;
}

export interface ActivityOptions extends Common {
  goal?: string;
  time?: string;
  skills?: string;
}

export async function logActivity(env: Environment, words: Words, flags: ActivityOptions): Promise<void> {
  const o = merge(await readInput(flags.input), { ...flags, title: joinWords(words) });
  const { title, description } = quickTitle(o.title, o.desc);
  const goal = await resolveGoal(env, o.goal);
  await createEntry(
    env,
    'activity',
    {
      ...(await resolveCompany(env, o.company)),
      title,
      description,
      timeSpent: o.time ? parseHours(String(o.time)) : '',
      skills: asList(o.skills),
      goalId: goal?.id ?? null,
      visibility: parseVisibility(o.visibility, o.public),
    },
    parseWhen(o.date as string | undefined),
    flags,
    goalNote(goal),
  );
}

export interface AchievementOptions extends Common {
  skills?: string;
}

export async function logAchievement(env: Environment, words: Words, flags: AchievementOptions): Promise<void> {
  const o = merge(await readInput(flags.input), { ...flags, title: joinWords(words) });
  const { title, description } = quickTitle(o.title, o.desc);
  await createEntry(
    env,
    'achievement',
    {
      ...(await resolveCompany(env, o.company)),
      title,
      description,
      skills: asList(o.skills),
      imageUrl: null,
      visibility: parseVisibility(o.visibility, o.public),
    },
    parseWhen(o.date as string | undefined),
    flags,
  );
}

export interface OneOnOneOptions extends Common {
  with?: string[];
  point?: string[];
  action?: string[];
  notes?: string;
}

/** "Draft OKRs" or "Draft OKRs:2026-10-20" → an action item. */
export function parseAction(spec: string): { text: string; completed: boolean; dueDate: string | null } {
  const m = /^(.*):(\d{4}-\d{2}-\d{2})$/.exec(spec.trim());
  return m ? { text: m[1]!.trim(), completed: false, dueDate: formatActionDue(m[2]!) } : { text: spec.trim(), completed: false, dueDate: null };
}

/**
 * The bots' one-liner: "with Sarah: growth plan" → participants and notes.
 * Several names work too: "with Sarah and Tom: …" or "with Sarah, Tom: …".
 */
export function parseWithLine(text: string): { participants: string[]; notes: string } | undefined {
  const m = /^with\s+([^:]+):\s*(.+)$/is.exec(text.trim());
  if (!m) return undefined;
  const participants = m[1]!.split(/\s*,\s*|\s+and\s+|\s*&\s*/i).map((p) => p.trim()).filter(Boolean);
  return participants.length ? { participants, notes: m[2]!.trim() } : undefined;
}

export async function logOneOnOne(env: Environment, words: Words, flags: OneOnOneOptions): Promise<void> {
  const o = merge(await readInput(flags.input), { ...flags, title: joinWords(words) });
  let participants = asRepeatable(o.with);
  let title = typeof o.title === 'string' ? o.title : undefined;
  let notes = (o.notes ?? o.desc) as string | undefined;
  const line = title && !participants.length ? parseWithLine(title) : undefined;
  if (line) {
    participants = line.participants;
    notes ??= line.notes;
    title = `1:1 with ${participants.join(', ')}`;
  }
  if (!participants.length) {
    throw new CliError('A 1:1 needs someone to meet with: log 1on1 with Sarah: growth plan, or --with Sarah.', 'usage', 2);
  }
  await createEntry(
    env,
    '1on1',
    {
      ...(await resolveCompany(env, o.company)),
      title: quickTitle(title ?? `1:1 with ${participants.join(', ')}`).title,
      participants,
      discussionPoints: asRepeatable(o.point),
      actionItems: asRepeatable(o.action).map(parseAction),
      notes: requireText(notes, '--notes', 'A 1:1'),
      visibility: parseVisibility(o.visibility, o.public),
    },
    parseWhen(o.date as string | undefined),
    flags,
  );
}
