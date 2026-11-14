import { createInterface } from 'node:readline/promises';
import { openBrowser } from '../browser.ts';
import { parseCallback, startCallbackServer } from '../callback.ts';
import { PROVIDERS, REDIRECT_PORTS, redirectUri, requireClientId, type Environment } from '../config.ts';
import { credentialsPath, saveSession } from '../credentials.ts';
import { CliError } from '../errors.ts';
import { decodeJwtPayload } from '../jwt.ts';
import { authorizeUrl, exchangeCode } from '../oauth.ts';
import { emit, info, type OutputOptions } from '../output.ts';
import { createPkce, randomState } from '../pkce.ts';

export interface LoginOptions extends OutputOptions {
  provider?: string;
  /** false with --no-browser */
  browser: boolean;
}

export async function login(env: Environment, opts: LoginOptions): Promise<void> {
  requireClientId(env);
  const provider = resolveProvider(opts.provider);
  const pkce = createPkce();
  const state = randomState();

  let code: string;
  let redirect: string;
  if (opts.browser && !isRemoteSession()) {
    const server = await startCallbackServer(REDIRECT_PORTS, state);
    const pasteAbort = new AbortController();
    try {
      redirect = server.redirectUri;
      const url = authorizeUrl(env, { redirectUri: redirect, challenge: pkce.challenge, state, provider });
      info('Opening the Uncola sign-in page in your browser…');
      const opened = await openBrowser(url);
      info(`${opened ? "If it didn't open, visit" : 'Open this URL to sign in'}:\n  ${url}\n`);
      if (process.stdin.isTTY) {
        // Signing in on another machine? Its browser can't reach this localhost, so accept a paste too.
        info('Waiting for sign-in… If you signed in on another device, paste the localhost URL it landed on.');
        const pasted = prompt('Redirected URL (optional): ', pasteAbort.signal).then((input) => parseCallback(input, state));
        code = await Promise.race([server.code, pasted]);
      } else {
        info('Waiting for sign-in… (Ctrl-C to cancel)');
        code = await server.code;
      }
    } finally {
      pasteAbort.abort();
      server.close();
    }
  } else {
    if (opts.browser) info('No local display (SSH or headless), so sign in from any browser and paste the result back.\n');
    redirect = redirectUri(REDIRECT_PORTS[0]);
    const url = authorizeUrl(env, { redirectUri: redirect, challenge: pkce.challenge, state, provider });
    info(`Open this URL in a browser on any device and sign in:\n\n  ${url}\n`);
    info("Afterwards the browser will fail to load a localhost page. That's expected:");
    info('copy the full URL from its address bar and paste it here.\n');
    code = parseCallback(await prompt('Redirected URL: '), state);
  }

  const tokens = await exchangeCode(env, { code, redirectUri: redirect, verifier: pkce.verifier });
  const email = decodeJwtPayload(tokens.idToken).email;
  await saveSession(env.name, { ...tokens, email: typeof email === 'string' ? email : undefined });

  emit(
    opts,
    { env: env.name, email: email ?? null, credentialsPath: credentialsPath() },
    `✓ Logged in to ${env.name} as ${email ?? 'unknown user'} (saved to ${credentialsPath()})`,
  );
}

function resolveProvider(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const provider = PROVIDERS[name.toLowerCase()];
  if (!provider) {
    throw new CliError(`Unknown provider "${name}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`, 'usage', 2);
  }
  return provider;
}

/** True over SSH, or on Linux with no graphical display: a browser here can't be used. */
export function isRemoteSession(env: NodeJS.ProcessEnv = process.env, platform = process.platform): boolean {
  if (env.SSH_CONNECTION || env.SSH_TTY) return true;
  return platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY;
}

async function prompt(question: string, signal?: AbortSignal): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    // rl.question never settles if stdin closes first, so race it against 'close'.
    return await new Promise<string>((resolve, reject) => {
      rl.once('close', () => reject(new CliError('No URL entered; login cancelled.', 'cancelled')));
      rl.question(question, { signal }).then(resolve, reject);
    });
  } finally {
    rl.close();
  }
}
