import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { CommanderError } from 'commander';
import { resolveEnv } from './config.ts';
import { configDir, loadSession } from './credentials.ts';
import { emitError } from './output.ts';
import { banner, home } from './commands/home.ts';
import { buildProgram, normalizeArgs } from './program.ts';
import { shellSplit } from './shellwords.ts';
import { dim } from './term.ts';

const HISTORY_SIZE = 500;

const COMPLETIONS = [
  'home', 'help', 'log goal', 'log activity', 'log achievement', 'log win', 'log 1on1', 'log 1on1 with ',
  'feed', 'feed goal', 'feed activity', 'feed achievement', 'feed 1on1', 'list', 'show', 'get',
  'goal', 'goal list', 'goal progress', 'activity', 'activity list', 'achievement', 'achievement list', '1on1', '1on1 list',
  'brag', 'share', 'recap', 'edit', 'update', 'delete', 'rm', 'status', 'login', 'logout', 'clear', 'exit',
];

function completer(line: string): [string[], string] {
  const hits = COMPLETIONS.filter((c) => c.startsWith(line));
  return [hits.length ? hits : COMPLETIONS, line];
}

const historyPath = () => join(configDir(), 'history');

async function loadHistory(): Promise<string[]> {
  try {
    // readline wants newest first.
    return (await readFile(historyPath(), 'utf8')).split('\n').filter(Boolean).reverse().slice(0, HISTORY_SIZE);
  } catch {
    return [];
  }
}

async function saveHistory(history: string[]): Promise<void> {
  try {
    await mkdir(configDir(), { recursive: true, mode: 0o700 });
    await writeFile(historyPath(), [...history].slice(0, HISTORY_SIZE).reverse().join('\n') + '\n', { mode: 0o600 });
    await chmod(historyPath(), 0o600);
  } catch {
    // History is a convenience; never fail the session over it.
  }
}

/**
 * Reads one line. Resolves null on Ctrl-D, and '' on Ctrl-C (clears the line, like a shell).
 * A fresh readline per line keeps it from fighting with prompts inside commands (rm, login).
 */
async function readLine(history: string[]): Promise<{ line: string | null; history: string[] }> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, history, historySize: HISTORY_SIZE, completer });
  let settled = false;
  const line = await new Promise<string | null>((resolve) => {
    const done = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    rl.once('SIGINT', () => {
      process.stdout.write('^C\n');
      done('');
    });
    rl.once('close', () => done(null));
    rl.question('uncola> ').then(done, () => done(null));
  });
  const next = (rl as unknown as { history: string[] }).history ?? history;
  rl.close();
  return { line, history: next };
}

export async function startRepl(): Promise<void> {
  const env = resolveEnv();
  try {
    await home(env, buildProgram().version() ?? '', { inRepl: true });
  } catch (err) {
    // Still open the shell when the dashboard can't load (offline, expired login).
    const session = await loadSession(env.name).catch(() => undefined);
    process.stdout.write(banner(buildProgram().version() ?? '', env, session?.email) + '\n');
    emitError({}, err);
  }
  process.stdout.write(dim('\nType a command without "uncola". Tab completes, help lists commands, exit or Ctrl-D quits.\n'));

  let history = await loadHistory();
  for (;;) {
    const read = await readLine(history);
    history = read.history;
    if (read.line === null) {
      process.stdout.write('\n');
      break;
    }
    const line = read.line.trim().replace(/^uncola\s+/, '');
    if (!line) continue;
    if (line === 'exit' || line === 'quit') break;
    if (line === 'clear') {
      process.stdout.write('\x1b[2J\x1b[H');
      continue;
    }

    let args: string[];
    try {
      args = normalizeArgs(shellSplit(line));
    } catch (err) {
      emitError({}, err);
      continue;
    }

    const program = buildProgram(true);
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      // Commander has already printed usage errors and help; anything else is unexpected.
      if (!(err instanceof CommanderError)) emitError({}, err);
    }
    process.exitCode = 0; // one failed command shouldn't make the session exit non-zero
  }
  await saveHistory(history);
}
