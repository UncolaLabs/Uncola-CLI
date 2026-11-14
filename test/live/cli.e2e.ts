// End-to-end test: runs the real CLI against the server with your login, the way a user would.
// Every entry it makes has "[e2e <run>]" in its title and is deleted at the end, even when a step fails.
// Run with `npm run test:live` after `uncola login --env dev`. It runs against dev unless
// UNCOLA_LIVE_ENV=prod names prod explicitly; it shares one test entry publicly, then deletes it.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENVIRONMENTS, type EnvName } from '../../src/config.ts';

const cli = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));
const envName = (process.env.UNCOLA_LIVE_ENV ?? 'dev') as EnvName;
const env = ENVIRONMENTS[envName];
if (!env) throw new Error(`UNCOLA_LIVE_ENV must be dev or prod, not ${envName}.`);
const run = `[e2e ${Date.now().toString(36)}]`;
const created = new Set<string>();

interface Result {
  code: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  stdout: string;
}

/** Runs `uncola <args> --json` and parses what it prints. */
function uncola(args: string[], input?: string): Promise<Result> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [cli, ...args, '--json'], { env: { ...process.env, UNCOLA_ENV: envName } }, (err, stdout) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      let json: unknown;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = undefined;
      }
      resolve({ code, json, stdout });
    });
    child.stdin?.end(input ?? '');
  });
}

/** Runs a command that creates an entry, and remembers it for clean-up. */
async function create(args: string[], input?: string) {
  const r = await uncola(args, input);
  expect(r.code, r.stdout).toBe(0);
  created.add(r.json.itemId);
  return r.json;
}

const ids = { goal: '', activity: '', win: '', oneOnOne: '', fromJson: '' };

beforeAll(async () => {
  const r = await uncola(['status']);
  if (r.code !== 0) throw new Error(`Not signed in to ${envName}; run uncola login --env ${envName} first.\n${r.stdout}`);
  if (r.json.env !== envName) throw new Error(`Expected ${envName}, but the CLI used ${r.json.env}.`);
});

afterAll(async () => {
  if (created.size) await uncola(['delete', ...created, '--yes']);
});

