import type { Environment } from '../config.ts';
import { parseDue, parseHours } from '../dates.ts';
import { confirmPublic, parseVisibility, resolveCompany, resolveGoal, requireText, updateEntry, type WriteOptions } from '../entries.ts';
import { CliError } from '../errors.ts';
import { fetchFeed, resolveItem, typeLabel, type ItemType } from '../feed.ts';
import { asList, asRepeatable, merge, readInput } from '../input.ts';
import { parseProgress } from './goal.ts';
import { parseAction } from './log.ts';

export interface EditOptions extends WriteOptions {
  title?: string;
  desc?: string;
  due?: string;
  progress?: string;
  goal?: string;
  time?: string;
  skills?: string;
  with?: string[];
  point?: string[];
  action?: string[];
  notes?: string;
  company?: string;
  visibility?: string;
  public?: boolean;
  input?: string;
}

/** The options each type accepts besides the shared ones; anything else is refused, not ignored. */
const OWN_OPTIONS: Record<ItemType, string[]> = {
  goal: ['due', 'progress'],
  activity: ['goal', 'time', 'skills'],
  achievement: ['skills'],
  '1on1': ['with', 'point', 'action', 'notes'],
};
const SHARED = ['title', 'desc', 'company', 'visibility', 'public'];
const ALL_OWN = Object.values(OWN_OPTIONS).flat();
const unset = (v: unknown) => /^(none|clear|-)$/i.test(String(v).trim());

/**
 * `edit <entry>`: changes only the fields given and sends the rest back as they are, because the API's
 * PUT replaces every editable field.
 */
export async function edit(env: Environment, ref: string, flags: EditOptions): Promise<void> {
  const o = merge(await readInput(flags.input), flags);
  const feed = await fetchFeed(env);
  const item = await resolveItem(env, ref, undefined, feed, true);
  const type = item.type;

  const given = [...SHARED, ...ALL_OWN].filter((k) => (o as Record<string, unknown>)[k] !== undefined);
  const foreign = given.filter((k) => ALL_OWN.includes(k) && !OWN_OPTIONS[type].includes(k));
  if (foreign.length) {
    const own = [...SHARED.filter((k) => k !== 'public'), ...OWN_OPTIONS[type]].map((k) => `--${k === 'desc' && type === '1on1' ? 'notes' : k}`);
    throw new CliError(`${foreign.map((k) => `--${k}`).join(', ')} doesn't apply to ${article(type)}. For this entry use: ${[...new Set(own)].join(', ')}`, 'usage', 2);
  }
  // Tested on dev: the update call saves a 1:1's title, notes, action items and visibility, but silently
  // keeps its participants and discussion points, so refuse rather than pretend.
  if (type === '1on1' && (o.with !== undefined || o.point !== undefined)) {
    throw new CliError("Uncola can't change a 1:1's participants or discussion points after it's saved. You can edit its title, notes, action items and visibility, or delete it and log it again.", 'usage', 2);
  }
  if (!given.length) {
    throw new CliError(`Nothing to change. Say what to change, e.g. edit ${ref} --title "New title" (see edit --help).`, 'usage', 2);
  }

  const body: Record<string, unknown> = {
    title: o.title === undefined ? item.title : requireText(o.title, '--title', 'The title'),
    visibility: o.visibility !== undefined || o.public ? parseVisibility(o.visibility, o.public) : (item.visibility ?? 'Private'),
    ...(o.company !== undefined ? await resolveCompany(env, o.company) : { companyId: item.companyId ?? null, companyName: item.companyName ?? null }),
  };
  const text = (v: unknown, field: string) => (v === undefined ? (item[field] ?? '') : String(v).trim());

  switch (type) {
    case 'goal': {
      const progress = o.progress === undefined ? Number(item.progress ?? 0) : parseProgress(o.progress);
      Object.assign(body, {
        description: text(o.desc, 'description'),
        dueDate: o.due === undefined ? (item.dueDate ?? null) : unset(o.due) ? null : parseDue(String(o.due)),
        activities: item.activities ?? [],
        progress,
        status: progress === 100 ? 'completed' : 'in_progress',
      });
      break;
    }
    case 'activity': {
      const goal = o.goal === undefined ? undefined : unset(o.goal) ? null : await resolveGoal(env, o.goal);
      Object.assign(body, {
        description: requireText(text(o.desc, 'description'), '--desc', 'An activity'),
        timeSpent: o.time === undefined ? (item.timeSpent ?? '') : unset(o.time) ? '' : parseHours(String(o.time)),
        skills: o.skills === undefined ? (item.skills ?? []) : asList(o.skills),
        goalId: goal === undefined ? (item.goalId ?? null) : (goal?.id ?? null),
      });
      break;
    }
    case 'achievement':
      Object.assign(body, {
        description: requireText(text(o.desc, 'description'), '--desc', 'An achievement'),
        skills: o.skills === undefined ? (item.skills ?? []) : asList(o.skills),
        imageUrl: item.imageUrl ?? null,
      });
      break;
    case '1on1': {
      Object.assign(body, {
        participants: item.participants ?? [],
        discussionPoints: item.discussionPoints ?? [],
        actionItems: o.action === undefined ? (item.actionItems ?? []) : asRepeatable(o.action).map(parseAction),
        notes: requireText(o.notes ?? o.desc ?? item.notes, '--notes', 'A 1:1'),
      });
      break;
    }
  }

  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const changed = Object.keys(body).filter((k) => !same(body[k], item[k]));
  if (!changed.length) throw new CliError('That is what the entry already says; nothing to change.', 'usage', 2);
  if (!flags.dryRun && body.visibility === 'Public' && item.visibility !== 'Public') await confirmPublic(body, flags);

  await updateEntry(env, item, body, flags, `✓ ${typeLabel(type)} updated: ${body.title as string}\n  changed: ${changed.map(label).join(', ')}`);
}

function article(type: ItemType): string {
  return `${/^[aeiou1]/i.test(typeLabel(type)) ? 'an' : 'a'} ${typeLabel(type).toLowerCase()}`;
}

const LABELS: Record<string, string> = {
  dueDate: 'due date', timeSpent: 'time spent', goalId: 'goal', discussionPoints: 'points', actionItems: 'action items',
  companyId: 'company', companyName: 'company', description: 'description',
};
function label(key: string): string {
  return LABELS[key] ?? key;
}
