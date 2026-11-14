#!/usr/bin/env node
// Check Node before loading anything else, so an old Node gets a clear message instead of a crash.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  process.stderr.write(
    `uncola needs Node.js 22.12 or newer, and this is ${process.version}.\n` +
      'Install the LTS version from https://nodejs.org, or with nvm: nvm install 22\n',
  );
  process.exit(1);
}

const { buildProgram, normalizeArgs } = await import('./program.ts');

// Bare `uncola` in a terminal starts the interactive shell; anything else runs one command.
if (process.argv.length <= 2 && process.stdin.isTTY) {
  const { startRepl } = await import('./repl.ts');
  await startRepl();
} else {
  await buildProgram().parseAsync(normalizeArgs(process.argv.slice(2)), { from: 'user' });
}
