import type { Environment } from './config.ts';
import { loadSession, saveSession, type StoredSession } from './credentials.ts';
import { CliError, NotLoggedInError } from './errors.ts';
import { refreshTokens } from './oauth.ts';

/** Refresh this long before expiry so a token doesn't lapse mid-request. */
const EXPIRY_SKEW_MS = 60_000;

/** Returns a session with an unexpired ID token, refreshing and saving it if needed. */
export async function getSession(env: Environment): Promise<StoredSession> {
  const session = await loadSession(env.name);
  if (!session) throw new NotLoggedInError(env.name);
  if (session.expiresAt - EXPIRY_SKEW_MS > Date.now()) return session;
  return forceRefresh(env, session);
}

export async function forceRefresh(env: Environment, session: StoredSession): Promise<StoredSession> {
  let tokens;
  try {
    tokens = await refreshTokens(env, session.refreshToken);
  } catch (err) {
    if (err instanceof CliError && err.code === 'invalid_grant') {
      throw new CliError(`Your ${env.name} login has expired. Run: uncola login`, 'session_expired', 4);
    }
    throw err;
  }
  const next = { ...session, ...tokens };
  await saveSession(env.name, next);
  return next;
}
