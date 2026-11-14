import { CliError } from './errors.ts';
import { cleanText } from './term.ts';

export interface OutputOptions {
  json?: boolean;
}

/** Prints a result: the data as JSON with --json, otherwise the human-readable text. */
export function emit(opts: OutputOptions, data: unknown, human: string): void {
  if (opts.json) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  else process.stdout.write(human + '\n');
}

/** Progress and prompts go to stderr so stdout stays clean for --json consumers. */
export function info(message: string): void {
  process.stderr.write(message + '\n');
}

export function emitError(opts: OutputOptions, err: unknown): number {
  const e = err instanceof CliError ? err : new CliError((err as Error)?.message ?? String(err), 'internal');
  if (opts.json) {
    process.stdout.write(JSON.stringify({ error: { code: e.code, message: e.message } }, null, 2) + '\n');
  } else {
    process.stderr.write(`✗ ${cleanText(e.message)}\n`);
  }
  return e.exitCode;
}
