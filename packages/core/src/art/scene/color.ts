// Colour helpers for the scene art. Pure functions on `#rrggbb` / `#rrggbbaa` strings, so the
// generators and both renderers agree on the exact values. (Contrast maths lives with the tests,
// tests/support/contrast.ts: it needs an exponent the determinism guard keeps out of core.)
import { round } from './fixedMath';

/** `#rrggbb` (opaque) or `#rrggbbaa` (alpha in the last byte). */
export type Hex = string;

/** Splits a hex colour into 0-255 channels; alpha defaults to 255. */
export function rgba(hex: Hex): [number, number, number, number] {
  const n = (i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return [n(0), n(1), n(2), hex.length >= 9 ? n(3) : 255];
}

const byte = (v: number): string => Math.max(0, Math.min(255, round(v))).toString(16).padStart(2, '0');

/** Builds `#rrggbb`, or `#rrggbbaa` when `a` is given and below 255. */
export function toHex(r: number, g: number, b: number, a = 255): Hex {
  return `#${byte(r)}${byte(g)}${byte(b)}${a < 255 ? byte(a) : ''}`;
}

/** Linear mix of two colours: `t = 0` gives `a`, `t = 1` gives `b` (alpha mixed too). */
export function mix(a: Hex, b: Hex, t: number): Hex {
  const x = rgba(a);
  const y = rgba(b);
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t, x[3] + (y[3] - x[3]) * t);
}

/** Same colour with a new alpha (0-255). */
export function withAlpha(hex: Hex, alpha: number): Hex {
  const [r, g, b] = rgba(hex);
  return toHex(r, g, b, alpha);
}
