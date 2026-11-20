import { describe, expect, it } from 'vitest';
import { ceil, cos, damped, easeIn, hypot, round, sin, sqrt } from '../../src/art/scene/fixedMath';

describe('engine-exact art maths', () => {
  it('sin and cos track Math within 1e-6 over many turns', () => {
    for (let x = -40; x <= 40; x += 0.137) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-6);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-6);
    }
  });

  it('sqrt and hypot match Math to double precision', () => {
    for (const x of [0, 1e-6, 0.25, 1, 2, 3, 10, 144, 12345.678, 1e9]) expect(sqrt(x)).toBeCloseTo(Math.sqrt(x), 9);
    expect(sqrt(-4)).toBe(0);
    expect(hypot(3, 4)).toBeCloseTo(5, 12);
  });

  it('round is half up and ceil is the smallest integer above', () => {
    expect([round(1.5), round(2.5), round(-1.5), round(-0.4), round(3.49)]).toEqual([2, 3, -1, 0, 3]);
    expect([ceil(1.1), ceil(-1.1), ceil(2)]).toEqual([2, -1, 2]);
  });

  it('easing and damping stay in range', () => {
    expect([easeIn(0), easeIn(1)]).toEqual([0, 1]);
    expect(easeIn(0.5)).toBeLessThan(0.5);
    expect(damped(1, 0)).toBe(1);
    expect(damped(1, 4)).toBeLessThan(1);
    expect(damped(10, 4)).toBeLessThan(0.25);
  });
});
