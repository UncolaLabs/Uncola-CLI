import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EnvName } from './config.ts';
import type { TokenSet } from './oauth.ts';

export type AuthScheme = 'bearer' | 'bare';

export interface StoredSession extends TokenSet {
  email?: string;
  /** How the API wants the ID token presented; learned on first API call. */
  authScheme?: AuthScheme;
}

interface CredentialsFile {
  version: 1;
  environments: Partial<Record<EnvName, StoredSession>>;
}

export function configDir(): string {
  if (process.env.UNCOLA_CONFIG_DIR) return process.env.UNCOLA_CONFIG_DIR;
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'uncola');
}

export function credentialsPath(): string {
  return join(configDir(), 'credentials.json');
}

async function readAll(): Promise<CredentialsFile> {
  try {
    const parsed = JSON.parse(await readFile(credentialsPath(), 'utf8')) as CredentialsFile;
    if (parsed?.version === 1 && parsed.environments) return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return { version: 1, environments: {} };
}

async function writeAll(data: CredentialsFile): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = credentialsPath();
  const tmp = `${path}.${process.pid}.tmp`;
  // Write with 0600 from the start so tokens are never briefly world-readable.
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}

export async function loadSession(env: EnvName): Promise<StoredSession | undefined> {
  return (await readAll()).environments[env];
}

export async function saveSession(env: EnvName, session: StoredSession): Promise<void> {
  const data = await readAll();
  data.environments[env] = session;
  await writeAll(data);
}

export async function clearSession(env: EnvName): Promise<boolean> {
  const data = await readAll();
  if (!data.environments[env]) return false;
  delete data.environments[env];
  if (Object.keys(data.environments).length === 0) {
    await rm(credentialsPath(), { force: true });
  } else {
    await writeAll(data);
  }
  return true;
}
