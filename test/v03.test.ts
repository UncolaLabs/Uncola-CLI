import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bannerPixels, bragCard, linkedInText, type BragFields } from '../src/commands/brag.ts';
import { recapCard, summarize } from '../src/commands/recap.ts';
import { feedTable } from '../src/commands/feed.ts';
import { fetchGoals, goalTable } from '../src/commands/goal.ts';
import { joinWords, parseWithLine } from '../src/commands/log.ts';
import { ENVIRONMENTS } from '../src/config.ts';
import { saveSession } from '../src/credentials.ts';
import { parseWhen, toDay } from '../src/dates.ts';
import { quickTitle } from '../src/entries.ts';
import { redact } from '../src/redact.ts';
import { resolveItem, saveLastList, typeFromWord, type FeedItem, type ItemType } from '../src/feed.ts';
import { callbackPage } from '../src/page.ts';
import { normalizeArgs } from '../src/program.ts';

const dev = ENVIRONMENTS.dev;
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'uncola-test-'));
  vi.stubEnv('UNCOLA_CONFIG_DIR', dir);
  vi.stubEnv('NO_COLOR', '1');
  await saveSession('dev', { idToken: 'id', accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000, authScheme: 'bearer' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

const item = (itemId: string, type: ItemType, title: string, extra: Partial<FeedItem> = {}): FeedItem => ({
  itemId, type, title, timestamp: Date.UTC(2026, 9, 20, 12), ...extra,
});

describe('dates from any client', () => {
  it('reads every due-date shape as a day', () => {
    expect(toDay('2026-11-30')).toBe('2026-11-30');
    expect(toDay('2026-11-30T00:00:00.000Z')).toBe('2026-11-30');
    expect(toDay(Date.UTC(2026, 10, 30, 12))).toBe('2026-11-30');
    expect(toDay(Date.UTC(2026, 10, 30, 12) / 1000)).toBe('2026-11-30');
    expect(toDay({ seconds: Date.UTC(2026, 10, 30, 12) / 1000 })).toBe('2026-11-30');
    expect(toDay(null)).toBeUndefined();
    expect(toDay('')).toBeUndefined();
  });

  it("sorts goals whose dueDate isn't a string (Nir's crash)", async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        goals: [
          { itemId: 'a', title: 'Epoch due', dueDate: Date.UTC(2027, 0, 5), timestamp: 1 },
          { itemId: 'b', title: 'No due', dueDate: null, timestamp: 2 },
          { itemId: 'c', title: 'String due', dueDate: '2026-12-01', timestamp: 3 },
          { itemId: 'd', title: 'Object due', dueDate: { seconds: Date.UTC(2026, 10, 1) / 1000 }, timestamp: 4 },
        ],
      }),
    );
    const { goals } = await fetchGoals(dev);
    expect(goals.map((g) => g.title)).toEqual(['Object due', 'String due', 'Epoch due', 'No due']);
    expect(goalTable(goals)).toContain('2027-01-05  Epoch due');
  });

  it("rejects future dates like the bots' forms", () => {
    const now = new Date('2026-10-19T15:30:00Z');
    expect(() => parseWhen('2026-10-25', now)).toThrow(/in the future/);
    expect(() => parseWhen('2026-10-25T09:00:00Z', now)).toThrow(/in the future/);
    expect(parseWhen('2026-10-19', now).timestamp).toBeLessThanOrEqual(now.getTime());
  });
});

describe("the bots' words", () => {
  it('maps type words', () => {
    expect(typeFromWord('win')).toBe('achievement');
    expect(typeFromWord('ACH')).toBe('achievement');
    expect(typeFromWord('act')).toBe('activity');
    expect(typeFromWord('1:1')).toBe('1on1');
    expect(typeFromWord('meeting')).toBe('1on1');
    expect(typeFromWord('nope')).toBeUndefined();
  });

  it('rewrites two-word sign-in commands and lowercases command words', () => {
    expect(normalizeArgs(['sign', 'in'])).toEqual(['login']);
    expect(normalizeArgs(['Log', 'Out'])).toEqual(['logout']);
    expect(normalizeArgs(['LOG', 'Win', 'Shipped', 'It'])).toEqual(['log', 'win', 'Shipped', 'It']);
    expect(normalizeArgs(['Feed'])).toEqual(['feed']);
    expect(normalizeArgs(['--json', 'feed'])).toEqual(['--json', 'feed']);
  });

  it('parses the 1:1 one-liner', () => {
    expect(parseWithLine('with Sarah: growth plan')).toEqual({ participants: ['Sarah'], notes: 'growth plan' });
    expect(parseWithLine('with Sarah and Tom, Ana: Q1: plan')).toEqual({ participants: ['Sarah', 'Tom', 'Ana'], notes: 'Q1: plan' });
    expect(parseWithLine('Weekly sync')).toBeUndefined();
  });

  it('uses the text as title (200 chars max) and as the default description', () => {
    expect(joinWords(['Shipped', 'the', 'CLI'])).toBe('Shipped the CLI');
    expect(quickTitle('Shipped the CLI')).toEqual({ title: 'Shipped the CLI', description: 'Shipped the CLI' });
    expect(quickTitle('t', 'details')).toEqual({ title: 't', description: 'details' });
    const long = 'x'.repeat(250);
    expect(quickTitle(long)).toEqual({ title: 'x'.repeat(200), description: long });
  });
});

