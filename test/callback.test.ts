import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { parseCallback, startCallbackServer } from '../src/callback.ts';

// High ports so tests never collide with a real `uncola login`.
const PORTS = [54682, 54683, 54684];

describe('parseCallback', () => {
  it('returns the code when state matches', () => {
    expect(parseCallback('http://localhost:53682/callback?code=abc&state=s1', 's1')).toBe('abc');
  });
  it('rejects a state mismatch', () => {
    expect(() => parseCallback('http://localhost:53682/callback?code=abc&state=evil', 's1')).toThrow(/state mismatch/);
  });
  it('reports provider errors', () => {
    expect(() => parseCallback('http://localhost/callback?error=access_denied&error_description=User+cancelled&state=s', 's')).toThrow(
      /User cancelled/,
    );
  });
  it('checks state before acting on an error', () => {
    expect(() => parseCallback('http://localhost/callback?error=access_denied', 's')).toThrow(/state mismatch/);
  });
  it('rejects non-URLs', () => {
    expect(() => parseCallback('not a url', 's')).toThrow(/not a URL/);
  });
});

describe('startCallbackServer', () => {
  it('receives the code and shows a close-this-tab page', async () => {
    const server = await startCallbackServer(PORTS, 'st');
    expect(server.redirectUri).toBe(`http://localhost:${server.port}/callback`);

    const bad = await fetch(`http://127.0.0.1:${server.port}/callback?code=x&state=wrong`);
    expect(bad.status).toBe(400); // ignored, login still pending

    const res = await fetch(`http://127.0.0.1:${server.port}/callback?code=good&state=st`);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/close this tab/);
    await expect(server.code).resolves.toBe('good');
  });

  it('ignores an error without the right state, and escapes the page', async () => {
    const server = await startCallbackServer(PORTS, 'st');
    const forged = await fetch(`http://127.0.0.1:${server.port}/callback?error=x&error_description=%3Cscript%3E`);
    expect(forged.status).toBe(400);
    expect(await forged.text()).not.toMatch(/<script>/);

    const res = await fetch(`http://127.0.0.1:${server.port}/callback?code=good&state=st`);
    expect(res.status).toBe(200);
    await expect(server.code).resolves.toBe('good');
  });

  it('skips a port that something else holds on ::1', async () => {
    const blocker = createServer();
    const bound = await new Promise<boolean>((r) => {
      blocker.once('error', () => r(false));
      blocker.listen(PORTS[0], '::1', () => r(true));
    });
    if (!bound) return; // No IPv6 loopback here.
    try {
      const server = await startCallbackServer(PORTS, 'st');
      expect(server.port).toBe(PORTS[1]);
      server.close();
    } finally {
      blocker.close();
    }
  });

  it('falls back to the next port when one is busy', async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(PORTS[0], '127.0.0.1', r));
    try {
      const server = await startCallbackServer(PORTS, 'st');
      expect(server.port).toBe(PORTS[1]);
      server.close();
    } finally {
      blocker.close();
    }
  });

  it('times out', async () => {
    const server = await startCallbackServer(PORTS, 'st', 50);
    await expect(server.code).rejects.toMatchObject({ code: 'timeout' });
  });
});
