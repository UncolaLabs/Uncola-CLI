import { createInterface } from 'node:readline/promises';
import { CliError } from './errors.ts';

/**
 * Asks one question on the terminal. Ctrl-C cancels with `cancelled` (and only the
 * question, inside the shell). Prompts go to stderr so --json output stays clean.
 */
export async function askLine(question: string, cancelled: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const abort = new AbortController();
  rl.on('SIGINT', () => abort.abort());
  rl.on('close', () => abort.abort());
  try {
    return (await rl.question(question, { signal: abort.signal })).trim();
  } catch (err) {
    if (abort.signal.aborted) {
      process.stderr.write('\n');
      throw new CliError(cancelled, 'cancelled');
    }
    throw err;
  } finally {
    rl.close();
  }
}
