import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edit } from '../src/commands/edit.ts';
import { ENVIRONMENTS } from '../src/config.ts';
import { saveSession } from '../src/credentials.ts';
import type { FeedItem } from '../src/feed.ts';

const dev = ENVIRONMENTS.dev;
let dir: string;
let out: string[];
let puts: { path: string; body: Record<string, unknown> }[];

const feed: FeedItem[] = [
  { itemId: 'goal0001-aaaa', type: 'goal', timestamp: 1, title: 'Run a 5K', description: 'Couch to 5K', dueDate: '2026-12-31', progress: 10, status: 'in_progress', visibility: 'Private', activities: ['act1'], companyId: 'c1', companyName: 'Acme' },
  { itemId: 'act00001-aaaa', type: 'activity', timestamp: 2, title: 'Long run', description: 'Ran 10k', timeSpent: '1.5', skills: ['Running'], goalId: 'goal0001-aaaa', visibility: 'Private' },
  { itemId: 'win00001-aaaa', type: 'achievement', timestamp: 3, title: 'Finished a 5K', description: 'Done', skills: ['Running'], imageUrl: null, visibility: 'Private' },
  { itemId: 'one00001-aaaa', type: '1on1', timestamp: 4, title: '1:1 with Sarah', participants: ['Sarah'], discussionPoints: ['Goals'], actionItems: [{ text: 'Book', completed: true, dueDate: null }], notes: 'Talked', visibility: 'Private' },
];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'uncola-test-'));
  vi.stubEnv('UNCOLA_CONFIG_DIR', dir);
  await saveSession('dev', { idToken: 'id', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000, authScheme: 'bearer' });
  out = [];
  puts = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => (out.push(String(s)), true));
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit = {}) => {
    if (init.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      puts.push({ path: new URL(String(url)).pathname, body });
      return Response.json({ ok: true });
    }
    return Response.json({ items: feed, nextPageToken: null });
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('edit', () => {
  it('changes only the title and sends every other goal field back', async () => {
    await edit(dev, 'run a 5k', { title: 'Run a 10K' });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe('/career-feed/goals/goal0001-aaaa');
    expect(puts[0]!.body).toEqual({
      title: 'Run a 10K', description: 'Couch to 5K', dueDate: '2026-12-31', activities: ['act1'], progress: 10, status: 'in_progress',
      visibility: 'Private', companyId: 'c1', companyName: 'Acme',
    });
    expect(out.join('')).toContain('✓ Goal updated: Run a 10K\n  changed: title');
  });

  it('completes a goal at 100, clears a due date, and reopens below 100', async () => {
    await edit(dev, 'goal0001', { progress: '100', due: 'none' });
    expect(puts[0]!.body).toMatchObject({ progress: 100, status: 'completed', dueDate: null });
    await edit(dev, 'goal0001', { progress: '40' });
    expect(puts[1]!.body).toMatchObject({ progress: 40, status: 'in_progress', dueDate: '2026-12-31' });
  });

  it('edits an activity: time, skills and unlinking the goal', async () => {
    await edit(dev, 'act00001', { time: '2h', skills: 'Running, Pacing', goal: 'none' });
    expect(puts[0]!.path).toBe('/career-feed/activities/act00001-aaaa');
    expect(puts[0]!.body).toMatchObject({ title: 'Long run', description: 'Ran 10k', timeSpent: '2', skills: ['Running', 'Pacing'], goalId: null });
  });

  it('keeps an activity linked to its goal when other fields change', async () => {
    await edit(dev, 'act00001', { desc: 'Ran 12k' });
    expect(puts[0]!.body).toMatchObject({ description: 'Ran 12k', goalId: 'goal0001-aaaa', timeSpent: '1.5' });
  });

  it('edits a win and a 1:1, replacing lists only when given', async () => {
    await edit(dev, 'win00001', { desc: 'Finished my first 5K' });
    expect(puts[0]!.body).toMatchObject({ title: 'Finished a 5K', description: 'Finished my first 5K', skills: ['Running'], imageUrl: null });
    await edit(dev, 'one00001', { notes: 'Agreed the plan' });
    expect(puts[1]!.body).toMatchObject({
      participants: ['Sarah'], discussionPoints: ['Goals'], notes: 'Agreed the plan',
      actionItems: [{ text: 'Book', completed: true, dueDate: null }],
    });
    await edit(dev, 'one00001', { action: ['Draft OKRs:2026-10-20'] });
    expect(puts[2]!.body.actionItems).toEqual([{ text: 'Draft OKRs', completed: false, dueDate: 'Oct 20, 2026' }]);
  });

  it('refuses options that do not apply to the entry, and an empty edit', async () => {
    await expect(edit(dev, 'win00001', { due: '2027-01-01' })).rejects.toMatchObject({ code: 'usage', message: expect.stringContaining("--due doesn't apply to an achievement") });
    await expect(edit(dev, 'one00001', { progress: '5' })).rejects.toMatchObject({ code: 'usage' });
    await expect(edit(dev, 'one00001', { with: ['Sam'] })).rejects.toMatchObject({ code: 'usage', message: expect.stringContaining("can't change a 1:1's participants") });
    await expect(edit(dev, 'one00001', { point: ['New'] })).rejects.toMatchObject({ code: 'usage' });
    await expect(edit(dev, 'win00001', {})).rejects.toMatchObject({ code: 'usage', message: expect.stringContaining('Nothing to change') });
    await expect(edit(dev, 'win00001', { title: 'Finished a 5K' })).rejects.toMatchObject({ message: expect.stringContaining('nothing to change') });
    await expect(edit(dev, 'win00001', { title: '  ' })).rejects.toMatchObject({ code: 'usage' });
    expect(puts).toHaveLength(0);
  });

  it('asks before making an entry public, and --yes skips the question', async () => {
    await expect(edit(dev, 'win00001', { visibility: 'public' })).rejects.toMatchObject({ code: 'confirmation_required' });
    expect(puts).toHaveLength(0);
    await edit(dev, 'win00001', { visibility: 'public', yes: true });
    expect(puts[0]!.body).toMatchObject({ visibility: 'Public' });
  });

  it('sends nothing on --dry-run', async () => {
    await edit(dev, 'win00001', { title: 'New', dryRun: true, json: true });
    expect(puts).toHaveLength(0);
    expect(JSON.parse(out.join(''))).toMatchObject({ dryRun: true, method: 'PUT', path: '/career-feed/achievements/win00001-aaaa', body: { title: 'New' } });
  });

  it('reads options from --input, with flags winning', async () => {
    const file = join(dir, 'in.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, JSON.stringify({ title: 'From file', description: 'Desc from file' }));
    await edit(dev, 'win00001', { input: file, title: 'From flag' });
    expect(puts[0]!.body).toMatchObject({ title: 'From flag', description: 'Desc from file' });
  });
});
