import { createServer, type Server } from 'node:http';
import { redirectUri } from './config.ts';
import { CliError } from './errors.ts';
import { callbackPage } from './page.ts';

/** Pulls the authorization code out of a redirect URL, checking state. */
export function parseCallback(input: string, expectedState: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new CliError('That is not a URL. Paste the full address from the browser.', 'bad_callback');
  }
  const p = url.searchParams;
  // State first: only the sign-in page we opened knows it, so anything else (another process, a
  // web page) can't end the login, even with an error.
  if (p.get('state') !== expectedState) {
    throw new CliError('Sign-in response did not match this login attempt (state mismatch). Try again.', 'state_mismatch');
  }
  const error = p.get('error');
  if (error) {
    throw new CliError(`Sign-in failed: ${p.get('error_description') ?? error}`, 'sign_in_failed');
  }
  const code = p.get('code');
  if (!code) throw new CliError('The URL has no authorization code.', 'bad_callback');
  return code;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export interface CallbackServer {
  port: number;
  redirectUri: string;
  /** Resolves with the authorization code from the first valid callback. */
  code: Promise<string>;
  close(): void;
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

/**
 * Listens on the first free registered port. Binds IPv4 loopback, plus IPv6 when
 * available, because browsers may resolve "localhost" to either.
 */
export async function startCallbackServer(
  ports: readonly number[],
  expectedState: string,
  timeoutMs = 5 * 60_000,
): Promise<CallbackServer> {
  let settle!: { resolve: (code: string) => void; reject: (err: Error) => void };
  const code = new Promise<string>((resolve, reject) => (settle = { resolve, reject }));
  code.catch(() => {}); // Callers that bail out early never await it.
  const servers: Server[] = [];
  let done = false;
  let timer: NodeJS.Timeout | undefined;

  const handler: Parameters<typeof createServer>[1] = (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    try {
      const c = parseCallback(url.toString(), expectedState);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackPage(true, "You're connected", 'The Uncola CLI is ready. You can close this tab and head back to your terminal.'));
      finish(() => settle.resolve(c));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(callbackPage(false, 'Sign-in failed', `${escapeHtml((err as Error).message)}<br>Go back to the terminal and run <code>uncola login</code> again.`));
      // A stray request with the wrong state shouldn't abort a login still in progress.
      if ((err as CliError).code !== 'state_mismatch') finish(() => settle.reject(err as Error));
    }
  };

  const close = () => {
    clearTimeout(timer);
    // Also drop keep-alive connections, so a browser can't keep talking to a finished login.
    for (const s of servers) {
      s.close();
      s.closeAllConnections();
    }
  };
  const finish = (fn: () => void) => {
    if (done) return;
    done = true;
    fn();
    close();
  };

  let port: number | undefined;
  for (const candidate of ports) {
    const v4 = createServer(handler);
    try {
      await listen(v4, candidate, '127.0.0.1');
    } catch {
      continue;
    }
    servers.push(v4);
    const v6 = createServer(handler);
    try {
      await listen(v6, candidate, '::1');
      servers.push(v6);
    } catch (err) {
      // Without IPv6 loopback, IPv4 alone is fine. But if something else holds the port on ::1, a
      // browser that resolves localhost to ::1 would send the code there, so use another port.
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        servers.pop();
        v4.close();
        continue;
      }
    }
    port = candidate;
    break;
  }
  if (port === undefined) {
    throw new CliError(
      `Ports ${ports.join(', ')} are all in use, so the login callback can't be received. Free one, or use --no-browser.`,
      'ports_busy',
    );
  }

  timer = setTimeout(
    () => finish(() => settle.reject(new CliError('Timed out waiting for the browser sign-in.', 'timeout'))),
    timeoutMs,
  );
  timer.unref();

  return { port, redirectUri: redirectUri(port), code, close: () => finish(() => settle.reject(new CliError('Login cancelled', 'cancelled'))) };
}
