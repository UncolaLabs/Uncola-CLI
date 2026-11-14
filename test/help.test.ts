import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { buildProgram } from '../src/program.ts';

/** Every command that does something, with its full name, e.g. "log activity". */
function commands(cmd: Command, path: string[] = []): [string, Command][] {
  return cmd.commands.flatMap((c) => {
    const here = [...path, c.name()];
    return [[here.join(' '), c] as [string, Command], ...commands(c, here)];
  });
}

function help(cmd: Command): string {
  let out = '';
  cmd.configureOutput({ writeOut: (s) => (out += s) });
  cmd.outputHelp();
  return out;
}

describe('help examples', () => {
  const skip = new Set(['help', 'home']);

  it('every command shows examples', () => {
    for (const [name, cmd] of commands(buildProgram())) {
      if (skip.has(name)) continue;
      expect(help(cmd), name).toMatch(/\nExamples:\n {2}uncola /);
    }
  });

  it('splits long examples one flag per line, but keeps them on one line in the shell', () => {
    const find = (p: Command) => p.commands.find((c) => c.name() === 'log')!.commands.find((c) => c.name() === 'activity')!;
    expect(help(find(buildProgram()))).toContain(' \\\n      --goal blog \\\n      --time 3h');
    expect(help(find(buildProgram(true)))).toContain('  log activity "Published draft: data analytics pipeline blog post" --goal blog --time 3h');
  });
});

describe('help', () => {
  it('prints every command, with no --all option', async () => {
    let out = '';
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => ((out += String(chunk)), true)) as typeof process.stdout.write;
    try {
      await buildProgram().parseAsync(['node', 'uncola', 'help']);
    } finally {
      process.stdout.write = write;
    }
    for (const name of ['home', 'log', 'feed', 'show', 'goal', 'brag', 'recap', 'delete', 'login', 'logout', 'status']) {
      expect(out, name).toMatch(new RegExp(`\\n  ${name}[ |]`));
    }
    expect(out).not.toContain('--all');
  });
});
