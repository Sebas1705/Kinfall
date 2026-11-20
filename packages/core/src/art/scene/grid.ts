// A small mutable indexed-colour canvas used by the scene generators, plus the dithering and
// tileable-noise helpers they share. Generators draw into a Grid and hand out a plain PixelGrid.
import type { PixelGrid } from '../palette';
import { ceil, PI, round, sin } from './fixedMath';

/** 4x4 ordered-dither (Bayer) thresholds, 0-15. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered-dither threshold in [0, 1) for a cell; compare a coverage fraction against it. */
export function bayer(x: number, y: number): number {
  return ((BAYER4[((y & 3) << 2) | (x & 3)] ?? 0) + 0.5) / 16;
}

export class Grid {
  readonly pixels: Uint8Array;

  /**
   * @param wrapX when true, x wraps around (tileable layers): drawing off one edge continues on the other.
   */
  constructor(
    readonly width: number,
    readonly height: number,
    readonly palette: string[],
    readonly wrapX = false,
  ) {
    this.pixels = new Uint8Array(width * height);
  }

  private col(x: number): number {
    if (!this.wrapX) return x;
    return ((x % this.width) + this.width) % this.width;
  }

  get(x: number, y: number): number {
    const cx = this.col(Math.floor(x));
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return 0;
    return this.pixels[cy * this.width + cx] ?? 0;
  }

  set(x: number, y: number, index: number): void {
    const cx = this.col(Math.floor(x));
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return;
    this.pixels[cy * this.width + cx] = index;
  }

  /** Sets a cell only when it is already filled (keeps silhouettes intact). */
  paint(x: number, y: number, index: number): void {
    if (this.get(x, y) !== 0) this.set(x, y, index);
  }

  /** Sets a cell only when it is empty. */
  under(x: number, y: number, index: number): void {
    if (this.get(x, y) === 0) this.set(x, y, index);
  }

  rect(x: number, y: number, w: number, h: number, index: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, index);
  }

  hline(x0: number, x1: number, y: number, index: number): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, index);
  }

  vline(x: number, y0: number, y1: number, index: number): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, index);
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, index: number): void {
    let x = round(x0);
    let y = round(y0);
    const tx = round(x1);
    const ty = round(y1);
    const dx = Math.abs(tx - x);
    const dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, index);
      if (x === tx && y === ty) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Filled ellipse centred on (cx, cy) with radii rx, ry (cells whose centre is inside). */
  ellipse(cx: number, cy: number, rx: number, ry: number, index: number): void {
    for (let y = Math.floor(cy - ry); y <= ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, index);
      }
    }
  }

  /** Filled disc. */
  disc(cx: number, cy: number, r: number, index: number): void {
    this.ellipse(cx, cy, r, r, index);
  }

  /** Adds a 1-cell outline (4-neighbourhood) of `index` around every filled cell. */
  outline(index: number): void {
    const before = Uint8Array.from(this.pixels);
    const filled = (x: number, y: number): boolean => {
      const cx = this.col(x);
      return cx >= 0 && y >= 0 && cx < this.width && y < this.height && before[y * this.width + cx] !== 0;
    };
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (filled(x, y)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          this.pixels[y * this.width + x] = index;
        }
      }
    }
  }

  /** Recolours the top-most filled cell of every column (rim light on a silhouette). */
  rimTop(index: number, from: number, depth = 1): void {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.get(x, y) !== from) continue;
        for (let d = 0; d < depth; d++) if (this.get(x, y + d) === from) this.set(x, y + d, index);
        break;
      }
    }
  }

  /**
   * Rim light from one side: a filled cell of colour `from` whose neighbour towards the light
   * (`side` -1 = light on the left, +1 = on the right) is empty becomes `index`.
   */
  rimSide(index: number, from: number, side: -1 | 1): void {
    const before = Uint8Array.from(this.pixels);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (before[y * this.width + x] !== from) continue;
        const nx = this.col(x + side);
        const empty = nx < 0 || nx >= this.width || before[y * this.width + nx] === 0;
        if (empty) this.pixels[y * this.width + x] = index;
      }
    }
  }

  toPixelGrid(): PixelGrid {
    return { width: this.width, height: this.height, pixels: this.pixels, palette: [...this.palette] };
  }
}

/**
 * Seamlessly tileable 1-D noise over `width` samples: a sum of sines whose frequencies are whole
 * numbers of cycles per width, so sample 0 and sample `width` match. Returns values in about [-1, 1].
 */
export function tileNoise(rand: () => number, width: number, freqs: readonly number[]): number[] {
  const parts = freqs.map((f, i) => ({ f, amp: 1 / (i + 1), phase: rand() * PI * 2 }));
  const total = parts.reduce((s, p) => s + p.amp, 0);
  const out: number[] = [];
  for (let x = 0; x < width; x++) {
    let v = 0;
    for (const p of parts) v += p.amp * sin((2 * PI * p.f * x) / width + p.phase);
    out.push(v / total);
  }
  return out;
}