describe(`uncola against ${envName}`, () => {
  it('status shows the signed-in account', async () => {
    const r = await uncola(['status']);
    expect(r.json).toMatchObject({ env: envName, api: env.apiBase });
    expect(r.json.email).toContain('@');
  });

  it('log goal saves the due date and progress', async () => {
    const g = await create(['log', 'goal', `${run} Run a 5K`, '--due', '2026-12-31', '--progress', '10', '--desc', 'Couch to 5K']);
    ids.goal = g.itemId;
    expect(g).toMatchObject({ type: 'goal', title: `${run} Run a 5K`, description: 'Couch to 5K', dueDate: '2026-12-31', progress: 10, status: 'in_progress', visibility: 'Private' });
  });

  it('log activity links to a goal by part of its title and converts the time', async () => {
    const a = await create(['log', 'act', `${run} Long run`, '--goal', `${run} Run`, '--time', '1h30m', '--skills', 'Running,Pacing']);
    ids.activity = a.itemId;
    expect(a).toMatchObject({ type: 'activity', goalId: ids.goal, timeSpent: '1.5', skills: ['Running', 'Pacing'] });
  });

  it('log win saves an achievement with skills', async () => {
    const w = await create(['log', 'win', `${run} Finished my first 5K`, '--skills', 'Running']);
    ids.win = w.itemId;
    expect(w).toMatchObject({ type: 'achievement', skills: ['Running'] });
  });

  it('log 1on1 saves participants, points, action items and notes', async () => {
    const m = await create([
      'log', '1on1', `${run} Weekly with my coach`,
      '--with', 'Alex', '--point', 'Race plan', '--action', 'Book the race:2026-11-06', '--notes', 'Feeling strong',
    ]);
    ids.oneOnOne = m.itemId;
    expect(m.participants).toEqual(['Alex']);
    expect(m.discussionPoints).toEqual(['Race plan']);
    expect(m.actionItems[0]).toMatchObject({ text: 'Book the race', completed: false });
    expect(m.notes).toBe('Feeling strong');
  });

  it('log reads its fields as JSON from stdin', async () => {
    const a = await create(['log', 'activity', '--input', '-'], JSON.stringify({ title: `${run} Stretching`, description: 'From JSON' }));
    ids.fromJson = a.itemId;
    expect(a).toMatchObject({ title: `${run} Stretching`, description: 'From JSON' });
  });

  it('feed lists the new entries, and feed <type> only that type', async () => {
    const all = await uncola(['feed', '--limit', '50']);
    expect(all.code).toBe(0);
    const allIds = all.json.map((i: { itemId: string }) => i.itemId);
    for (const id of Object.values(ids)) expect(allIds).toContain(id);

    const wins = await uncola(['feed', 'win', '--limit', '50']);
    expect(wins.json.every((i: { type: string }) => i.type === 'achievement')).toBe(true);
    expect(wins.json.map((i: { itemId: string }) => i.itemId)).toContain(ids.win);
  });

  it('show finds an entry by part of its title and includes its goal', async () => {
    const r = await uncola(['show', `${run} Long run`]);
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ itemId: ids.activity, goalDetails: { id: ids.goal } });
  });

  it('goal list shows the goal with its linked activity', async () => {
    const r = await uncola(['goal', 'list']);
    const goal = r.json.find((g: { itemId: string }) => g.itemId === ids.goal);
    expect(goal).toMatchObject({ progress: 10, status: 'in_progress' });
    expect(goal.linkedActivities).toContain(ids.activity);
  });

  it('goal progress 100 completes the goal, and a lower value reopens it', async () => {
    expect((await uncola(['goal', 'progress', ids.goal, '100'])).json).toMatchObject({ progress: 100, status: 'completed' });
    expect((await uncola(['goal', 'progress', ids.goal, '60'])).json).toMatchObject({ progress: 60, status: 'in_progress' });
  });

  it('brag --dry-run draws the card without sharing', async () => {
    const r = await uncola(['brag', ids.win, '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.json.card).toContain('achievement');
    expect(r.json.card).toContain(`${run} Finished my first 5K`);
    expect(r.json.url).toBe(`${env.appBase}/shared/${ids.win}`);
    expect(r.json.postText).toContain('#Running');
  });

  it('brag --yes shares the entry and returns the link and post text', async () => {
    const r = await uncola(['brag', ids.win, '--yes']);
    expect(r.code, r.stdout).toBe(0);
    expect(r.json).toMatchObject({ itemId: ids.win, url: `${env.appBase}/shared/${ids.win}` });
    expect(r.json.publicVersion.title).toBe(`${run} Finished my first 5K`);
  });

  it('brag --yes refuses a title, and shares nothing', async () => {
    const r = await uncola(['brag', `${run} Finished`, '--yes']);
    expect(r.code).toBe(2);
    expect(r.json.error.message).toMatch(/by its ID or its #/);
  });

  it('a public entry needs --yes, and without it nothing is saved', async () => {
    const r = await uncola(['log', 'win', `${run} Public check`, '--public']);
    if (r.json?.itemId) created.add(r.json.itemId);
    expect(r.code).toBe(2);
    expect(r.json.error.code).toBe('confirmation_required');
    const feed = await uncola(['feed', 'achievement', '--limit', '50']);
    expect(JSON.stringify(feed.json)).not.toContain(`${run} Public check`);
  });

  it('recap and home summarise the account', async () => {
    const recap = await uncola(['recap', '--since', '7d']);
    expect(recap.code).toBe(0);
    expect(recap.json.counts.achievements).toBeGreaterThanOrEqual(1);
    const home = await uncola(['home']);
    expect(home.code).toBe(0);
    expect(home.json).toMatchObject({ env: envName, loggedIn: true });
  });

  it('errors have the documented exit codes', async () => {
    expect((await uncola(['show', `${run} no such entry`])).code).toBe(3);
    expect((await uncola(['goal', 'progress', ids.goal, '150'])).code).toBe(2);
    const ambiguous = await uncola(['show', run]);
    expect(ambiguous.code).toBe(2);
    expect(ambiguous.json.error.code).toBe('ambiguous');
  });

  it('delete removes the entries', async () => {
    const r = await uncola(['delete', ...created, '--yes']);
    expect(r.code).toBe(0);
    expect(r.json.deleted).toHaveLength(created.size);
    expect((await uncola(['show', ids.goal])).code).toBe(3);
    created.clear();
  });
});