describe('row numbers instead of IDs', () => {
  const feed = [
    item('11111111-aaaa', 'goal', 'Ship CLI', { description: 'v1 for Nir' }),
    item('22222222-bbbb', 'activity', 'Wrote README'),
  ];

  it('lists rows by number, with a description snippet and no IDs', () => {
    const text = feedTable(feed, {}, 100);
    expect(text).toMatch(/^#  TYPE/);
    expect(text).toContain('1  Goal');
    expect(text).toContain('Ship CLI · v1 for Nir');
    expect(text).not.toContain('11111111');
    expect(feedTable(feed, { ids: true }, 100)).toContain('11111111');
  });

  it('resolves a row number from the last list', async () => {
    await saveLastList(dev, feed);
    expect((await resolveItem(dev, '2', undefined, feed)).title).toBe('Wrote README');
    expect((await resolveItem(dev, '#1', undefined, feed)).title).toBe('Ship CLI');
    await expect(resolveItem(dev, '2', 'goal', feed)).rejects.toThrow(/an activity, not a goal/);
    await expect(resolveItem(dev, '9', undefined, feed)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('explains when there is no list to number from', async () => {
    await expect(resolveItem(dev, '1', undefined, feed)).rejects.toThrow(/No list to take row 1 from/);
  });
});

describe('recap', () => {
  it('summarizes a period and draws a card', () => {
    const now = Date.UTC(2026, 9, 26);
    const items = [
      item('a', 'achievement', 'Spoke at a summit', { skills: ['Speaking'], endorsements: [{}, {}] }),
      item('b', 'activity', 'Practice exam', { timeSpent: '2.5', skills: ['Cloud', 'Speaking'] }),
      item('c', 'activity', 'Too old', { timestamp: Date.UTC(2025, 0, 1), timeSpent: '9' }),
    ];
    const goals = [{ itemId: 'g', title: 'Get certified', progress: 40, dueDate: '2026-12-15', timestamp: 1 }];
    const b = summarize(items, goals, Date.UTC(2026, 6, 28), now, 'you@example.com');
    expect(b.counts).toMatchObject({ achievements: 1, activities: 1 });
    expect(b.hoursLogged).toBe(2.5);
    expect(b.endorsements).toBe(2);
    expect(b.topSkills).toEqual(['Speaking', 'Cloud']);
    const card = recapCard(b, 60);
    expect(card).toContain('RECAP');
    expect(card).toContain('Spoke at a summit');
    expect(card.split('\n').every((l) => [...l].length === 60)).toBe(true);
  });
});

describe('brag', () => {
  const fields: BragFields = {
    title: 'Shipped the CLI',
    message: 'Released the first build of the Uncola command line for review.',
    skills: ['TypeScript', 'Node.js', 'CLI'],
    timeSpent: '2h',
    verifiedCount: 0,
    date: Date.UTC(2026, 9, 26),
  };

  it('sets the banner in the app font', () => {
    const rows = bannerPixels('SHIPPED');
    expect(rows).toHaveLength(6);
    expect(rows[0]).toBe('.####.#...#.###.####..####..#####.####.');
  });

  it('draws the card at the width it is given', () => {
    for (const width of [50, 78]) {
      const card = bragCard('activity', fields, { name: 'alex', redacted: 1 }, width).split('\n');
      const box = card.filter((l) => /^[│╭╰]/.test(l));
      expect(box.every((l) => [...l].length === width)).toBe(true);
      expect(card.join('\n')).toContain(width === 78 ? 'alex@career  ·  activity  ·  Oct 2026' : 'alex@career');
      expect(card.join('\n')).toContain('1 detail redacted');
    }
  });

  it('suggests the app’s post text', () => {
    const url = 'https://app.uncola.ai/shared/x';
    expect(linkedInText('activity', fields, url)).toBe(`Shipped 🚀\n\n${url}\n\n#TypeScript #Nodejs`);
    expect(linkedInText('achievement', { ...fields, skills: ['Cloud architecture', 'AI/ML'] }, url)).toBe(`New win unlocked 🏆\n\n${url}\n\n#CloudArchitecture #AIML`);
    expect(linkedInText('goal', { ...fields, skills: [], progress: 40 }, url)).toBe(`40% of the way to my goal 🎯\n\n${url}\n\n#Uncola`);
    expect(linkedInText('achievement', { ...fields, skills: [], verifiedCount: 2 }, url)).toMatch(/^New win unlocked 🏆 Verified by 2 colleagues\./);
  });
});

describe('redaction', () => {
  it('hides what the app hides', () => {
    const { fields, redactions } = redact({ title: 'Fixed OPS-142', message: 'See https://x.io, mail a@b.co, saved $1.2m on 10.0.0.1 for db.corp' });
    expect(fields.title).toBe('Fixed [ticket]');
    expect(fields.message).toBe('See [link] mail [email], saved a 7-figure sum on [IP address] for [internal host]');
    expect(redactions.map((r) => r.reason)).toEqual(['ticket id', 'link', 'email address', 'internal host name', 'IP address', 'exact amount']);
  });

  it('leaves ordinary numbers alone', () => {
    expect(redact({ message: 'Cut build time from 12 to 4 minutes in 2026' }).redactions).toEqual([]);
  });
});

describe('sign-in page', () => {
  it('is branded and escapes nothing it shouldn’t', () => {
    const html = callbackPage(true, "You're connected", 'Close this tab.');
    expect(html).toContain('Uncola');
    expect(html).toContain('#E67E22');
    expect(html).toContain("You're connected");
  });
});
