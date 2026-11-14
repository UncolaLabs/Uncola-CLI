import { describe, expect, it } from 'vitest';
import { openerFor } from '../src/browser.ts';

const u = 'https://example.com/a?b=1&c=2';

describe('openerFor', () => {
  it('uses the default browser when $BROWSER is unset', () => {
    expect(openerFor(u, 'darwin', undefined)).toEqual(['open', [u]]);
    expect(openerFor(u, 'linux', undefined)).toEqual(['xdg-open', [u]]);
  });
  it('opens a named macOS app with open -a', () => {
    expect(openerFor(u, 'darwin', 'Google Chrome')).toEqual(['open', ['-a', 'Google Chrome', u]]);
  });
  it('runs $BROWSER as a command elsewhere, or when it is a path', () => {
    expect(openerFor(u, 'linux', 'firefox')).toEqual(['firefox', [u]]);
    expect(openerFor(u, 'darwin', '/usr/local/bin/chrome-wrapper')).toEqual(['/usr/local/bin/chrome-wrapper', [u]]);
  });
});

import { isRemoteSession } from '../src/commands/login.ts';

describe('isRemoteSession', () => {
  it('treats SSH as remote on any platform', () => {
    expect(isRemoteSession({ SSH_CONNECTION: '10.0.0.5 5000 10.0.0.131 22' }, 'darwin')).toBe(true);
  });
  it('treats Linux without a display as remote', () => {
    expect(isRemoteSession({}, 'linux')).toBe(true);
    expect(isRemoteSession({ DISPLAY: ':0' }, 'linux')).toBe(false);
  });
  it('treats a local Mac as local', () => {
    expect(isRemoteSession({}, 'darwin')).toBe(false);
  });
});
