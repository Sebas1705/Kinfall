import { describe, expect, it } from 'vitest';
import { CONTENT, ELEMENTS } from '../../src/content';
import { elementIcon } from '../../src/art/elementIcon';
import { generateCreature } from '../../src/art/creatureGen';
import { elementPalette } from '../../src/art/palette';

const SIZE = 24;

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('generateCreature', () => {
  it('is deterministic', () => {
    for (const sp of CONTENT.species) {
      const a = generateCreature(sp);
      const b = generateCreature(sp);
      expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels));
      expect(a.palette).toEqual(b.palette);
    }
  });

  it('is 24x24 and mirrored about the vertical axis', () => {
    for (const sp of CONTENT.species) {
      const g = generateCreature(sp);
      expect([g.width, g.height]).toEqual([SIZE, SIZE]);
      expect(g.pixels.length).toBe(SIZE * SIZE);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          expect(g.pixels[y * SIZE + x]).toBe(g.pixels[y * SIZE + (SIZE - 1 - x)]);
        }
      }
    }
  });

  it('only uses palette indices and leaves the border empty', () => {
    for (const sp of CONTENT.species) {
      const g = generateCreature(sp);
      for (const p of g.pixels) expect(p).toBeLessThan(g.palette.length);
      for (let i = 0; i < SIZE; i++) {
        expect(g.pixels[i]).toBe(0);
        expect(g.pixels[(SIZE - 1) * SIZE + i]).toBe(0);
        expect(g.pixels[i * SIZE]).toBe(0);
        expect(g.pixels[i * SIZE + SIZE - 1]).toBe(0);
      }
    }
  });

  it('fills at least 30% of the cells', () => {
    for (const sp of CONTENT.species) {
      const g = generateCreature(sp);
      const filled = g.pixels.filter((p) => p !== 0).length;
      expect(filled / (SIZE * SIZE), sp.id).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('gives every species a different sprite', () => {
    const keys = CONTENT.species.map((sp) => Array.from(generateCreature(sp).pixels).join(''));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('colours with the first element palette', () => {
    for (const sp of CONTENT.species) {
      expect(generateCreature(sp).palette).toEqual(elementPalette(sp.elements[0]));
    }
  });
});

describe('elementIcon', () => {
  it('is 8x8 with in-range indices', () => {
    for (const el of ELEMENTS) {
      const g = elementIcon(el);
      expect([g.width, g.height]).toEqual([8, 8]);
      expect(g.pixels.length).toBe(64);
      for (const p of g.pixels) expect(p).toBeLessThan(g.palette.length);
    }
  });

  it('has a distinct shape per element when colours are ignored', () => {
    const shapes = ELEMENTS.map((el) =>
      Array.from(elementIcon(el).pixels)
        .map((p) => (p === 0 ? '0' : '1'))
        .join(''),
    );
    expect(new Set(shapes).size).toBe(ELEMENTS.length);
  });
});

describe('elementPalette', () => {
  it('has a transparent slot 0 and 5-6 colours', () => {
    for (const el of ELEMENTS) {
      const p = elementPalette(el);
      expect(p.length).toBeGreaterThanOrEqual(6);
      expect(p.length).toBeLessThanOrEqual(7);
    }
  });

  it('keeps the body colour at 3:1 against the dark and light backgrounds', () => {
    for (const el of ELEMENTS) {
      const body = elementPalette(el)[2]!;
      expect(contrast(body, '#0e0e13'), el).toBeGreaterThanOrEqual(3);
      expect(contrast(body, '#f6f6fa'), el).toBeGreaterThanOrEqual(3);
    }
  });
});
