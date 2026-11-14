import { spawn } from 'node:child_process';

/** The command that opens `url`, honouring $BROWSER (e.g. BROWSER="Google Chrome" on macOS). */
export function openerFor(
  url: string,
  platform: NodeJS.Platform = process.platform,
  browser = process.env.BROWSER,
): [string, string[]] {
  if (browser) {
    // macOS app names ("Google Chrome", "Firefox") go through `open -a`; elsewhere it's a command.
    return platform === 'darwin' && !browser.includes('/') ? ['open', ['-a', browser, url]] : [browser, [url]];
  }
  // Note: /usr/bin/open on Linux is openvt, not a URL opener.
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}

/** Opens a URL in the browser. Resolves false if no opener could be started. */
export function openBrowser(url: string): Promise<boolean> {
  const [cmd, args] = openerFor(url);
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
