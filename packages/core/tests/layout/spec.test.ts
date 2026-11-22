import { describe, expect, it } from 'vitest';
import {
  effectiveTextScale,
  heightClass,
  HUD_FIXED,
  HUD_LINE,
  INFO_LINE,
  layoutSpec,
  MIN_BUDGET,
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

type Regions = ReturnType<typeof layoutSpec>['regions'];

function rectsOf(regions: Regions): Rect[] {
  const rects = [regions.hud, regions.primary, regions.actions];
  if (regions.info) rects.push(regions.info);
  return rects;
}

function expectTiling(regions: Regions, strict: boolean): void {
  const rects = rectsOf(regions);
  const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  expect(area).toBe(regions.content.width * regions.content.height);
  for (const r of rects) {
    for (const v of [r.x, r.y, r.width, r.height]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    if (strict) {
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    }
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

describe('regions tile the content box', () => {
  it.each(MATRIX)('%s', (_name, w, h, textScale, _o, mode) => {
    for (const screen of SCREENS) {
      const { regions } = layoutSpec({ width: w, height: h, textScale }, screen);
      expectTiling(regions, mode === 'console');
    }
  });
});

describe('degenerate input', () => {
  it.each([
    [100, 80, 1],
    [100, 80, 2],
    [150, 100, 1],
    [150, 100, 2],
    [0, 0, 1],
    [0, 100, 1],
    [100, 0, 2],
  ])('tiny window %ix%i @%f', (w, h, textScale) => {
    for (const screen of SCREENS) {
      const spec = layoutSpec({ width: w, height: h, textScale }, screen);
      expect(spec.mode).toBe('fallback');
      expectTiling(spec.regions, false);
    }
  });
  it.each([NaN, -1, 0, Infinity])('text scale %f is treated as 1', (textScale) => {
    const spec = layoutSpec({ width: 360, height: 640, textScale }, 'battle');
    expect(spec.mode).toBe('console');
    expectTiling(spec.regions, true);
  });
  it('non-finite sizes become 0', () => {
    const spec = layoutSpec({ width: NaN, height: Infinity, textScale: 1 }, 'map');
    expectTiling(spec.regions, false);
  });
  it('floors fractional windows to integer edges', () => {
    const spec = layoutSpec({ width: 640.5, height: 360.5, textScale: 1 }, 'map');
    for (const r of rectsOf(spec.regions)) {
      for (const v of [r.x, r.y, r.width, r.height]) expect(Number.isInteger(v)).toBe(true);
    }
    expect(spec.regions.content.width).toBe(640);
    expect(spec.regions.content.height).toBe(360);
    expectTiling(spec.regions, true);
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
    expect(regions.actions.height).toBeGreaterThan(0);
    expect(regions.info!.height).toBeGreaterThanOrEqual(INFO_LINE);
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

describe('the HUD band', () => {
  it('is the measured web HUD at text 1 and grows only above the 44 px targets', () => {
    const h = (textScale: number) => layoutSpec({ width: 640, height: 360, textScale }, 'map').regions.hud.height;
    expect(HUD_LINE).toBe(52);
    expect(h(1)).toBe(HUD_LINE);
    expect(h(1.3)).toBe(Math.round(HUD_FIXED + (HUD_LINE - HUD_FIXED) * 1.3));
    expect(h(2)).toBe(HUD_FIXED + 2 * (HUD_LINE - HUD_FIXED));
    // Text 2 never doubles the HUD: the touch targets keep their size.
    expect(h(2)).toBeLessThan(2 * HUD_LINE);
  });
  it('never takes more than a third of a very short window', () => {
    const { regions } = layoutSpec({ width: 300, height: 90, textScale: 2 }, 'map');
    expect(regions.hud.height).toBeLessThanOrEqual(30);
  });
});

describe('per-screen budgets', () => {
  const SCREEN_LIST: ScreenId[] = ['title', 'map', 'battle', 'event', 'end'];
  const modes = (width: number, height: number, textScale: number) =>
    Object.fromEntries(SCREEN_LIST.map((s) => [s, layoutSpec({ width, height, textScale }, s).mode]));

  it('overriding one screen budget changes only that screen mode', () => {
    const saved = { ...MIN_BUDGET };
    try {
      // 640x360 at text 1 is 360 text-sized px: every screen is a console at the current budgets.
      expect(Object.values(modes(640, 360, 1))).toEqual(SCREEN_LIST.map(() => 'console'));
      MIN_BUDGET.map = 361;
      expect(modes(640, 360, 1)).toEqual({ title: 'console', map: 'fallback', battle: 'console', event: 'console', end: 'console' });
      // The other way round: a bigger window with one budget lifted above it.
      MIN_BUDGET.map = saved.map;
      MIN_BUDGET.event = 10_000;
      expect(modes(1280, 800, 1)).toEqual({ title: 'console', map: 'console', battle: 'console', event: 'fallback', end: 'console' });
    } finally {
      Object.assign(MIN_BUDGET, saved);
    }
    expect(Object.values(modes(640, 360, 1))).toEqual(SCREEN_LIST.map(() => 'console'));
  });

  it('every budget leaves 640x360 at text 1.3 a console and 640x360 at text 2 a fallback', () => {
    for (const s of SCREEN_LIST) {
      expect(MIN_BUDGET[s], s).toBeLessThanOrEqual(360 / 1.3);
      expect(MIN_BUDGET[s], s).toBeGreaterThan(360 / 2);
    }
  });
});
