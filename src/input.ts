import { readFile } from 'node:fs/promises';
import { CliError } from './errors.ts';

/** Reads a JSON object of option values from a file, or stdin when path is "-". */
export async function readInput(path: string | undefined): Promise<Record<string, unknown>> {
  if (!path) return {};
  let text: string;
  if (path === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    text = await readFile(path, 'utf8');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new CliError(`--input is not valid JSON: ${(err as Error).message}`, 'usage', 2);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError('--input must be a JSON object', 'usage', 2);
  }
  return parsed as Record<string, unknown>;
}

/** Flags win over --input values; undefined flags fall back to the JSON. */
export function merge<T extends object>(input: Record<string, unknown>, flags: T): T {
  const out: Record<string, unknown> = { ...input };
  if ('description' in out && !('desc' in out)) out.desc = out.description;
  for (const [k, v] of Object.entries(flags)) {
    if (v !== undefined && !(Array.isArray(v) && v.length === 0 && k in input)) out[k] = v;
  }
  return out as T;
}

export function asList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map(String).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

export function asRepeatable(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
}
