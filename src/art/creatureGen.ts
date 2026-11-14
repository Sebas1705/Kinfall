import { createRng, type Rng } from '../sim/rng';
import type { ArtParams, SpeciesDef } from '../content/schema';
import { BODY, elementPalette, EYE_WHITE, OUTLINE, PATTERN, PUPIL, type PixelGrid } from './palette';

const SIZE = 24;
/** Columns 11 and 12 are the two centre columns; every drawn cell is mirrored about them. */
const CENTRE = 12;
/** Last row a body or limb may use; the outline then lands on row 22 and row 23 stays empty. */
const LAST_ROW = 21;

type Body = ArtParams['body'];

interface Silhouette {
  /** First body row. */
  top: number;
  /** Half-width (cells per side of the centre line) for each row from `top` down. */
  half: number[];
  /** Row of the upper edge of the eyes. */
  eyeY: number;
}

const SILHOUETTES: Record<Body, Silhouette> = {
  blob: { top: 4, half: [3, 5, 7, 8, 9, 10, 10, 10, 10, 9, 9, 8, 7, 6], eyeY: 7 },
  tall: { top: 2, half: [3, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5, 4, 4], eyeY: 6 },
  wide: { top: 7, half: [5, 7, 8, 9, 10, 10, 10, 10, 9, 9, 8, 6], eyeY: 11 },
  serpent: { top: 2, half: [4, 5, 6, 6, 3, 3, 7, 9, 10, 10, 10, 10, 9, 9, 8, 7, 5, 4, 3, 2], eyeY: 4 },
};

/** Mutable canvas whose writes are mirrored about the vertical axis. */
class Canvas {
  readonly pixels = new Uint8Array(SIZE * SIZE);

  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : (this.pixels[y * SIZE + x] ?? 0);
  }

  /** Sets (x, y) and its mirror (23 - x, y). */
  set(x: number, y: number, index: number): void {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    this.pixels[y * SIZE + x] = index;
    this.pixels[y * SIZE + (SIZE - 1 - x)] = index;
  }
}

function drawSilhouette(c: Canvas, s: Silhouette): void {
  s.half.forEach((hw, i) => {
    for (let x = CENTRE - hw; x < CENTRE; x++) c.set(x, s.top + i, BODY);
  });
}

/** Left x of each 2-wide leg or tail on the left half (the right half is mirrored). */
function limbColumns(count: number, bottomHalf: number): number[] {
  const edge = CENTRE - bottomHalf;
  switch (count) {
    case 1:
      return [CENTRE - 1];
    case 2:
      return [edge];
    case 3:
      return [edge, CENTRE - 1];
    case 4:
      return [edge, edge + 3];
    default:
      return [];
  }
}

function drawLimbs(c: Canvas, s: Silhouette, count: number): void {
  const bottom = s.top + s.half.length - 1;
  const bottomHalf = s.half[s.half.length - 1] ?? 0;
  const lastRow = Math.min(LAST_ROW, bottom + 3);
  for (const x of limbColumns(count, bottomHalf)) {
    for (let y = bottom + 1; y <= lastRow; y++) {
      c.set(x, y, BODY);
      c.set(x + 1, y, BODY);
    }
  }
}

function drawPattern(c: Canvas, s: Silhouette, pattern: ArtParams['pattern'], rng: Rng): void {
  if (pattern === 'plain') return;
  const rows = s.half.length;
  const eyeFree = (y: number): boolean => y < s.eyeY - 1 || y > s.eyeY + 2;
  if (pattern === 'stripes') {
    const phase = rng.nextInt(2);
    for (let i = 3; i < rows - 1; i++) {
      const y = s.top + i;
      if ((i + phase) % 4 !== 0 || !eyeFree(y)) continue;
      const hw = Math.min(s.half[i] ?? 0, s.half[i - 1] ?? 0, s.half[i + 1] ?? 0);
      for (let x = CENTRE - hw + 1; x < CENTRE; x++) c.set(x, y, PATTERN);
    }
    return;
  }
  // spots: 2x2 blobs at pseudo-random positions, each inside the body on both rows
  let placed = 0;
  for (let attempt = 0; attempt < 40 && placed < 4; attempt++) {
    const i = 3 + rng.nextInt(Math.max(1, rows - 5));
    const y = s.top + i;
    const hw = Math.min(s.half[i] ?? 0, s.half[i + 1] ?? 0);
    const span = hw - 3;
    if (span < 1 || !eyeFree(y) || !eyeFree(y + 1)) continue;
    const x = CENTRE - hw + 1 + rng.nextInt(span);
    if (c.get(x, y) !== BODY || c.get(x + 1, y + 1) !== BODY) continue;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) c.set(x + dx, y + dy, PATTERN);
    placed++;
  }
}

/** Draws one 2x2 eye with its pupil on the inner (centre-facing) lower cell. */
function drawEye(c: Canvas, x: number, y: number): void {
  c.set(x, y, EYE_WHITE);
  c.set(x + 1, y, EYE_WHITE);
  c.set(x, y + 1, EYE_WHITE);
  c.set(x + 1, y + 1, PUPIL);
}

/** Centre eye: the two mirrored columns form one 2x2 eye with whites above the pupils. */
function drawCentreEye(c: Canvas, y: number): void {
  c.set(CENTRE - 1, y, EYE_WHITE);
  c.set(CENTRE - 1, y + 1, PUPIL);
}

function drawEyes(c: Canvas, s: Silhouette, eyes: ArtParams['eyes']): void {
  if (eyes === 1) drawCentreEye(c, s.eyeY);
  else if (eyes === 3) {
    drawCentreEye(c, s.eyeY);
    drawEye(c, 6, s.eyeY);
  } else drawEye(c, 8, s.eyeY);
}

/** Adds a 1-pixel dark outline around every filled cell (4-neighbourhood). */
function drawOutline(c: Canvas): void {
  const before = Uint8Array.from(c.pixels);
  const filled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && before[y * SIZE + x] !== 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        c.pixels[y * SIZE + x] = OUTLINE;
      }
    }
  }
}

/** Generates a 24x24 sprite for a species; pure and fixed per `art.key`. */
export function generateCreature(species: SpeciesDef): PixelGrid {
  const art = species.art;
  const rng = createRng(art.key);
  const shape = SILHOUETTES[art.body];
  const c = new Canvas();
  drawSilhouette(c, shape);
  drawLimbs(c, shape, art.limbs);
  drawPattern(c, shape, art.pattern, rng);
  drawEyes(c, shape, art.eyes);
  drawOutline(c);
  return { width: SIZE, height: SIZE, pixels: c.pixels, palette: elementPalette(species.elements[0]) };
}
