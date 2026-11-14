import { apiJson } from '../api.ts';
import type { Environment } from '../config.ts';
import { loadSession } from '../credentials.ts';
import { emit, type OutputOptions } from '../output.ts';
import { getSession } from '../session.ts';

export async function whoami(env: Environment, opts: OutputOptions): Promise<void> {
  const session = await getSession(env);
  // Any authenticated GET proves the token works and teaches us the auth scheme.
  await apiJson(env, '/profile/companies');
  const { authScheme } = (await loadSession(env.name)) ?? session;

  emit(
    opts,
    {
      env: env.name,
      email: session.email ?? null,
      api: env.apiBase,
      authScheme: authScheme ?? null,
      tokenExpiresAt: new Date(session.expiresAt).toISOString(),
    },
    [
      `Logged in to ${env.name} as ${session.email ?? 'unknown user'}`,
      `API ${env.apiBase}: OK (auth: ${authScheme === 'bare' ? 'bare token' : authScheme === 'bearer' ? 'Bearer token' : 'unknown'})`,
    ].join('\n'),
  );
}
