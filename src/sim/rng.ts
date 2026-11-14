export type RngState = [number, number, number, number];

export interface Rng {
  next32(): number;
  nextInt(maxExclusive: number): number;
  fork(label: string): Rng;
  getState(): RngState;
}

/** 32-bit FNV-1a over UTF-16 code units. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer finalizer (murmur3 fmix32) used to spread seed words. */
function mix(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function fromWords(a: number, b: number, c: number, d: number, warmUp = true): Rng {
  // sfc32 state: a, b, c are the generator words, d is the counter.
  let sa = a >>> 0;
  let sb = b >>> 0;
  let sc = c >>> 0;
  let sd = d >>> 0;

  const next32 = (): number => {
    const t = (((sa + sb) >>> 0) + sd) >>> 0;
    sd = (sd + 1) >>> 0;
    sa = (sb ^ (sb >>> 9)) >>> 0;
    sb = (sc + (sc << 3)) >>> 0;
    sc = ((sc << 21) | (sc >>> 11)) >>> 0;
    sc = (sc + t) >>> 0;
    return t;
  };

  // Warm up so closely related seeds diverge.
  if (warmUp) for (let i = 0; i < 12; i++) next32();

  const rng: Rng = {
    next32,
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
        throw new RangeError(`nextInt requires an integer in 1..2^32, got ${maxExclusive}`);
      }
      // Rejection sampling: discard the biased tail of the 2^32 range.
      const limit = 0x100000000 - (0x100000000 % maxExclusive);
      let v = next32();
      while (v >= limit) v = next32();
      return v % maxExclusive;
    },
    fork(label: string): Rng {
      const h = hashString(label);
      return fromWords(
        mix(sa ^ h),
        mix(sb + h),
        mix(sc ^ Math.imul(h, 0x9e3779b1)),
        mix(sd + 0x7f4a7c15 + h),
      );
    },
    getState(): RngState {
      return [sa, sb, sc, sd];
    },
  };
  return rng;
}

export function createRng(seed: string | number): Rng {
  const s = String(seed);
  const h = hashString(s);
  return fromWords(
    mix(h),
    mix(hashString(`${s}\u0001`)),
    mix(hashString(`\u0002${s}`)),
    mix(h ^ s.length),
  );
}

export function restoreRng(state: RngState): Rng {
  return fromWords(state[0], state[1], state[2], state[3], false);
}
