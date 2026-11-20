// Cosmetic random numbers for the scene art. This is deliberately NOT the simulation PRNG
// (src/sim/rng.ts): art must never draw from, fork or advance the sim generator, so changing a
// backdrop can never move a battle or run golden. It has its own hash salt and algorithm
// (mulberry32), so even the same seed string gives unrelated streams in the two worlds.

export interface CosmeticRng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] (both inclusive). */
  between(min: number, max: number): number;
  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Independent child stream for a sub-part (backdrop layer, emitter, ...). */
  fork(label: string): CosmeticRng;
}

/** 32-bit FNV-1a with an art-only salt, so cosmetic seeds never collide with sim seeds. */
export function artHash(text: string): number {
  let h = 0x811c9dc5 ^ 0x5eed;
  const s = `kinfall-art|${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fromState(seed: number): CosmeticRng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: CosmeticRng = {
    next,
    int: (n) => Math.floor(next() * n),
    range: (min, max) => min + next() * (max - min),
    between: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (p) => next() < p,
    fork: (label) => fromState(artHash(`${state}|${label}`)),
  };
  return rng;
}

/** Cosmetic generator for a seed (any string or number); pure and engine independent. */
export function cosmeticRng(seed: string | number): CosmeticRng {
  return fromState(artHash(String(seed)));
}
