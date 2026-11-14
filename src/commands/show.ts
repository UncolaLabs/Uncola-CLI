import type { Environment } from '../config.ts';
import { formatDay, toDay } from '../dates.ts';
import { fetchFeed, resolveItem, shortId, titleOf, typeLabel, type FeedItem } from '../feed.ts';
import { emit, type OutputOptions } from '../output.ts';

/** `show <ref>`: one entry in full. Any type can be found by ID, ID prefix or part of its title. */
export async function show(env: Environment, ref: string, opts: OutputOptions): Promise<void> {
  const feed = await fetchFeed(env);
  const item = await resolveItem(env, ref, undefined, feed, true);
  emit(opts, item, describeItem(item, feed, env.appBase));
}

interface ActionItem {
  text: string;
  completed?: boolean;
  dueDate?: string | null;
}

/** Renders an entry as a heading, aligned fields, then any lists. */
export function describeItem(item: FeedItem, feed: FeedItem[] = [], appBase?: string): string {
  const fields: [string, string | undefined][] = [
    ['ID', item.itemId],
    ['Date', formatDay(item.timestamp)],
    ['Visibility', item.visibility],
    ['Company', typeof item.companyName === 'string' ? item.companyName : undefined],
  ];
  const sections: string[] = [];
  const list = (heading: string, lines: string[]) => {
    if (lines.length) sections.push(`${heading} (${lines.length})\n${lines.map((l) => `  ${l}`).join('\n')}`);
  };
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

  switch (item.type) {
    case 'goal': {
      const status = item.status === 'in_progress' ? 'in progress' : String(item.status ?? '').replace(/_/g, ' ');
      fields.push(['Progress', `${item.progress ?? 0}%${status ? ` · ${status}` : ''}`]);
      fields.push(['Due', toDay(item.dueDate)]);
      const titles = new Map(feed.map((i) => [i.itemId, i.title]));
      list(
        'Activities',
        strings(item.linkedActivities).map((id) => `${shortId(id)}  ${titles.get(id) ?? '(not in your feed)'}`),
      );
      break;
    }
    case 'activity': {
      const goal = item.goalDetails as { title?: string } | undefined;
      if (typeof item.goalId === 'string') fields.push(['Goal', `${goal?.title ?? '?'} (${shortId(item.goalId)})`]);
      if (item.timeSpent) fields.push(['Time spent', `${item.timeSpent}h`]);
      fields.push(['Skills', strings(item.skills).join(', ')]);
      break;
    }
    case 'achievement': {
      fields.push(['Skills', strings(item.skills).join(', ')]);
      const endorsements = Array.isArray(item.endorsements) ? item.endorsements.length : 0;
      if (endorsements) fields.push(['Endorsements', String(endorsements)]);
      break;
    }
    case '1on1': {
      fields.push(['With', strings(item.participants).join(', ')]);
      list('Discussion points', strings(item.discussionPoints));
      const actions = (Array.isArray(item.actionItems) ? item.actionItems : []) as ActionItem[];
      list(
        'Action items',
        actions.map((a) => `[${a.completed ? 'x' : ' '}] ${a.text}${a.dueDate ? ` (due ${a.dueDate})` : ''}`),
      );
      if (typeof item.notes === 'string' && item.notes) sections.push(`Notes\n${indent(item.notes)}`);
      break;
    }
  }
  if (item.verified) fields.push(['Verified', 'yes']);
  // Entries shared with `brag` (or the app's megaphone) have a public page.
  if (appBase && item.publicVersion) fields.push(['Shared', `${appBase}/shared/${item.itemId}`]);

  const shown = fields.filter((f): f is [string, string] => !!f[1]);
  const width = Math.max(...shown.map(([k]) => k.length));
  const body = [
    `${typeLabel(item.type)} · ${titleOf(item)}`,
    shown.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`).join('\n'),
  ];
  if (typeof item.description === 'string' && item.description) body.push(`Description\n${indent(item.description)}`);
  return [...body, ...sections].join('\n\n');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');
}
