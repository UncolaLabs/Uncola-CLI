import { describe, expect, it } from 'vitest';
import { challengeFor, createPkce, randomState } from '../src/pkce.ts';

describe('pkce', () => {
  it('matches the RFC 7636 appendix B example', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('creates a 43-char url-safe verifier and its challenge', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(challengeFor(verifier));
  });

  it('creates distinct states', () => {
    expect(randomState()).not.toBe(randomState());
  });
});
