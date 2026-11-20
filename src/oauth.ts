import { requireClientId, SCOPES, type Environment } from './config.ts';
import { CliError } from './errors.ts';

export interface TokenSet {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the ID and access tokens expire. */
  expiresAt: number;
}

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export function authorizeUrl(
  env: Environment,
  opts: { redirectUri: string; challenge: string; state: string; provider?: string },
): string {
  // No provider: open the web app's own login page, which shows the chooser and forwards these
  // parameters to Cognito. A provider skips the chooser, so go straight to Cognito.
  const url = opts.provider ? new URL('/oauth2/authorize', env.authDomain) : new URL('/login', env.appBase);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', requireClientId(env));
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('code_challenge', opts.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', opts.state);
  if (opts.provider) url.searchParams.set('identity_provider', opts.provider);
  return url.toString();
}

async function postForm(env: Environment, path: string, body: Record<string, string>): Promise<Response> {
  return fetch(new URL(path, env.authDomain), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
}

async function tokenRequest(env: Environment, body: Record<string, string>): Promise<TokenResponse> {
  const res = await postForm(env, '/oauth2/token', { client_id: requireClientId(env), ...body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // fall through with an empty body
  }
  if (!res.ok) {
    const code = typeof json.error === 'string' ? json.error : `http_${res.status}`;
    const detail = typeof json.error_description === 'string' ? `: ${json.error_description}` : '';
    throw new CliError(`Token request failed (${code})${detail}`, code);
  }
  return json as unknown as TokenResponse;
}

export async function exchangeCode(
  env: Environment,
  opts: { code: string; redirectUri: string; verifier: string },
): Promise<TokenSet> {
  const t = await tokenRequest(env, {
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.verifier,
  });
  if (!t.refresh_token) throw new CliError('Token response had no refresh token', 'bad_token_response');
  return toTokenSet(t, t.refresh_token);
}

export async function refreshTokens(env: Environment, refreshToken: string): Promise<TokenSet> {
  const t = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refreshToken });
  // Cognito doesn't rotate refresh tokens unless rotation is enabled; keep the old one if none is returned.
  return toTokenSet(t, t.refresh_token ?? refreshToken);
}

export async function revokeToken(env: Environment, refreshToken: string): Promise<void> {
  const res = await postForm(env, '/oauth2/revoke', { token: refreshToken, client_id: requireClientId(env) });
  if (!res.ok) throw new CliError(`Revoke failed (HTTP ${res.status})`, 'revoke_failed');
}

function toTokenSet(t: TokenResponse, refreshToken: string): TokenSet {
  return {
    idToken: t.id_token,
    accessToken: t.access_token,
    refreshToken,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
}
