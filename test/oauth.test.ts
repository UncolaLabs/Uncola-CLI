import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENVIRONMENTS } from '../src/config.ts';
import { authorizeUrl, exchangeCode, refreshTokens } from '../src/oauth.ts';

const dev = ENVIRONMENTS.dev;

afterEach(() => vi.unstubAllGlobals());

describe('authorizeUrl', () => {
  it('goes straight to Cognito authorize with PKCE when a provider is given', () => {
    const url = new URL(
      authorizeUrl(dev, { redirectUri: 'http://localhost:53682/callback', challenge: 'chal', state: 'st', provider: 'Google' }),
    );
    expect(url.origin + url.pathname).toBe('https://auth.styloc.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: '4hqvib8lajb2i69n5h7t70ppq9',
      redirect_uri: 'http://localhost:53682/callback',
      scope: 'openid email profile',
      code_challenge: 'chal',
      code_challenge_method: 'S256',
      state: 'st',
      identity_provider: 'Google',
    });
  });

  it("opens the web app's login page when no provider is given", () => {
    const url = new URL(authorizeUrl(dev, { redirectUri: 'http://localhost:53682/callback', challenge: 'chal', state: 'st' }));
    expect(url.origin + url.pathname).toBe('https://app.styloc.com/login');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: '4hqvib8lajb2i69n5h7t70ppq9',
      redirect_uri: 'http://localhost:53682/callback',
      scope: 'openid email profile',
      code_challenge: 'chal',
      code_challenge_method: 'S256',
      state: 'st',
    });
  });

  it('refuses environments without a client', () => {
    expect(() => authorizeUrl({ ...ENVIRONMENTS.prod, clientId: undefined }, { redirectUri: 'x', challenge: 'c', state: 's' })).toThrow(/isn't enabled for prod/);
  });
});

describe('token endpoint', () => {
  it('exchanges a code with the verifier', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id_token: 'id', access_token: 'acc', refresh_token: 'ref', expires_in: 3600 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const before = Date.now();
    const t = await exchangeCode(dev, { code: 'c0de', redirectUri: 'http://localhost:53683/callback', verifier: 'v' });

    expect(t).toMatchObject({ idToken: 'id', accessToken: 'acc', refreshToken: 'ref' });
    expect(t.expiresAt).toBeGreaterThanOrEqual(before + 3600_000);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://auth.styloc.com/oauth2/token');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      client_id: '4hqvib8lajb2i69n5h7t70ppq9',
      grant_type: 'authorization_code',
      code: 'c0de',
      redirect_uri: 'http://localhost:53683/callback',
      code_verifier: 'v',
    });
  });

  it('keeps the old refresh token when none is returned', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ id_token: 'id2', access_token: 'acc2', expires_in: 3600 }));
    expect((await refreshTokens(dev, 'old-ref')).refreshToken).toBe('old-ref');
  });

  it('surfaces OAuth errors with their code', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_grant', error_description: 'Refresh Token has expired' }, { status: 400 }));
    await expect(refreshTokens(dev, 'r')).rejects.toMatchObject({ code: 'invalid_grant', message: expect.stringMatching(/expired/) });
  });
});
