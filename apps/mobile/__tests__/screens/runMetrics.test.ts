// Jest cannot measure a layout, so the fit of the console title, map, event and end screens is
// proven by arithmetic on the same bounded heights their styles use (titleMetrics, mapMetrics,
// eventMetrics, endMetrics): for the four windows of the matrix at text scales 1.0 and 1.3, every
// region's content is no taller than its region, every touch target is at least 48 dp, and the map
// board holds the worst bounded map (7 layers, 3 nodes each).
import { describe, expect, it } from '@jest/globals';
import { effectiveTextScale, layoutSpec, type ScreenId } from '@kinfall/core/layout/spec';
import { CONTENT } from '@kinfall/core/content';
import { startRun } from '@kinfall/core/sim/run/run';

import { messageHeight } from '../../src/screens/battleMetrics';
import * as end from '../../src/screens/endMetrics';
import * as event from '../../src/screens/eventMetrics';
import * as map from '../../src/screens/mapMetrics';
import * as title from '../../src/screens/titleMetrics';

const windows: Array<[string, number, number, number]> = [
  ['640x360', 640, 360, 1],
  ['640x360 at 130%', 640, 360, 1.3],
  ['914x411', 914, 411, 1],
  ['914x411 at 130%', 914, 411, 1.3],
  ['360x640', 360, 640, 1],
  ['360x640 at 130%', 360, 640, 1.3],
  ['411x914', 411, 914, 1],
  ['411x914 at 130%', 411, 914, 1.3],
];

function specOf(screen: ScreenId, w: number, h: number, fs: number) {
  const scale = effectiveTextScale(fs, 1);
  return { scale, spec: layoutSpec({ width: w, height: h, textScale: scale }, screen) };
}
/** `need <= have`, printing both numbers when it fails. */
const fits = (need: number, have: number) => expect([need, need <= have]).toEqual([need, true]);

describe('map board', () => {
  it.each(windows)('%s: console; the worst board (7 layers of 3 nodes) fits the primary region', (_l, w, h, fs) => {
    const { scale, spec } = specOf('map', w, h, fs);
    expect(spec.mode).toBe('console');
    const landscape = spec.orientation === 'landscape';
    fits(map.boardHeight(scale), map.boardAvailable(spec.regions.primary.height, scale, landscape));
    // Seven columns of at least 48 dp each fit the width: no horizontal overlap on these windows.
    expect(map.columnWidth(spec.regions.primary.width)).toBeGreaterThanOrEqual(map.NODE_MIN);
  });

  it.each(windows)('%s: the readout and the Run button fit the actions region', (_l, w, h, fs) => {
    const { scale, spec } = specOf('map', w, h, fs);
    fits(map.railHeight(scale), spec.regions.actions.height);
  });

  it('keeps every node at least 48 dp wide and tall, and overlaps by at most 4 dp (2 dp a side) on a 320 dp window', () => {
    expect(map.nodeCellHeight()).toBeGreaterThanOrEqual(48);
    for (const width of [320, 360, 411, 640, 914]) expect(map.nodeWidth(map.columnWidth(width))).toBeGreaterThanOrEqual(48);
    const col = map.columnWidth(320);
    expect(map.nodeWidth(col) - col).toBeLessThanOrEqual(4);
  });

  it('holds for every generated map: at most 7 layers, at most 3 nodes in a layer', () => {
    for (let i = 0; i < 60; i++) {
      const run = startRun(`BOARD${i}`, CONTENT.starters[0]!, CONTENT);
      for (const m of run.maps) {
        expect(m.layers.length).toBeLessThanOrEqual(map.MAP_LAYERS);
        for (const layer of m.layers) expect(layer.length).toBeLessThanOrEqual(map.MAP_MAX_NODES);
      }
    }
  });
});

describe('title', () => {
  it.each(windows)('%s: the hero keeps its minimum after the starter strip and its hint', (_l, w, h, fs) => {
    const { scale, spec } = specOf('title', w, h, fs);
    expect(spec.mode).toBe('console');
    const hero = title.heroHeight(spec.regions.primary.height, scale);
    expect([hero, hero >= title.HERO_MIN]).toEqual([hero, true]);
  });

  it.each(windows)('%s: the worst rail (a corrupt save: notice, Continue, New run, Discard) fits', (_l, w, h, fs) => {
    const { scale, spec } = specOf('title', w, h, fs);
    const landscape = spec.orientation === 'landscape';
    fits(title.railHeight(scale, { notice: true, discard: true }, landscape), spec.regions.actions.height);
  });

  it('keeps starter cards and rail buttons at least 48 dp', () => {
    for (const s of [1, 1.3, 2]) {
      expect(title.cardHeight(s)).toBeGreaterThanOrEqual(48);
      expect(title.buttonHeight(s)).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('event', () => {
  it.each(windows)('%s: five choices (rest, three evolutions, leave) fit the rail', (_l, w, h, fs) => {
    const { scale, spec } = specOf('event', w, h, fs);
    expect(spec.mode).toBe('console');
    const landscape = spec.orientation === 'landscape';
    const rail = event.railWidth(spec.regions.content.width, spec.regions.actions.width);
    const have = spec.regions.actions.height;
    const choices = [{ detail: true }, { detail: true }, { detail: true }, { detail: true }, { detail: false }];
    fits(event.railHeight(scale, choices, landscape), have);
    if (landscape) expect(rail).toBeGreaterThanOrEqual(spec.regions.actions.width);
  });

  it.each(windows)('%s: the heaviest offer (a full-party recruit: description, offer card and note) fits the primary region', (_l, w, h, fs) => {
    const { scale, spec } = specOf('event', w, h, fs);
    const landscape = spec.orientation === 'landscape';
    const rail = landscape ? event.railWidth(spec.regions.content.width, spec.regions.actions.width) : 0;
    const primary = { width: spec.regions.content.width - rail, height: spec.regions.primary.height };
    const body = event.bodyPlan(primary.width, primary.height - (landscape ? messageHeight(scale, 1) : 0), scale, { offer: true, note: true });
    fits(body.height, primary.height - (landscape ? messageHeight(scale, 1) : 0));
  });

  it('keeps choice cells at least 48 dp', () => {
    for (const s of [1, 1.3, 2]) for (const lines of [0, 1, 2]) expect(event.choiceHeight(s, lines)).toBeGreaterThanOrEqual(48);
  });
});

describe('end', () => {
  it.each(windows)('%s: the scene keeps its minimum after the score and the note, and the rail fits', (_l, w, h, fs) => {
    const { scale, spec } = specOf('end', w, h, fs);
    expect(spec.mode).toBe('console');
    const landscape = spec.orientation === 'landscape';
    const scene = end.sceneHeight(spec.regions.primary.height, scale, landscape);
    expect([scene, scene >= end.SCENE_MIN]).toEqual([scene, true]);
    fits(end.railHeight(scale), spec.regions.actions.height);
  });
});
