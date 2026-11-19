import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SEED_ALPHABET, SEED_LENGTH } from '@kinfall/core/platform/seed';

import { fillRandom, randomSeed, randomSource } from '../../src/platform/random';

describe('random source', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    jest.restoreAllMocks();
  });

  it('prefers the engine Web Crypto when it has getRandomValues', () => {
    expect(randomSource({ crypto: { getRandomValues: () => undefined } })).toBe('global');
    expect(randomSource({ crypto: {} })).toBe('expo-crypto');
    expect(randomSource({})).toBe('expo-crypto');
  });

  it('fills bytes from expo-crypto when the engine has no Web Crypto (older Hermes)', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    expect(randomSource()).toBe('expo-crypto');
    // expo-crypto is the only source left (jest.setup backs it with Node's crypto).
    const bytes = new Uint8Array(32);
    fillRandom(bytes);
    expect(bytes.some((b) => b !== 0)).toBe(true);
    expect(randomSeed()).toMatch(new RegExp(`^[${SEED_ALPHABET}]{${SEED_LENGTH}}$`));
  });

  it('fills bytes from the global Web Crypto when present, never from expo-crypto', () => {
    const fill = jest.fn((b: Uint8Array) => b.fill(7));
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: fill }, configurable: true, writable: true });
    const bytes = new Uint8Array(4);
    fillRandom(bytes);
    expect(fill).toHaveBeenCalledWith(bytes);
    // Exactly the global's bytes: expo-crypto did not overwrite them.
    expect([...bytes]).toEqual([7, 7, 7, 7]);
  });
});
