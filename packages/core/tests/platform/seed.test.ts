import { describe, expect, it } from 'vitest';
import { SEED_ALPHABET, SEED_LENGTH, SEED_MAX, cleanSeed, seedFromRandom } from '../../src/platform/seed';

/** A fill that hands out the given bytes in order, repeating the last list. */
function scripted(...rounds: number[][]): (bytes: Uint8Array<ArrayBuffer>) => void {
  let i = 0;
  return (bytes) => {
    const round = rounds[Math.min(i++, rounds.length - 1)] ?? [];
    bytes.fill(255);
    round.forEach((b, j) => {
      bytes[j] = b;
    });
  };
}

describe('seedFromRandom', () => {
  it('has an unambiguous 31-character alphabet', () => {
    expect(SEED_ALPHABET).not.toMatch(/[01ILOilo]/);
    expect(new Set(SEED_ALPHABET).size).toBe(31);
  });
  it('maps bytes to the alphabet, 8 characters long', () => {
    expect(seedFromRandom(scripted([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('ABCDEFGH');
    expect(seedFromRandom(scripted([30, 31, 61, 62, 247, 0, 0, 0]))).toBe('9A9A9AAA');
    expect(SEED_LENGTH).toBe(8);
  });
  it('skips biased bytes (248..255) and asks for more', () => {
    // First round: only two usable bytes; the rest of the 16 are 255 (rejected).
    expect(seedFromRandom(scripted([248, 0, 1], [2, 3, 4, 5, 6, 7]))).toBe('ABCDEFGH');
  });
  it('throws instead of looping forever when the source yields nothing usable', () => {
    expect(() => seedFromRandom(scripted([]))).toThrow(/no usable bytes/);
  });
  it('is random only through the fill it is given', () => {
    const fill = (bytes: Uint8Array<ArrayBuffer>) => bytes.forEach((_, i) => (bytes[i] = (i * 7) % 248));
    expect(seedFromRandom(fill)).toBe(seedFromRandom(fill));
  });
});

describe('cleanSeed', () => {
  it('trims, cuts at SEED_MAX and maps missing to empty', () => {
    expect(cleanSeed('  abc ')).toBe('abc');
    expect(cleanSeed('x'.repeat(40))).toHaveLength(SEED_MAX);
    expect(cleanSeed(null)).toBe('');
    expect(cleanSeed(undefined)).toBe('');
  });
});
