import { CliError } from './errors.ts';

export type EnvName = 'dev' | 'prod';

export interface Environment {
  name: EnvName;
  clientId: string | undefined;
  authDomain: string;
  apiBase: string;
  /** The web app, where shared posts live at /shared/<itemId>. */
  appBase: string;
}

// Client IDs are public (Cognito public clients, no secret) and safe to ship.
export const ENVIRONMENTS: Record<EnvName, Environment> = {
  dev: {
    name: 'dev',
    clientId: '4hqvib8lajb2i69n5h7t70ppq9',
    authDomain: 'https://auth.styloc.com',
    apiBase: 'https://api.styloc.com',
    appBase: 'https://app.styloc.com',
  },
  prod: {
    name: 'prod',
    clientId: '3hsqmh65dp6einkfpgtn7ertk9',
    authDomain: 'https://auth.uncola.ai',
    apiBase: 'https://api.uncola.ai',
    appBase: 'https://app.uncola.ai',
  },
};

export const DEFAULT_ENV: EnvName = 'prod';

// Must match the callback URLs registered on the Cognito app client exactly.
export const REDIRECT_PORTS = [53682, 53683, 53684] as const;
export const SCOPES = ['openid', 'email', 'profile'] as const;

export const PROVIDERS: Record<string, string> = {
  google: 'Google',
  linkedin: 'LinkedIn',
  apple: 'SignInWithApple',
  github: 'GitHub',
  email: 'COGNITO',
};

export function resolveEnv(name: string | undefined = process.env.UNCOLA_ENV): Environment {
  const key = (name ?? DEFAULT_ENV) as EnvName;
  const env = ENVIRONMENTS[key];
  if (!env) {
    throw new CliError(`Unknown environment "${name}". Use one of: ${Object.keys(ENVIRONMENTS).join(', ')}`, 'usage', 2);
  }
  return env;
}

export function requireClientId(env: Environment): string {
  if (!env.clientId) {
    throw new CliError(`The CLI isn't enabled for ${env.name} yet. Use --env dev.`, 'env_unavailable', 2);
  }
  return env.clientId;
}

export function redirectUri(port: number): string {
  return `http://localhost:${port}/callback`;
}
