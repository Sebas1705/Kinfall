import type { PixelGrid } from './palette';

/** One axis-aligned run of cells of a single colour, in grid cells. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** `#rrggbb` or `#rrggbbaa`, taken from the grid palette. */
  color: string;
}

/**
 * Turns an indexed-colour grid into draw rectangles for renderers that paint shapes rather than
 * pixels (Skia, SVG). Cells with palette index 0 (transparent) are skipped; every other cell is
 * covered exactly once, and horizontal runs of the same palette index are merged into one rect.
 * Pure and deterministic: rows top to bottom, runs left to right.
 */
export function gridToRects(grid: PixelGrid): PixelRect[] {
  const rects: PixelRect[] = [];
  for (let y = 0; y < grid.height; y++) {
    let x = 0;
    while (x < grid.width) {
      const index = grid.pixels[y * grid.width + x] ?? 0;
      if (index === 0) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < grid.width && grid.pixels[y * grid.width + end] === index) end++;
      rects.push({ x, y, w: end - x, h: 1, color: grid.palette[index] ?? '#00000000' });
      x = end;
    }
  }
  return rects;
}
