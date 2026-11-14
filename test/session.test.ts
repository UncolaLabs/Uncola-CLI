import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../src/api.ts';
import { ENVIRONMENTS } from '../src/config.ts';
import { clearSession, credentialsPath, loadSession, saveSession } from '../src/credentials.ts';
import { getSession } from '../src/session.ts';

const dev = ENVIRONMENTS.dev;
const fresh = () => ({ idToken: 'id', accessToken: 'acc', refreshToken: 'ref', expiresAt: Date.now() + 3600_000 });
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'uncola-test-'));
  vi.stubEnv('UNCOLA_CONFIG_DIR', dir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('credentials', () => {
  it('stores sessions per environment with mode 0600', async () => {
    await saveSession('dev', { ...fresh(), email: 'a@b.c' });
    expect((await stat(credentialsPath())).mode & 0o777).toBe(0o600);
    expect(await loadSession('dev')).toMatchObject({ email: 'a@b.c' });
    expect(await loadSession('prod')).toBeUndefined();
    expect(await clearSession('dev')).toBe(true);
    expect(await loadSession('dev')).toBeUndefined();
  });
});

describe('getSession', () => {
  it('throws when not logged in', async () => {
    await expect(getSession(dev)).rejects.toMatchObject({ code: 'not_logged_in' });
  });

  it('refreshes an expired token and saves it', async () => {
    await saveSession('dev', { ...fresh(), expiresAt: Date.now() - 1000 });
    vi.stubGlobal('fetch', async () => Response.json({ id_token: 'new-id', access_token: 'new-acc', expires_in: 3600 }));
    const s = await getSession(dev);
    expect(s).toMatchObject({ idToken: 'new-id', refreshToken: 'ref' });
    expect((await loadSession('dev'))?.idToken).toBe('new-id');
  });

  it('asks for login again when the refresh token expired', async () => {
    await saveSession('dev', { ...fresh(), expiresAt: 0 });
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(getSession(dev)).rejects.toMatchObject({ code: 'session_expired' });
  });
});

describe('apiFetch auth scheme', () => {
  it('falls back from Bearer to a bare token and remembers it', async () => {
    await saveSession('dev', fresh());
    const seen: (string | null)[] = [];
    vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
      const auth = new Headers(init.headers).get('Authorization');
      seen.push(auth);
      return new Response('{}', { status: auth === 'id' ? 200 : 401 });
    });
    expect((await apiFetch(dev, '/profile/companies')).status).toBe(200);
    expect(seen).toEqual(['Bearer id', 'id']);
    expect((await loadSession('dev'))?.authScheme).toBe('bare');

    seen.length = 0;
    await apiFetch(dev, '/profile/companies');
    expect(seen).toEqual(['id']);
  });

  it('remembers Bearer when it works first', async () => {
    await saveSession('dev', fresh());
    vi.stubGlobal('fetch', async () => new Response('{}'));
    await apiFetch(dev, '/x');
    expect((await loadSession('dev'))?.authScheme).toBe('bearer');
  });
});
