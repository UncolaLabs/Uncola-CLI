import type { Environment } from '../config.ts';
import { clearSession, loadSession } from '../credentials.ts';
import { revokeToken } from '../oauth.ts';
import { emit, info, type OutputOptions } from '../output.ts';

export async function logout(env: Environment, opts: OutputOptions): Promise<void> {
  const session = await loadSession(env.name);
  if (!session) {
    emit(opts, { env: env.name, loggedOut: false }, `Not logged in to ${env.name}.`);
    return;
  }

  let revoked = false;
  try {
    await revokeToken(env, session.refreshToken);
    revoked = true;
  } catch (err) {
    // Still remove local tokens; the refresh token expires on its own.
    info(`Warning: couldn't revoke the session on the server (${(err as Error).message}).`);
  }
  await clearSession(env.name);

  emit(
    opts,
    { env: env.name, loggedOut: true, email: session.email ?? null, revoked },
    `✓ Logged out of ${env.name}${session.email ? ` (${session.email})` : ''}`,
  );
}
