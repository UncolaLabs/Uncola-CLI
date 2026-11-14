import { apiJson } from './api.ts';
import type { Environment } from './config.ts';
import { formatDay, type When } from './dates.ts';
import { CliError } from './errors.ts';
import { createdItem, freeTimestamp, resolveItem, shortId, typeLabel, type FeedItem, type ItemType } from './feed.ts';
import { emit, info, type OutputOptions } from './output.ts';
import { askLine } from './prompt.ts';
import { redact } from './redact.ts';

export interface WriteOptions extends OutputOptions {
  dryRun?: boolean;
  /** Skip the prompt before saving a public entry. */
  yes?: boolean;
}

export const TYPE_PATHS: Record<ItemType, string> = {
  goal: 'goals',
  activity: 'activities',
  achievement: 'achievements',
  '1on1': '1on1s',
};

const VISIBILITIES = ['private', 'team', 'company', 'public'];

/** Entries are private unless asked otherwise, matching the app. */
export function parseVisibility(visibility: unknown, isPublic: unknown): string {
  if (isPublic === true) return 'Public';
  if (visibility === undefined || visibility === null) return 'Private';
  const v = String(visibility).toLowerCase();
  if (!VISIBILITIES.includes(v)) {
    throw new CliError(`Invalid visibility "${visibility}". Use one of: ${VISIBILITIES.join(', ')}`, 'usage', 2);
  }
  return v[0]!.toUpperCase() + v.slice(1);
}

export function requireTitle(title: unknown): string {
  if (typeof title !== 'string' || !title.trim()) throw new CliError('A title is required.', 'usage', 2);
  return title.trim();
}

const TITLE_MAX = 200;

/**
 * Like the bots' quick save: the typed text is the title (first 200 characters) and,
 * when no --desc is given, the description too.
 */
export function quickTitle(text: unknown, desc?: unknown): { title: string; description: string } {
  const full = requireTitle(text);
  const title = [...full].length > TITLE_MAX ? [...full].slice(0, TITLE_MAX).join('').trimEnd() : full;
  const description = typeof desc === 'string' && desc.trim() ? desc.trim() : full;
  return { title, description };
}

interface Company {
  companyId: string;
  companyName: string;
}

/** --company: a name (or part of one) from the companies in your Uncola profile. */
export async function resolveCompany(env: Environment, ref: unknown): Promise<Partial<Company>> {
  if (ref === undefined || ref === null || ref === '') return {};
  const res = await apiJson<{ companies?: Record<string, unknown>[] }>(env, '/profile/companies');
  const companies = (res.companies ?? [])
    .map((c) => ({ companyId: String(c.companyId ?? c.id ?? ''), companyName: String(c.companyName ?? c.name ?? '') }))
    .filter((c) => c.companyId && c.companyName);
  if (!companies.length) throw new CliError('Your Uncola profile has no companies yet. Add them in the app under Profile.', 'not_found', 3);
  const needle = String(ref).toLowerCase();
  const exact = companies.filter((c) => c.companyName.toLowerCase() === needle);
  const matches = exact.length ? exact : companies.filter((c) => c.companyName.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0]!;
  const names = companies.map((c) => c.companyName).join(', ');
  if (!matches.length) throw new CliError(`No company matching "${ref}". Your companies: ${names}`, 'not_found', 3);
  throw new CliError(`"${ref}" matches several companies: ${matches.map((c) => c.companyName).join(', ')}`, 'ambiguous', 2);
}

/** The API rejects some empty fields; catch them here so the error names the flag. */
export function requireText(value: unknown, flag: string, what: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new CliError(`${what} needs ${flag}.`, 'usage', 2);
  return value.trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GoalRef {
  id: string;
  /** Unknown when a full UUID was given, since that skips the lookup. */
  title?: string;
}

/** Resolves a goal reference to its full ID. Full UUIDs pass through without a network call. */
export async function resolveGoal(env: Environment, ref: unknown): Promise<GoalRef | null> {
  if (ref === undefined || ref === null || ref === '') return null;
  const s = String(ref);
  if (UUID_RE.test(s)) return { id: s };
  const goal = await resolveItem(env, s, 'goal');
  return { id: goal.itemId, title: goal.title };
}

/** The confirmation line's suffix naming the goal an entry was linked to. */
export function goalNote(goal: GoalRef | null): string | undefined {
  return goal ? ` · goal: ${goal.title ?? shortId(goal.id)}` : undefined;
}

function dryRun(opts: WriteOptions, method: string, path: string, body: unknown, note = ''): void {
  emit(
    opts,
    { dryRun: true, method, path, body },
    `Dry run: would ${method} ${path}${note}\n${JSON.stringify(body, null, 2)}`,
  );
}

export async function createEntry(
  env: Environment,
  type: ItemType,
  body: Record<string, unknown>,
  when: When,
  opts: WriteOptions,
  note = '',
): Promise<void> {
  const path = `/career-feed/${TYPE_PATHS[type]}`;
  const full: Record<string, unknown> = { companyId: null, companyName: null, ...body, timestamp: when.timestamp };
  if (opts.dryRun) {
    dryRun(opts, 'POST', path, full, note);
    return;
  }
  if (full.visibility === 'Public') await confirmPublic(full, opts);
  // Day-only dates all land on 12:00 UTC, and the API overwrites items with the same timestamp.
  if (when.dateOnly) full.timestamp = await freeTimestamp(env, when.timestamp);

  const res = await apiJson<unknown>(env, path, { method: 'POST', body: JSON.stringify(full) });
  const item = createdItem(res);
  if (!item) throw new CliError(`Unexpected response from POST ${path}: ${JSON.stringify(res).slice(0, 200)}`, 'bad_response');
  emit(
    opts,
    { id: item.itemId, ...item },
    `✓ ${typeLabel(type)} saved: ${item.title ?? full.title}\n  ${item.visibility ?? full.visibility} · ${formatDay(item.timestamp)}${note}`,
  );
}

/**
 * A public entry is visible to anyone, so ask first (or require --yes), and point out what brag's
 * redaction would hide. The entry is saved as written: public is what was asked for.
 */
async function confirmPublic(body: Record<string, unknown>, opts: WriteOptions): Promise<void> {
  const { redactions } = redact(body, ['title', 'description', 'notes', 'skills']);
  if (redactions.length) {
    info(`! This public entry includes: ${redactions.map((r) => `${r.reason} (${r.original})`).join('; ')}`);
  }
  if (opts.yes) return;
  if (!process.stdin.isTTY) {
    throw new CliError('This entry would be public. Pass --yes to save it without a prompt, or leave out --public.', 'confirmation_required', 2);
  }
  const answer = await askLine('Anyone will be able to see this entry. Save it as public? [y/N] ', 'Cancelled; nothing was saved.');
  if (!/^y(es)?$/i.test(answer)) throw new CliError('Cancelled; nothing was saved.', 'cancelled');
}

export async function updateEntry(
  env: Environment,
  item: FeedItem,
  body: Record<string, unknown>,
  opts: WriteOptions,
  summary: string,
): Promise<void> {
  const path = `/career-feed/${TYPE_PATHS[item.type]}/${item.itemId}`;
  if (opts.dryRun) {
    dryRun(opts, 'PUT', path, body);
    return;
  }
  const res = await apiJson<unknown>(env, path, { method: 'PUT', body: JSON.stringify(body) });
  const updated = createdItem(res) ?? { ...item, ...body };
  emit(opts, { id: updated.itemId, ...updated }, summary);
}
