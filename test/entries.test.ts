import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAction } from '../src/commands/log.ts';
import { ENVIRONMENTS } from '../src/config.ts';
import { saveSession } from '../src/credentials.ts';
import { createEntry, parseVisibility } from '../src/entries.ts';
import { createdItem, resolveItem, type FeedItem, type ItemType } from '../src/feed.ts';
import { merge } from '../src/input.ts';

const dev = ENVIRONMENTS.dev;
let dir: string;
let out: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'uncola-test-'));
  vi.stubEnv('UNCOLA_CONFIG_DIR', dir);
  await saveSession('dev', { idToken: 'id', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000, authScheme: 'bearer' });
  out = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

const item = (itemId: string, type: ItemType = 'goal', timestamp = 1, title = itemId): FeedItem => ({ itemId, type, timestamp, title });

describe('helpers', () => {
  it('defaults visibility to Private', () => {
    expect(parseVisibility(undefined, undefined)).toBe('Private');
    expect(parseVisibility('team', undefined)).toBe('Team');
    expect(parseVisibility(undefined, true)).toBe('Public');
    expect(() => parseVisibility('friends', undefined)).toThrow(/Invalid visibility/);
  });
  it('parses action items', () => {
    expect(parseAction('Draft OKRs:2026-10-20')).toEqual({ text: 'Draft OKRs', completed: false, dueDate: 'Oct 20, 2026' });
    expect(parseAction('Ratio 2:1 split')).toEqual({ text: 'Ratio 2:1 split', completed: false, dueDate: null });
  });
  it('finds the created item inside the response wrapper', () => {
    expect(createdItem({ message: 'ok', meeting: { itemId: 'm1' } })?.itemId).toBe('m1');
    expect(createdItem({ message: 'ok' })).toBeUndefined();
  });
  it('lets flags override --input JSON and maps description to desc', () => {
    expect(merge({ title: 'json', description: 'd', skills: ['a'] }, { title: undefined, skills: 'b' })).toMatchObject({
      title: 'json',
      desc: 'd',
      skills: 'b',
    });
  });
});

describe('resolveItem', () => {
  const feed = [item('aaaa1111-x'), item('aaaa2222-y'), item('bbbb3333-z', 'activity')];
  it('matches a unique prefix', async () => {
    expect((await resolveItem(dev, 'bbbb', undefined, feed)).itemId).toBe('bbbb3333-z');
  });
  it('reports ambiguity and missing items', async () => {
    await expect(resolveItem(dev, 'aaaa', undefined, feed)).rejects.toMatchObject({ code: 'ambiguous' });
    await expect(resolveItem(dev, 'cccc', undefined, feed)).rejects.toMatchObject({ code: 'not_found' });
    await expect(resolveItem(dev, 'bbbb', 'goal', feed)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('finds goals by part of their title, but not other types', async () => {
    const goals = [item('1111aaaa', 'goal', 1, 'Complete NeetCode 250'), item('2222bbbb', 'goal', 2, 'Earn PCA cert'), item('3333cccc', 'activity', 3, 'NeetCode arrays')];
    expect((await resolveItem(dev, 'neetcode', 'goal', goals)).itemId).toBe('1111aaaa');
    await expect(resolveItem(dev, 'neetcode', undefined, goals)).rejects.toMatchObject({ code: 'not_found' });
    await expect(resolveItem(dev, 'e', 'goal', goals)).rejects.toMatchObject({ code: 'ambiguous' });
  });
  it('matches any type by title when asked, preferring a whole title', async () => {
    const feed = [item('1111aaaa', 'goal', 1, 'Ship CLI'), item('2222bbbb', 'activity', 2, 'Ship CLI docs')];
    expect((await resolveItem(dev, 'docs', undefined, feed, true)).itemId).toBe('2222bbbb');
    expect((await resolveItem(dev, 'ship cli', undefined, feed, true)).itemId).toBe('1111aaaa');
    await expect(resolveItem(dev, 'ship', undefined, feed, true)).rejects.toMatchObject({ code: 'ambiguous' });
  });
});

describe('createEntry', () => {
  it('nudges a day-only timestamp past existing items', async () => {
    const noon = Date.UTC(2026, 9, 19, 12);
    const posted: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      if (init.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posted.push(body);
        return Response.json({ achievement: { ...body, itemId: 'new1', type: 'achievement' } }, { status: 201 });
      }
      return Response.json({ items: [item('x', 'achievement', noon), item('y', 'goal', noon + 1)], nextPageToken: null });
    });
    await createEntry(dev, 'achievement', { title: 't', description: 'd', visibility: 'Private' }, { timestamp: noon, dateOnly: true }, {});
    expect(posted[0]).toMatchObject({ timestamp: noon + 2, companyId: null, companyName: null });
    expect(out.join('')).toMatch(/✓ Achievement saved: t\n  Private · 2026-10-19/);
  });

  it('sends nothing on --dry-run', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await createEntry(dev, 'goal', { title: 't' }, { timestamp: 5, dateOnly: true }, { dryRun: true, json: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(out.join(''))).toMatchObject({ dryRun: true, method: 'POST', path: '/career-feed/goals', body: { timestamp: 5 } });
  });
});
