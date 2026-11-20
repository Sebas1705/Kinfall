// The KINFALL pixel wordmark: an original chunky 9-row letterform with an ember-to-dusk fill,
// a dark outline, a deep drop shadow and a falling star over the I (the "fall" in Kinfall).
// It is the only art with letters in it, so it always carries an accessible label.
import type { PixelGrid } from '../palette';
import { Grid } from './grid';

const GLYPHS: Record<string, string[]> = {
  K: ['xx...xx', 'xx..xx.', 'xx.xx..', 'xxxx...', 'xxx....', 'xxxx...', 'xx.xx..', 'xx..xx.', 'xx...xx'],
  I: ['xxxxxx', '..xx..', '..xx..', '..xx..', '..xx..', '..xx..', '..xx..', '..xx..', 'xxxxxx'],
  N: ['xx....xx', 'xxx...xx', 'xxxx..xx', 'xx.xx.xx', 'xx..xxxx', 'xx...xxx', 'xx....xx', 'xx....xx', 'xx....xx'],
  F: ['xxxxxxx', 'xx.....', 'xx.....', 'xxxxxx.', 'xx.....', 'xx.....', 'xx.....', 'xx.....', 'xx.....'],
  A: ['..xxxx..', '.xx..xx.', 'xx....xx', 'xx....xx', 'xxxxxxxx', 'xx....xx', 'xx....xx', 'xx....xx', 'xx....xx'],
  L: ['xx.....', 'xx.....', 'xx.....', 'xx.....', 'xx.....', 'xx.....', 'xx.....', 'xx.....', 'xxxxxxx'],
};

const WORD = 'KINFALL';
const GAP = 2;
const TOP = 6;
const LEFT = 2;

export interface Wordmark {
  grid: PixelGrid;
  /** Accessible name: render the logo as an image labelled with this (or the i18n `app.title`). */
  label: string;
  labelKey: 'app.title';
  /** Integer scales that keep it crisp and readable: 2 on phones, 3 on wide screens. */
  scales: readonly number[];
}

/** The KINFALL logo grid. Pure (no seed: the logo never changes). */
export function wordmark(): Wordmark {
  const textW = [...WORD].reduce((w, ch) => w + (GLYPHS[ch]?.[0]?.length ?? 0) + GAP, -GAP);
  const W = LEFT + textW + 4;
  const H = TOP + 9 + 4;
  // 1 cream top, 2 ember, 3 deep red, 4 outline, 5 shadow, 6 shine, 7 star core, 8 star glow
  const g = new Grid(W, H, ['#00000000', '#ffe6a6', '#ff9440', '#c2402e', '#1a0c18', '#4c1a3c', '#fff8e4', '#fffbe8', '#ffd36b']);
  let x = LEFT;
  for (const ch of WORD) {
    const rows = GLYPHS[ch] ?? [];
    rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== 'x') continue;
        // Three-band fill: cream at the top, ember in the middle, deep red at the bottom.
        g.set(x + i, TOP + y, y < 3 ? 1 : y < 6 ? 2 : 3);
      }
    });
    x += (rows[0]?.length ?? 0) + GAP;
  }
  // Shine: the first cell of each top run.
  for (let xx = 0; xx < W; xx++) if (g.get(xx, TOP) === 1 && g.get(xx - 1, TOP) !== 1) g.set(xx, TOP, 6);
  // Dither seams between the bands so the gradient reads as pixel-art, not stripes.
  for (let xx = 0; xx < W; xx++) {
    if (g.get(xx, TOP + 3) === 2 && xx % 2 === 0) g.set(xx, TOP + 3, 1);
    if (g.get(xx, TOP + 6) === 3 && xx % 2 === 0) g.set(xx, TOP + 6, 2);
  }
  g.outline(4);
  // Drop shadow: the outlined letters pushed two cells down, under everything.
  const mask = Uint8Array.from(g.pixels);
  for (let yy = H - 1; yy >= 0; yy--) {
    for (let xx = 0; xx < W; xx++) {
      for (const dy of [1, 2]) {
        if (mask[(yy - dy) * W + xx] && !mask[yy * W + xx] && yy - dy >= 0) g.under(xx, yy, 5);
      }
    }
  }
  // Falling star over the I: a 4-point star with a short diagonal trail.
  const iX = LEFT + 7 + GAP + 3;
  const sx = iX + 2;
  const sy = 2;
  g.set(sx, sy, 7);
  g.set(sx - 1, sy, 8);
  g.set(sx + 1, sy, 8);
  g.set(sx, sy - 1, 8);
  g.set(sx, sy + 1, 8);
  g.set(sx - 2, sy - 1, 8);
  g.set(sx - 3, sy - 2, 8);
  g.set(sx - 5, sy - 2, 8);
  return { grid: g.toPixelGrid(), label: 'Kinfall', labelKey: 'app.title', scales: [2, 3] };
}
