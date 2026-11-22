import { describe, expect, it } from 'vitest';
import {
  effectiveTextScale,
  heightClass,
  layoutSpec,
  widthClass,
  type LayoutMode,
  type Orientation,
  type Rect,
  type ScreenId,
} from '../../src/layout/spec';

const SCREENS: ScreenId[] = ['title', 'map', 'battle', 'event', 'end'];

const MATRIX: [string, number, number, number, Orientation, LayoutMode][] = [
  ['320x640 @1.0', 320, 640, 1, 'portrait', 'console'],
  ['320x640 @1.3', 320, 640, 1.3, 'portrait', 'console'],
  ['360x640 @1.0', 360, 640, 1, 'portrait', 'console'],
  ['360x640 @1.3', 360, 640, 1.3, 'portrait', 'console'],
  ['360x640 @2.0', 360, 640, 2, 'portrait', 'console'],
  ['640x360 @1.0', 640, 360, 1, 'landscape', 'console'],
  ['640x360 @1.3', 640, 360, 1.3, 'landscape', 'console'],
  ['640x360 @2.0', 640, 360, 2, 'landscape', 'fallback'],
  ['914x411 @1.0', 914, 411, 1, 'landscape', 'console'],
  ['914x411 @2.0', 914, 411, 2, 'landscape', 'fallback'],
  ['560x300 @1.0', 560, 300, 1, 'landscape', 'fallback'],
  ['600x800 @1.0', 600, 800, 1, 'portrait', 'console'],
  ['600x800 @2.0', 600, 800, 2, 'portrait', 'console'],
  ['800x1280 @1.0', 800, 1280, 1, 'portrait', 'console'],
  ['800x1280 @2.0', 800, 1280, 2, 'portrait', 'console'],
  ['1280x800 @1.0', 1280, 800, 1, 'landscape', 'console'],
  ['1280x800 @2.0', 1280, 800, 2, 'landscape', 'console'],
  ['1366x768 @1.0', 1366, 768, 1, 'landscape', 'console'],
  ['1366x768 @2.0', 1366, 768, 2, 'landscape', 'console'],
  ['1920x1080 @1.0', 1920, 1080, 1, 'landscape', 'console'],
  ['1920x1080 @2.0', 1920, 1080, 2, 'landscape', 'console'],
];

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

describe('effectiveTextScale', () => {
  it('caps at 2', () => {
    expect(effectiveTextScale(1.5, 1.5)).toBe(2);
    expect(effectiveTextScale(1, 0.8)).toBeCloseTo(0.8);
    expect(effectiveTextScale(1.3, 1)).toBeCloseTo(1.3);
  });
});

describe('class boundaries', () => {
  it('splits width at 600 and 840', () => {
    expect(widthClass(599)).toBe('compact');
    expect(widthClass(600)).toBe('medium');
    expect(widthClass(840)).toBe('expanded');
  });
  it('splits height at 480 and 900', () => {
    expect(heightClass(479)).toBe('compact');
    expect(heightClass(480)).toBe('medium');
    expect(heightClass(900)).toBe('expanded');
  });
});

describe('device matrix', () => {
  it.each(MATRIX)('%s', (_name, w, h, textScale, orientation, mode) => {
    for (const screen of SCREENS) {
      const spec = layoutSpec({ width: w, height: h, textScale }, screen);
      expect(spec.orientation).toBe(orientation);
      expect(spec.mode).toBe(mode);
      expect(spec.width).toBe(widthClass(w));
      expect(spec.height).toBe(heightClass(h));
    }
  });
});

describe('regions tile the content box', () => {
  it.each(MATRIX)('%s', (_name, w, h, textScale) => {
    for (const screen of SCREENS) {
      const { regions } = layoutSpec({ width: w, height: h, textScale }, screen);
      const rects = [regions.hud, regions.primary, regions.actions];
      if (regions.info) rects.push(regions.info);
      const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
      expect(area).toBe(regions.content.width * regions.content.height);
      for (const r of rects) {
        expect(r.width).toBeGreaterThan(0);
        expect(r.height).toBeGreaterThan(0);
        expect(r.x).toBeGreaterThanOrEqual(regions.content.x);
        expect(r.y).toBeGreaterThanOrEqual(regions.content.y);
        expect(r.x + r.width).toBeLessThanOrEqual(regions.content.x + regions.content.width);
        expect(r.y + r.height).toBeLessThanOrEqual(regions.content.y + regions.content.height);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
        }
      }
    }
  });
});

describe('plans', () => {
  it.each(MATRIX.filter((m) => m[4] === 'landscape'))('landscape %s', (_n, w, h, textScale) => {
    const { regions } = layoutSpec({ width: w, height: h, textScale }, 'battle');
    expect(regions.primary.width).toBeGreaterThanOrEqual(0.55 * regions.content.width);
    expect(regions.actions.width).toBeGreaterThanOrEqual(200);
    expect(regions.info).toBeNull();
  });
  it.each(MATRIX.filter((m) => m[4] === 'portrait'))('portrait %s', (_n, w, h, textScale) => {
    const { regions } = layoutSpec({ width: w, height: h, textScale }, 'battle');
    expect(regions.primary.height).toBeGreaterThanOrEqual(0.38 * h);
    expect(regions.primary.height).toBeLessThanOrEqual(0.45 * h);
    expect(regions.info).not.toBeNull();
  });
});

describe('content is capped and centred', () => {
  it('caps landscape at 1200 and portrait at 720', () => {
    const wide = layoutSpec({ width: 1920, height: 1080, textScale: 1 }, 'map').regions.content;
    expect(wide.width).toBe(1200);
    expect(wide.x).toBe(360);
    const tall = layoutSpec({ width: 1000, height: 1600, textScale: 1 }, 'map').regions.content;
    expect(tall.width).toBe(720);
    expect(tall.x).toBe(140);
  });
});
