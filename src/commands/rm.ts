import { createInterface } from 'node:readline/promises';
import { apiJson } from '../api.ts';
import type { Environment } from '../config.ts';
import type { WriteOptions } from '../entries.ts';
import { CliError } from '../errors.ts';
import { formatDay } from '../dates.ts';
import { fetchFeed, resolveItem, titleOf, typeLabel, type FeedItem } from '../feed.ts';
import { emit } from '../output.ts';
import { dim } from '../term.ts';

export interface RmOptions extends WriteOptions {
  yes?: boolean;
}

export async function rm(env: Environment, refs: string[], opts: RmOptions): Promise<void> {
  const items: FeedItem[] = [];
  const feed = await fetchFeed(env);
  for (const ref of refs) items.push(await resolveItem(env, ref, undefined, feed));
  const paths = items.map((i) => `/career-feed/items/${i.itemId}/${i.timestamp}`);
  const list = items.map((i) => `  ${typeLabel(i.type)}: ${titleOf(i)}  ${dim(`(${formatDay(i.timestamp)})`)}`).join('\n');

  if (opts.dryRun) {
    emit(opts, { dryRun: true, method: 'DELETE', paths }, `Dry run: would delete\n${list}`);
    return;
  }
  if (!opts.yes) {
    if (!process.stdin.isTTY) throw new CliError('Pass --yes to delete without a prompt.', 'confirmation_required', 2);
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await rl.question(`Delete ${items.length === 1 ? 'this entry' : `these ${items.length} entries`}?\n${list}\n[y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) throw new CliError('Cancelled.', 'cancelled');
  }

  for (const path of paths) await apiJson(env, path, { method: 'DELETE' });
  emit(
    opts,
    { deleted: items.map((i) => ({ itemId: i.itemId, type: i.type, title: i.title })) },
    items.map((i) => `✓ Deleted ${typeLabel(i.type).toLowerCase()}: ${titleOf(i)}`).join('\n'),
  );
}
