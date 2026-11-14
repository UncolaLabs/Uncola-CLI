import { createHash, randomBytes } from 'node:crypto';

export interface Pkce {
  verifier: string;
  challenge: string;
}

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url'); // 43 chars, within RFC 7636's 43–128
  return { verifier, challenge: challengeFor(verifier) };
}

export function randomState(): string {
  return randomBytes(16).toString('base64url');
}
