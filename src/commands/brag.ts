// `brag`: the app's megaphone button. Saves a public version of one entry, draws the
// same pixel-art card the app shows (SHIPPED, UNLOCKED, LVL UP), and prints the share
// link with the post text the app suggests for LinkedIn.
import { apiJson } from '../api.ts';
import type { Environment } from '../config.ts';
import { loadSession } from '../credentials.ts';
import { TYPE_PATHS, type WriteOptions } from '../entries.ts';
import { CliError } from '../errors.ts';
import { fetchFeed, resolveItem, saveLastList, titleOf, typeLabel, type FeedItem, type ItemType } from '../feed.ts';
import { emit, info } from '../output.ts';
import { askLine } from '../prompt.ts';
import { redact, type Redaction } from '../redact.ts';
import { bold, dim, mix, rgb, stripColor, termWidth, truncate, visibleLength } from '../term.ts';

export interface BragOptions extends WriteOptions {
  ai?: boolean;
  title?: string;
  message?: string;
  impact?: string;
  email?: string[];
  yes?: boolean;
}

type CardType = 'achievement' | 'activity' | 'goal';

// From the app: the banner word, its gradient and the basic colour used without 24-bit colour.
const STYLES: Record<CardType, { banner: string; gradient: [string, string]; basic: string }> = {
  achievement: { banner: 'UNLOCKED', gradient: ['#F2CC60', '#E67E22'], basic: '33' },
  activity: { banner: 'SHIPPED', gradient: ['#5BD6A0', '#1ABC9C'], basic: '32' },
  goal: { banner: 'LVL UP', gradient: ['#B07CFF', '#FF6FB5'], basic: '35' },
};

