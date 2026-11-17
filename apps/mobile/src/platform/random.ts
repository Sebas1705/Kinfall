// The app's only entropy: random seed codes for the title screen. Core stays deterministic; it gets
// the bytes through `seedFromRandom(fill)`.
import { seedFromRandom, type RandomFill } from '@webgames/core/platform/seed';
import { getRandomValues } from 'expo-crypto';

interface CryptoLike {
  getRandomValues?: (bytes: Uint8Array) => unknown;
}

/** Which source fills random bytes: the engine's Web Crypto when present, else expo-crypto. */
export function randomSource(g: { crypto?: CryptoLike } = globalThis as { crypto?: CryptoLike }): 'global' | 'expo-crypto' {
  return typeof g.crypto?.getRandomValues === 'function' ? 'global' : 'expo-crypto';
}

/** Fills bytes with cryptographic randomness (the global Web Crypto, or expo-crypto's native module). */
export const fillRandom: RandomFill = (bytes) => {
  const g = globalThis as { crypto?: CryptoLike };
  if (randomSource(g) === 'global') g.crypto!.getRandomValues!(bytes);
  else getRandomValues(bytes);
};

/** A fresh 8-character seed code from the unambiguous alphabet shared with the web app. */
export function randomSeed(): string {
  return seedFromRandom(fillRandom);
}
