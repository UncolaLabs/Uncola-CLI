import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { apiJson } from './api.ts';
import type { Environment } from './config.ts';
import { configDir } from './credentials.ts';
import { CliError } from './errors.ts';
import { firstLine } from './term.ts';

export const ITEM_TYPES = ['goal', 'activity', 'achievement', '1on1'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** The words the Slack and Teams bots accept for each type, plus plurals. */
export const TYPE_WORDS: Record<ItemType, string[]> = {
  achievement: ['achievement', 'ach', 'win', 'achievements', 'wins'],
  goal: ['goal', 'goals'],
  activity: ['activity', 'act', 'activities'],
  '1on1': ['1on1', '1:1', 'oneonone', 'meeting', '1on1s', '1:1s', 'meetings'],
};

/** A type word → its type, or undefined. */
export function typeFromWord(word: string): ItemType | undefined {
  const w = word.toLowerCase();
  return ITEM_TYPES.find((t) => TYPE_WORDS[t].includes(w));
}

export function parseType(word: string): ItemType {
  const type = typeFromWord(word);
  if (!type) throw new CliError(`Unknown type "${word}". Use one of: goal, activity, achievement (or win), 1on1 (or meeting).`, 'usage', 2);
  return type;
}

export interface FeedItem {
  itemId: string;
  type: ItemType;
  timestamp: number;
  title: string;
  description?: string;
  visibility?: string;
  [key: string]: unknown;
}

interface FeedPage {
  items: FeedItem[];
  nextPageToken: string | null;
}

/** Fetches the caller's feed, following pages until the end or `max` items. */
export async function fetchFeed(env: Environment, max = Infinity): Promise<FeedItem[]> {
  const items: FeedItem[] = [];
  let lastKey: string | null = null;
  do {
    const q = new URLSearchParams({ limit: '50' });
    if (lastKey) q.set('lastKey', lastKey);
    const page: FeedPage = await apiJson<FeedPage>(env, `/career-feed?${q}`);
    items.push(...(page.items ?? []));
    lastKey = page.nextPageToken && page.nextPageToken !== 'none' ? page.nextPageToken : null;
  } while (lastKey && items.length < max);
  return items.slice(0, max);
}

/**
 * Finds one item by full ID or a unique ID prefix (as shown in tables). Goals can
 * also be found by part of their title, e.g. --goal neetcode; `byTitle` extends
 * that to other lookups. `rm` leaves it off so a loose word can't pick what to delete.
 */
export async function resolveItem(
  env: Environment,
  ref: string,
  type?: ItemType,
  feed?: FeedItem[],
  byTitle = type === 'goal',
): Promise<FeedItem> {
  const all = feed ?? (await fetchFeed(env));
  const row = await fromLastList(env, ref, all);
  if (row) {
    if (type && row.type !== type) {
      throw new CliError(`Row ${ref} of your last list is ${article(typeLabel(row.type))}, not ${article(typeLabel(type))}: ${row.title}`, 'usage', 2);
    }
    return row;
  }
  const items = all.filter((i) => !type || i.type === type);
  const exact = items.find((i) => i.itemId === ref);
  if (exact) return exact;
  const what = type ? typeLabel(type).toLowerCase() : 'item';

  let matches = ref.length >= 4 ? items.filter((i) => i.itemId.startsWith(ref)) : [];
  if (matches.length === 0 && byTitle) {
    const needle = ref.toLowerCase();
    matches = items.filter((i) => titleOf(i).toLowerCase().includes(needle));
    // A full title wins over the longer titles that contain it.
    const whole = matches.filter((i) => titleOf(i).toLowerCase() === needle);
    if (whole.length === 1) matches = whole;
  }
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    if (ref.length < 4 && !byTitle) throw new CliError(`ID "${ref}" is too short; give at least 4 characters.`, 'usage', 2);
    throw new CliError(`No ${what} matching "${ref}".`, 'not_found', 3);
  }
  const list = matches.map((i) => `  ${shortId(i.itemId)}  ${type ? '' : typeLabel(i.type).padEnd(13)}${titleOf(i)}`).join('\n');
  throw new CliError(`"${ref}" matches ${matches.length} ${what}s; be more specific:\n${list}`, 'ambiguous', 2);
}

/** Moves a timestamp forward by 1 ms until it doesn't collide with an existing item. */
export async function freeTimestamp(env: Environment, timestamp: number): Promise<number> {
  const taken = new Set((await fetchFeed(env)).map((i) => i.timestamp));
  let t = timestamp;
  while (taken.has(t)) t++;
  return t;
}

/** Create responses wrap the item ({goal: …}, {meeting: …}); return whichever object has an itemId. */
export function createdItem(res: unknown): FeedItem | undefined {
  if (!res || typeof res !== 'object') return undefined;
  const r = res as Record<string, unknown>;
  if (typeof r.itemId === 'string') return r as unknown as FeedItem;
  return Object.values(r).find(
    (v): v is FeedItem => !!v && typeof v === 'object' && typeof (v as FeedItem).itemId === 'string',
  );
}

export function typeLabel(type: string): string {
  return { goal: 'Goal', activity: 'Activity', achievement: 'Achievement', '1on1': '1:1' }[type] ?? type;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Titles from other clients may be missing; never let that crash a lookup or a table. */
export function titleOf(item: FeedItem): string {
  return typeof item.title === 'string' ? item.title : '(untitled)';
}

/** The text a list row previews: the description, or a 1:1's notes. */
export function snippetOf(item: FeedItem): string {
  return firstLine(item.description) || firstLine(item.notes);
}

function article(word: string): string {
  return /^[aeiou1]/i.test(word) ? `an ${word.toLowerCase()}` : `a ${word.toLowerCase()}`;
}

// Row numbers: lists print #1, #2…; `show 2` or `rm 2` then mean that row of the last list.

const lastListPath = (env: Environment) => join(configDir(), `last-list-${env.name}.json`);

/** Remembers the order of a list just printed, so its row numbers can be used next. */
export async function saveLastList(env: Environment, items: FeedItem[]): Promise<void> {
  try {
    await mkdir(configDir(), { recursive: true, mode: 0o700 });
    await writeFile(lastListPath(env), JSON.stringify(items.map((i) => i.itemId)), { mode: 0o600 });
  } catch {
    // Row numbers are a convenience; IDs and titles still work without them.
  }
}

/** "2" or "#2" → that row of the last list. IDs are never this short, so the forms can't clash. */
async function fromLastList(env: Environment, ref: string, feed: FeedItem[]): Promise<FeedItem | undefined> {
  const m = /^#?(\d+)$/.exec(ref);
  if (!m || (!ref.startsWith('#') && ref.length > 3)) return undefined;
  let ids: string[];
  try {
    ids = JSON.parse(await readFile(lastListPath(env), 'utf8')) as string[];
  } catch {
    throw new CliError(`No list to take row ${ref} from. Run list or goal list first, or use part of the title.`, 'usage', 2);
  }
  const n = Number(m[1]);
  const id = ids[n - 1];
  if (!id) throw new CliError(`Your last list had ${ids.length} rows, so there's no row ${n}.`, 'not_found', 3);
  const item = feed.find((i) => i.itemId === id);
  if (!item) throw new CliError(`Row ${n} of your last list no longer exists. List again to refresh the numbers.`, 'not_found', 3);
  return item;
}