// The app's pixel font: only the letters its banners use.
const FONT: Record<string, string[]> = {
  C: ['.####', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#....', '#####'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '###'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '####.', '#....', '#....', '#....'],
  S: ['.####', '#....', '.###.', '....#', '....#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  ' ': ['..', '..', '..', '..', '..', '..'],
};

// The app's figures: a trophy, a runner and a flag.
const FIGURES: Record<CardType, string[]> = {
  achievement: ['###########', '#.#######.#', '#.#######.#', '.#.#####.#.', '...#####...', '....###....', '.....#.....', '.....#.....', '...#####...', '..#######..'],
  activity: ['........##..', '........##..', '.....####...', '....#####...', '...#.####...', '..#..###.##.', '.....###....', '....##.##...', '...##...##..', '..##.....#..', '.##......##.'],
  goal: ['##........', '#######...', '##########', '##########', '#######...', '##........', '#.........', '#.........', '#.........', '###.......'],
};

/** A 1:1 has no card of its own in the app; it gets the achievement look. */
const cardType = (type: ItemType): CardType => (type === '1on1' ? 'achievement' : type);

/** The public version, in the app's field names. */
export interface BragFields {
  title: string;
  message: string;
  skills: string[];
  impact?: string;
  timeSpent?: string;
  progress?: number;
  linkedActivities?: number;
  verifiedCount: number;
  date: number;
}

export async function brag(env: Environment, ref: string | undefined, opts: BragOptions): Promise<void> {
  const feed = await fetchFeed(env);
  const item = ref ? await findEntry(env, ref, feed, !!opts.yes && !opts.dryRun) : await pickEntry(env, feed);
  const session = await loadSession(env.name).catch(() => undefined);
  const name = handle(typeof item.userName === 'string' ? item.userName : session?.email);

  const { fields, redactions } = redact(await publicFields(env, item, opts) as unknown as Record<string, unknown>);
  const pub = fields as unknown as BragFields;
  const url = `${env.appBase}/shared/${item.itemId}`;
  const postText = linkedInText(item.type, pub, url);
  const path = `/career-feed/${TYPE_PATHS[item.type]}/${item.itemId}`;
  const prior = (item.publicVersion as { brag?: Record<string, unknown> } | undefined)?.brag ?? {};
  const body = {
    timestamp: item.timestamp,
    publicVersion: {
      title: pub.title,
      description: pub.message,
      skills: pub.skills,
      brag: { ...prior, impact: pub.impact, timeSpent: pub.timeSpent, savedAt: new Date().toISOString() },
    },
  };
  const card = bragCard(item.type, pub, { name, redacted: redactions.length });

  if (opts.dryRun) {
    // The card goes in the JSON too, plain and narrow, so an agent can show it in a chat.
    const plainCard = stripColor(bragCard(item.type, pub, { name, redacted: redactions.length }, 64));
    const human = [
      card,
      '',
      `Dry run: nothing was shared. Sharing would publish it at ${url}`,
      ...(redactions.length ? [dim(redactionNote(redactions))] : []),
      '',
      dim('Post text for LinkedIn:'),
      ...postText.split('\n').map((l) => (l ? `  ${l}` : '')),
      '',
      dim(`Request: PUT ${path}`),
      dim(JSON.stringify(body, null, 2)),
    ].join('\n');
    emit(opts, { dryRun: true, method: 'PUT', path, body, url, postText, redactions, card: plainCard }, human);
    return;
  }
  if (!opts.json) process.stdout.write(`${card}\n\n`);
  if (redactions.length && !opts.json) info(dim(redactionNote(redactions)));
  if (!opts.yes) {
    if (!process.stdin.isTTY) throw new CliError('Pass --yes to share without a prompt.', 'confirmation_required', 2);
    const answer = await askLine('Share this public version? [y/N] ', 'Cancelled; nothing was shared.');
    if (!/^y(es)?$/i.test(answer)) throw new CliError('Cancelled; nothing was shared.', 'cancelled');
  }

  await apiJson(env, path, { method: 'PUT', body: JSON.stringify(body) });
  const emailed = opts.email?.flatMap((e) => e.split(',')).map((e) => e.trim()).filter(Boolean) ?? [];
  if (emailed.length) {
    await apiJson(env, '/share-email', {
      method: 'POST',
      body: JSON.stringify({
        emails: emailed,
        sharedContent: { description: escapeHtml([pub.title, pub.message].filter(Boolean).join('\n\n')) },
        sharedBy: session?.email ?? 'Someone',
        postType: item.type,
        postUrl: url,
      }),
    });
  }

  const human = [
    `✓ Shared: ${url}`,
    ...(emailed.length ? [`✓ Emailed to ${emailed.join(', ')}`] : []),
    '',
    dim('Post text for LinkedIn:'),
    ...postText.split('\n').map((l) => (l ? `  ${l}` : '')),
  ].join('\n');
  emit(opts, { itemId: item.itemId, type: item.type, url, postText, publicVersion: body.publicVersion, redactions, emailed }, human);
}

/**
 * The entry to share. A title fragment is fine when there's a prompt to catch a wrong match, but with
 * --yes it must be an ID or a # from the last list, as for delete.
 */
async function findEntry(env: Environment, ref: string, feed: FeedItem[], noPrompt: boolean): Promise<FeedItem> {
  if (!noPrompt) return resolveItem(env, ref, undefined, feed, true);
  try {
    return await resolveItem(env, ref, undefined, feed, false);
  } catch (err) {
    if (err instanceof CliError && ['not_found', 'usage'].includes(err.code) && !/^#?\d+$/.test(ref)) {
      throw new CliError(`With --yes, name the entry by its ID or its # from the last list, not by its title ("${ref}"). Run without --yes to pick it by title.`, 'usage', 2);
    }
    throw err;
  }
}

/** No entry given: number the latest entries and ask which one. */
async function pickEntry(env: Environment, feed: FeedItem[]): Promise<FeedItem> {
  if (!process.stdin.isTTY) throw new CliError('Which entry? Use: brag <# from the last list, or part of the title>', 'usage', 2);
  const recent = feed.slice(0, 10);
  if (!recent.length) throw new CliError('Nothing to brag about yet. Try: log win <what you did>', 'not_found', 3);
  await saveLastList(env, recent);
  process.stdout.write(`${bold('Brag about which entry?')}\n`);
  recent.forEach((i, n) => process.stdout.write(`  ${String(n + 1).padStart(2)}. ${dim(typeLabel(i.type).padEnd(12))}${truncate(titleOf(i), termWidth() - 20)}\n`));
  for (;;) {
    const answer = await askLine(`Number ${dim(`(1–${recent.length})`)}: `, 'Cancelled; nothing was shared.');
    const pick = recent[Number(answer) - 1];
    if (pick) return pick;
    if (!answer) throw new CliError('Cancelled; nothing was shared.', 'cancelled');
  }
}

/**
 * What goes public: an earlier public version if there is one, else the entry's own text;
 * --ai asks Uncola AI to rewrite it (as the app's "Create with AI"); flags override either.
 */
async function publicFields(env: Environment, item: FeedItem, opts: BragOptions): Promise<BragFields> {
  const pv = item.publicVersion as { title?: string; description?: string; skills?: string[]; brag?: { impact?: string } } | undefined;
  const own = !opts.ai && pv?.title ? pv : undefined;
  const skills = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  let title = own?.title ?? titleOf(item);
  let message = String(own ? (own.description ?? '') : (item.description ?? item.notes ?? ''));
  let tags = skills(own?.skills ?? item.skills);
  let impact = own?.brag?.impact ?? (typeof item.impact === 'string' ? item.impact : undefined);

  if (opts.ai) {
    const ai = await enhance(env, item.type, { title, description: message, skills: tags });
    title = ai.title || title;
    message = ai.content || ai.description || message;
    tags = skills(ai.skills).length ? skills(ai.skills) : tags;
    impact = ai.impact || impact;
  }
  if (opts.title) title = opts.title;
  if (opts.message) message = opts.message;
  if (opts.impact) impact = opts.impact;

  const spent = String(item.timeSpent ?? '').trim();
  return {
    title,
    message: message.slice(0, item.type === '1on1' ? 1000 : 280),
    skills: tags,
    impact: item.type === 'achievement' ? impact : undefined,
    timeSpent: item.type === 'activity' && spent ? (/^\d+(\.\d+)?$/.test(spent) ? `${spent}h` : spent) : undefined,
    progress: item.type === 'goal' ? Number(item.progress) || 0 : undefined,
    linkedActivities: item.type === 'goal' ? [item.linkedActivities, item.activities].find(Array.isArray)?.length : undefined,
    verifiedCount: Number(item.verifiedCount) || (item.verified ? 1 : 0),
    date: item.timestamp,
  };
}

interface Enhanced {
  title?: string;
  description?: string;
  content?: string;
  skills?: unknown;
  impact?: string;
}

async function enhance(env: Environment, type: ItemType, card: { title: string; description: string; skills: string[] }): Promise<Enhanced> {
  // The app asks for at least 5 words before it calls the AI.
  const words = card.description.trim().split(/\s+/).filter(Boolean).length;
  if (words < 5) throw new CliError(`--ai needs a description of at least 5 words; this one has ${words}.`, 'usage', 2);
  const res = await apiJson<{ data?: { enhanced?: Enhanced } }>(env, `/bedrock/enhance/${type}`, {
    method: 'POST',
    body: JSON.stringify({ cardData: card, cardType: type, enhancementType: 'create-public' }),
  });
  const out = res?.data?.enhanced;
  if (!out) throw new CliError('Uncola AI returned nothing; try again, or share your own text without --ai.', 'bad_response');
  return out;
}

/** The app's suggested post: a headline, the link, and up to two skill hashtags. */
export function linkedInText(type: ItemType, f: BragFields, url: string): string {
  const verified = f.verifiedCount > 0 ? ` Verified by ${f.verifiedCount} colleague${f.verifiedCount === 1 ? '' : 's'}.` : '';
  const p = Math.round(f.progress ?? 0);
  const headline =
    type === 'activity' ? `Shipped 🚀${verified}`
    : type === 'goal' ? (p >= 100 ? 'Goal reached 🎯' : p > 0 ? `${p}% of the way to my goal 🎯` : 'New goal set 🎯')
    : `New win unlocked 🏆${verified}`;
  // "Cloud architecture" → #CloudArchitecture; "Node.js" → #Nodejs, as the app writes it.
  const tag = (skill: string) =>
    skill.split(/[\s_-]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/[^\p{L}\p{N}]/gu, '');
  const tags = f.skills.map((s) => `#${tag(s)}`).filter((t) => t.length > 1).slice(0, 2);
  return [headline, url, (tags.length ? tags : ['#Uncola']).join(' ')].join('\n\n');
}

/** "Alex Smith" or "alex@example.com" → "alex", as on the card's first line. */
function handle(name: string | undefined): string {
  return (name ?? 'me').split(/[\s@]/)[0]!.toLowerCase().replace(/[^a-z0-9]/g, '') || 'me';
}

function redactionNote(r: Redaction[]): string {
  return `Redacted for the public version: ${r.map((x) => `${x.reason} (${x.original} → ${x.replacement})`).join('; ')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Drawing

/** Pixel rows → text: two pixel rows per line with half blocks, or each pixel two cells wide. */
export function pixelArt(rows: string[], colourAt: (col: number) => (s: string) => string, scale: 'half' | 'double'): string[] {
  const width = Math.max(...rows.map((r) => r.length));
  const on = (r: number, c: number) => rows[r]?.[c] === '#';
  const out: string[] = [];
  if (scale === 'double') {
    for (let r = 0; r < rows.length; r++) {
      out.push(Array.from({ length: width }, (_, c) => (on(r, c) ? colourAt(c)('██') : '  ')).join(''));
    }
  } else {
    for (let r = 0; r < rows.length; r += 2) {
      out.push(Array.from({ length: width }, (_, c) => {
        const ch = on(r, c) && on(r + 1, c) ? '█' : on(r, c) ? '▀' : on(r + 1, c) ? '▄' : ' ';
        return ch === ' ' ? ch : colourAt(c)(ch);
      }).join(''));
    }
  }
  return out.map((l) => l.replace(/\s+$/, ''));
}

/** The banner word set in the pixel font, as pixel rows. */
export function bannerPixels(word: string): string[] {
  const glyphs = [...word.toUpperCase()].map((ch) => FONT[ch] ?? FONT[' ']!);
  return Array.from({ length: 6 }, (_, r) => glyphs.map((g) => g[r]).join('.'));
}

/** Wraps to `width`, at most `max` lines; the last line ends in … when text is left over. */
function wrap(text: string, width: number, max: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if ([...next].length <= width) {
      line = next;
      continue;
    }
    if (lines.length === max - 1) {
      lines.push(truncate(`${line} ${words.slice(i).join(' ')}`.trim(), width));
      return lines;
    }
    if (line) lines.push(line);
    line = [...words[i]!].length > width ? truncate(words[i]!, width) : words[i]!;
  }
  if (line) lines.push(line);
  return lines.slice(0, max);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The app's brag card, drawn for the terminal. */
export function bragCard(type: ItemType, f: BragFields, meta: { name: string; redacted?: number }, total = termWidth()): string {
  const t = cardType(type);
  const { banner, gradient, basic } = STYLES[t];
  const width = Math.max(40, Math.min(78, total));
  const inner = width - 4;
  const accent = rgb(gradient[1], basic);
  const light = rgb(gradient[0], basic);
  const border = rgb('#3A4766', '2');
  const check = rgb('#5BD6A0', '32');

  const bannerRows = bannerPixels(banner);
  const bw = bannerRows[0]!.length;
  // The banner may be wider than the card: full size wherever the terminal fits it.
  const scale = bw * 2 + 1 <= total ? 'double' : 'half';
  const shade = (c: number) => rgb(mix(gradient[0], gradient[1], bw > 1 ? c / (bw - 1) : 0), basic);
  const top = pixelArt(bannerRows, shade, scale).map((l) => ` ${l}`);

  const figure = pixelArt(FIGURES[t], () => light, 'half');
  const figWidth = Math.max(...FIGURES[t].map((r) => r.length));
  const textWidth = inner - figWidth - 2;

  const d = new Date(f.date);
  const header = [`${meta.name}@career`, type === '1on1' ? '1:1' : type, Number.isNaN(d.getTime()) ? '' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`]
    .filter(Boolean)
    .join('  ·  ');
  const text: string[] = [`${accent('✦')} ${dim(truncate(header, textWidth - 2))}`, ''];
  for (const l of wrap(f.title, textWidth - 2, 2)) text.push(`  ${bold(l)}`);
  const message: string[] = [];
  // An entry logged with only a title has the same text as its message; show it once.
  const same = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const body = same(f.message) === same(f.title) ? '' : f.message;
  for (const para of body.split(/\r?\n/).map((p) => p.trim()).filter(Boolean)) {
    if (message.length < 5) message.push(...wrap(para, textWidth - 2, 5 - message.length));
  }
  for (const l of message) text.push(`  ${l}`);

  const stats = statRows(t, f);
  if (stats.length) text.push('');
  for (const s of stats) {
    const label = `  ${accent('▸')} ${dim(s.label.padEnd(12))}`;
    if (s.bar !== undefined) {
      const filled = Math.round((s.bar / 100) * 20);
      const rest = process.stdout.isTTY && !process.env.NO_COLOR ? '━' : '─';
      text.push(`${label}${light('━'.repeat(filled))}${border(rest.repeat(20 - filled))}  ${s.bar}%`);
    } else if (s.check) {
      text.push(`${label}${check(s.check === 2 ? '✓✓' : '✓')} ${truncate(s.value!, textWidth - 20)}`);
    } else {
      text.push(`${label}${truncate(s.value!, textWidth - 17)}`);
    }
  }

  // The figure sits at the right, vertically centred beside the text.
  const height = Math.max(text.length, figure.length);
  const offset = Math.floor((height - figure.length) / 2);
  const line = (s: string) => `${border('│')} ${s}${' '.repeat(Math.max(0, inner - visibleLength(s)))} ${border('│')}`;
  const rows = Array.from({ length: height }, (_, i) => {
    const left = text[i] ?? '';
    const fig = figure[i - offset] ?? '';
    return line(`${left}${' '.repeat(Math.max(0, textWidth - visibleLength(left)))}  ${fig}`);
  });

  const lock = meta.redacted ? dim(`  ${meta.redacted} detail${meta.redacted === 1 ? '' : 's'} redacted`) : '';
  const footer = `${lock}${' '.repeat(Math.max(1, width - visibleLength(lock) - 9))}${dim('uncola.ai')}`;
  return [...top, '', border(`╭${'─'.repeat(width - 2)}╮`), ...rows, border(`╰${'─'.repeat(width - 2)}╯`), footer].join('\n');
}

function statRows(t: CardType, f: BragFields): { label: string; value?: string; bar?: number; check?: number }[] {
  const verified = f.verifiedCount > 0 ? { label: 'verified', value: `${f.verifiedCount} colleague${f.verifiedCount === 1 ? '' : 's'}`, check: f.verifiedCount > 1 ? 2 : 1 } : null;
  const stack = f.skills.length ? { label: 'stack', value: f.skills.slice(0, 4).join(' · ') } : null;
  const rows = {
    achievement: [f.impact ? { label: 'impact', value: f.impact } : null, stack, verified],
    activity: [f.timeSpent ? { label: 'time', value: f.timeSpent } : null, stack, verified],
    goal: [
      { label: 'progress', bar: Math.max(0, Math.min(100, Math.round(f.progress ?? 0))) },
      f.linkedActivities ? { label: 'activities', value: `${f.linkedActivities} linked` } : null,
      verified,
    ],
  }[t];
  return rows.filter((r): r is NonNullable<typeof r> => !!r);
}
