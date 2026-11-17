// Seed codes shown on the title screens. The entropy comes from the app (crypto on the web,
// expo-crypto on mobile) through `fill`; nothing here is random by itself, so core stays deterministic.

/** No 0/O, 1/I/L: easy to read aloud and to type back. */
export const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Longest seed a title screen accepts (longer input is cut). */
export const SEED_MAX = 32;
/** Length of a generated seed code. */
export const SEED_LENGTH = 8;

/** Fills `bytes` with random values in place (crypto.getRandomValues fits). */
export type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => void;

/** An 8-character code from SEED_ALPHABET built from `fill`, without modulo bias. */
export function seedFromRandom(fill: RandomFill): string {
  const n = SEED_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  const bytes = new Uint8Array(16);
  // A fill that never yields a usable byte would loop forever: give up after many rounds.
  for (let round = 0; out.length < SEED_LENGTH; round++) {
    if (round >= 64) throw new Error('random source yields no usable bytes');
    fill(bytes);
    for (const b of bytes) if (b < limit && out.length < SEED_LENGTH) out += SEED_ALPHABET[b % n];
  }
  return out;
}

/** Trimmed seed, at most SEED_MAX characters ('' when missing). */
export function cleanSeed(raw: string | null | undefined): string {
  return (raw ?? '').trim().slice(0, SEED_MAX);
}
