import type { Environment } from '../config.ts';
import { formatDay, parseSince } from '../dates.ts';
import { CliError } from '../errors.ts';
import { fetchFeed, parseType, saveLastList, shortId, snippetOf, titleOf, typeLabel, type FeedItem, type ItemType } from '../feed.ts';
import { emit, type OutputOptions } from '../output.ts';
import { lastColumnWidth, table } from '../table.ts';
import { dim, termWidth, truncate } from '../term.ts';

export interface FeedOptions extends OutputOptions {
  type?: string;
  since?: string;
  limit?: string;
  ids?: boolean;
  /** --no-body sets this false. */
  body?: boolean;
}

/** `feed [type]`: the bots' "feed goal" and the older "--type goal" both work. */
export async function feed(env: Environment, typeWord: string | undefined, opts: FeedOptions): Promise<void> {
  const word = typeWord ?? opts.type;
  const type = word ? parseType(word) : undefined;
  const since = opts.since ? parseSince(opts.since) : undefined;
  const limit = opts.limit ? Number(opts.limit) : 20;
  if (!Number.isInteger(limit) || limit < 1) throw new CliError('--limit must be a positive whole number.', 'usage', 2);

  const items = (await fetchFeed(env))
    .filter((i) => (!type || i.type === type) && (since === undefined || i.timestamp >= since))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  if (!opts.json) await saveLastList(env, items);
  emit(opts, items, items.length ? feedTable(items, opts) : emptyMessage(type));
}

export function feedTable(items: FeedItem[], opts: { ids?: boolean; body?: boolean } = {}, total = termWidth()): string {
  const headers = ['#', ...(opts.ids ? ['ID'] : []), 'TYPE', 'DATE', 'VISIBILITY', 'TITLE'];
  const rows = items.map((i, n) => [
    String(n + 1),
    ...(opts.ids ? [shortId(i.itemId)] : []),
    typeLabel(i.type),
    formatDay(i.timestamp),
    String(i.visibility ?? ''),
    '',
  ]);
  const width = lastColumnWidth(headers, rows, total);
  items.forEach((item, n) => (rows[n]![rows[n]!.length - 1] = titleCell(item, width, opts.body !== false)));
  return table(headers, rows) + `\n\n${dim('Show one with: show <#> or show <part of the title>')}`;
}

/** The title, then as much of the description as fits, dimmed. */
export function titleCell(item: FeedItem, width: number, withBody = true): string {
  const title = truncate(titleOf(item), width);
  const snippet = withBody ? snippetOf(item) : '';
  const room = width - [...title].length - 3;
  if (!snippet || room < 8 || snippet === title) return title;
  return `${title}${dim(` · ${truncate(snippet, room)}`)}`;
}

function emptyMessage(type: ItemType | undefined): string {
  if (!type) return 'No entries.';
  return `No ${typeLabel(type).toLowerCase()} entries. Add one with: uncola log ${type} <text>`;
}
