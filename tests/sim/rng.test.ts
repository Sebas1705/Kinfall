import { describe, expect, it } from 'vitest';
import { createRng, restoreRng } from '../../src/sim/rng';

function take(r: { next32(): number }, n: number): number[] {
  return Array.from({ length: n }, () => r.next32());
}

describe('rng', () => {
  it('same seed gives same sequence', () => {
    expect(take(createRng('abc'), 100)).toEqual(take(createRng('abc'), 100));
  });

  it('different seeds differ', () => {
    expect(take(createRng('a'), 10)).not.toEqual(take(createRng('b'), 10));
  });

  it('nextInt stays in range and is unbiased enough', () => {
    const r = createRng('dice');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) {
      const v = r.nextInt(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(1400);
  });

  it('fork is stable and independent', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    expect(take(a.fork('x'), 20)).toEqual(take(b.fork('x'), 20));
    const parent = createRng('seed');
    const control = createRng('seed');
    const f = parent.fork('x');
    take(f, 50);
    expect(parent.next32()).toBe(control.next32());
  });

  it('getState/restoreRng round-trips', () => {
    const r = createRng('state');
    take(r, 7);
    const restored = restoreRng(r.getState());
    expect(take(restored, 5)).toEqual(take(r, 5));
  });

  it('handles unusual seeds and rejects bad ranges', () => {
    for (const seed of ['', 'x'.repeat(100000), '🦊ñ日本']) {
      expect(() => createRng(seed)).not.toThrow();
      expect(createRng(seed).next32()).toBe(createRng(seed).next32());
    }
    const r = createRng('range');
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(-1)).toThrow(RangeError);
  });

  it('golden values pin the algorithm', () => {
    expect(take(createRng('golden'), 3)).toEqual([2093901751, 139244468, 1904008792]);
  });
});
