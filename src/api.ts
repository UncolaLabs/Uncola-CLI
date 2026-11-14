import type { Environment } from './config.ts';
import { saveSession, type AuthScheme, type StoredSession } from './credentials.ts';
import { CliError } from './errors.ts';
import { forceRefresh, getSession } from './session.ts';
import { cleanText } from './term.ts';

function authHeader(scheme: AuthScheme, idToken: string): string {
  return scheme === 'bearer' ? `Bearer ${idToken}` : idToken;
}

/**
 * Calls the Uncola API with the stored ID token. The API's authorizer format isn't
 * documented (bare token vs "Bearer"), so on first use we try both and remember
 * whichever works.
 */
export async function apiFetch(env: Environment, path: string, init: RequestInit = {}): Promise<Response> {
  let session = await getSession(env);

  const send = (s: StoredSession, scheme: AuthScheme) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', authHeader(scheme, s.idToken));
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(new URL(path, env.apiBase), { ...init, headers });
  };

  const known = session.authScheme;
  if (known) {
    let res = await send(session, known);
    if (res.status !== 401) return res;
    // Maybe revoked or clock skew: refresh once and retry.
    session = await forceRefresh(env, session);
    res = await send(session, known);
    if (res.status !== 401) return res;
    throw unauthorized(env);
  }

  for (const scheme of ['bearer', 'bare'] as const) {
    const res = await send(session, scheme);
    if (res.status !== 401) {
      if (res.ok) await saveSession(env.name, { ...session, authScheme: scheme });
      return res;
    }
  }
  throw unauthorized(env);
}

export async function apiJson<T>(env: Environment, path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(env, path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new CliError(`API ${init?.method ?? 'GET'} ${path} failed: HTTP ${res.status} ${cleanText(text.slice(0, 200))}`, `http_${res.status}`);
  }
  // Every string the server sends is cleaned here, so no command can print raw escape sequences.
  return (text ? JSON.parse(text, (_key, value: unknown) => (typeof value === 'string' ? cleanText(value) : value)) : undefined) as T;
}

function unauthorized(env: Environment): CliError {
  return new CliError(`The ${env.name} API rejected your token. Run: uncola login`, 'unauthorized', 4);
}
