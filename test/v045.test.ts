// The 0.4.5 security fixes: cleaned server text, redacted skills, exact references for brag --yes,
// and a prompt before saving a public entry.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brag } from '../src/commands/brag.ts';
import { fetchGoals, goalTable } from '../src/commands/goal.ts';
import { logAchievement } from '../src/commands/log.ts';
import { ENVIRONMENTS } from '../src/config.ts';
import { saveSession } from '../src/credentials.ts';
import { redact } from '../src/redact.ts';
import { cleanText } from '../src/term.ts';

const dev = ENVIRONMENTS.dev;
let dir: string;
let requests: { method: string; url: string; body?: string }[];

const win = { itemId: 'f371403c-1c1e-42e4-b476-9fcc7e363d0b', type: 'achievement', title: 'Shipped the CLI', description: 'Shipped it', timestamp: Date.UTC(2026, 9, 20, 12) };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'uncola-test-'));
  vi.stubEnv('UNCOLA_CONFIG_DIR', dir);
  vi.stubEnv('NO_COLOR', '1');
  await saveSession('dev', { idToken: 'id', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000, authScheme: 'bearer' });
  requests = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    requests.push({ method, url: String(url), body: init.body as string | undefined });
    if (method === 'GET' && String(url).includes('/career-feed?')) return Response.json({ items: [win], nextPageToken: null });
    return Response.json({ achievement: { ...win, visibility: 'Public' } });
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('text from the server', () => {
  it('loses terminal control characters but keeps newlines and tabs', () => {
    expect(cleanText('ok\x1b]0;pwned\x07 \x1b[2Jdone\r\nnext\tline‮')).toBe('ok]0;pwned [2Jdone\nnext\tline');
  });

  it('is cleaned in every API response', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ goals: [{ itemId: 'a', title: 'Fake\x1b[1A\x1b[2K prompt', timestamp: 1 }] }));
    const { goals } = await fetchGoals(dev);
    expect(goals[0]!.title).toBe('Fake[1A[2K prompt');
  });
});

describe('goal list', () => {
  it('marks completed goals', () => {
    const table = goalTable([{ itemId: 'a', title: 'Run a 5K', progress: 100, status: 'completed', timestamp: 1 }]);
    expect(table).toMatch(/100% completed/);
  });
});

describe('brag', () => {
  it('redacts skills, which become public hashtags', () => {
    const { fields, redactions } = redact({ title: 'Won', skills: ['Kubernetes', 'ops.corp'] });
    expect(fields.skills).toEqual(['Kubernetes', '[internal host]']);
    expect(redactions[0]).toMatchObject({ field: 'skills', reason: 'internal host name' });
  });

  it('with --yes, refuses a title fragment', async () => {
    await expect(brag(dev, 'Shipped', { yes: true })).rejects.toThrow(/by its ID or its #/);
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('with --yes, shares by ID', async () => {
    await brag(dev, win.itemId, { yes: true });
    expect(requests.some((r) => r.method === 'PUT' && r.url.endsWith(`/achievements/${win.itemId}`))).toBe(true);
  });

  it('a dry run by title still works, and prints the link', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await brag(dev, 'Shipped', { dryRun: true });
    expect(out.mock.calls.join('')).toMatch(new RegExp(`publish it at https://app\\.styloc\\.com/shared/${win.itemId}`));
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  });
});

describe('public entries', () => {
  it('need --yes without a terminal', async () => {
    await expect(logAchievement(dev, 'Spoke at the summit', { public: true })).rejects.toMatchObject({ code: 'confirmation_required' });
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('save with --yes, and return id as well as itemId', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await logAchievement(dev, 'Spoke at the summit', { public: true, yes: true, json: true });
    const saved = JSON.parse(String(out.mock.calls.at(-1)![0]));
    expect(saved).toMatchObject({ id: win.itemId, itemId: win.itemId });
    expect(JSON.parse(requests.find((r) => r.method === 'POST')!.body!)).toMatchObject({ visibility: 'Public' });
  });

  it('private entries need no prompt', async () => {
    await logAchievement(dev, 'Spoke at the summit', {});
    expect(requests.some((r) => r.method === 'POST')).toBe(true);
  });
});
