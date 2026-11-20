// Engine-exact maths for the scene art. Math.sin, Math.sqrt, Math.round, Math.exp and `**` are
// not guaranteed bit-identical across JavaScript engines (V8 in the browser and Node, Hermes on
// phones), and the determinism guard bans them in core. These helpers use only +, -, *, / and
// Math.floor, which IEEE-754 makes identical everywhere, so a seed draws the same pixels on
// every engine.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** Round half up. */
export function round(x: number): number {
  return Math.floor(x + 0.5);
}

/** Smallest integer >= x. */
export function ceil(x: number): number {
  return -Math.floor(-x);
}

/** Sine via range reduction and an 11th-order Taylor polynomial (error below 1e-6). */
export function sin(x: number): number {
  let r = x - TAU * Math.floor((x + PI) / TAU);
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 - (r2 / 6) * (1 - (r2 / 20) * (1 - (r2 / 42) * (1 - (r2 / 72) * (1 - r2 / 110)))));
}

export function cos(x: number): number {
  return sin(x + HALF_PI);
}

/** Square root by a fixed number of Newton steps (exact to double precision for x < 1e12). */
export function sqrt(x: number): number {
  if (x <= 0) return 0;
  let g = x >= 1 ? x : 1;
  for (let i = 0; i < 48; i++) g = 0.5 * (g + x / g);
  return g;
}

/** Distance from (0, 0) to (dx, dy). */
export function hypot(dx: number, dy: number): number {
  return sqrt(dx * dx + dy * dy);
}

/** A gentle ease for 0-1 inputs, close to t^1.5 (used where an exponent would be). */
export function easeIn(t: number): number {
  return t * (0.4 + 0.6 * t);
}

/** Damped travel: distance covered after `sec` seconds at unit speed with damping `k` (no exp). */
export function damped(sec: number, k: number): number {
  return k > 0 ? sec / (1 + k * sec) : sec;
}
