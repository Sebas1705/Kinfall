import { describe, expect, it } from 'vitest';
import { generateCreature } from '../../src/art/creatureGen';
import { elementIcon } from '../../src/art/elementIcon';
import { gridToRects } from '../../src/art/gridToRects';
import type { PixelGrid } from '../../src/art/palette';
import { CONTENT, ELEMENTS } from '../../src/content';

/** Paints rects back into a colour-per-cell map ('' = transparent) and counts the cover per cell. */
function paint(grid: PixelGrid): { colors: string[]; cover: number[] } {
  const colors: string[] = new Array<string>(grid.width * grid.height).fill('');
  const cover: number[] = new Array<number>(grid.width * grid.height).fill(0);
  for (const r of gridToRects(grid)) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        colors[y * grid.width + x] = r.color;
        cover[y * grid.width + x]! += 1;
      }
    }
  }
  return { colors, cover };
}

function expectReproduces(grid: PixelGrid, label: string): void {
  const { colors, cover } = paint(grid);
  for (let i = 0; i < grid.pixels.length; i++) {
    const index = grid.pixels[i] ?? 0;
    expect(colors[i], `${label} cell ${i}`).toBe(index === 0 ? '' : grid.palette[index]);
    expect(cover[i], `${label} cover ${i}`).toBe(index === 0 ? 0 : 1);
  }
}

describe('gridToRects', () => {
  it('merges horizontal runs of one colour and skips transparent cells', () => {
    const grid: PixelGrid = {
      width: 5,
      height: 2,
      pixels: Uint8Array.from([0, 1, 1, 2, 2, 1, 0, 1, 1, 0]),
      palette: ['#00000000', '#111111', '#222222'],
    };
    expect(gridToRects(grid)).toEqual([
      { x: 1, y: 0, w: 2, h: 1, color: '#111111' },
      { x: 3, y: 0, w: 2, h: 1, color: '#222222' },
      { x: 0, y: 1, w: 1, h: 1, color: '#111111' },
      { x: 2, y: 1, w: 2, h: 1, color: '#111111' },
    ]);
  });

  it('returns nothing for an empty grid and never merges across rows', () => {
    const empty: PixelGrid = { width: 3, height: 2, pixels: new Uint8Array(6), palette: ['#00000000'] };
    expect(gridToRects(empty)).toEqual([]);
    const full: PixelGrid = { width: 3, height: 2, pixels: new Uint8Array(6).fill(1), palette: ['#00000000', '#abcdef'] };
    expect(gridToRects(full)).toHaveLength(2);
  });

  it('is deterministic', () => {
    for (const sp of CONTENT.species) {
      const grid = generateCreature(sp);
      expect(gridToRects(grid)).toEqual(gridToRects(grid));
    }
  });

  it('reproduces every species sprite cell by cell, covering each filled cell exactly once', () => {
    for (const sp of CONTENT.species) expectReproduces(generateCreature(sp), sp.id);
  });

  it('reproduces every element icon cell by cell', () => {
    for (const el of ELEMENTS) expectReproduces(elementIcon(el), el);
  });

  it('merges: no two rects of one row are adjacent with the same colour, and there are fewer rects than cells', () => {
    for (const sp of CONTENT.species) {
      const grid = generateCreature(sp);
      const rects = gridToRects(grid);
      const filled = grid.pixels.filter((p) => p !== 0).length;
      expect(rects.length).toBeLessThan(filled);
      rects.forEach((r, i) => {
        const next = rects[i + 1];
        if (next && next.y === r.y && next.x === r.x + r.w) expect(next.color).not.toBe(r.color);
      });
    }
  });
});
