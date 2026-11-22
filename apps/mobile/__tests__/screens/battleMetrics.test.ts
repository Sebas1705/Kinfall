// Jest cannot measure a layout, so the fit of the console battle is proven by arithmetic on the same
// bounded heights BattleView's styles use (battleMetrics): the rail for the worst case (4 moves and
// 2 swaps) fits its region, the stage keeps at least the art's own height, and the message line fits
// the contract's info band.
import { describe, expect, it } from '@jest/globals';
import { effectiveTextScale, layoutSpec } from '@kinfall/core/layout/spec';

import {
  CHOICE_COLUMNS,
  STAGE_MIN_DP,
  STAGE_MIN_ROWS,
  choiceCellHeight,
  messageHeight,
  plateHeight,
  railHeight,
  stageBoxHeight,
} from '../../src/screens/battleMetrics';

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

describe('battle metrics (worst case: 4 moves + 2 swaps, a party of 3)', () => {
  it.each(windows)('%s: console, the rail fits the actions region', (_l, w, h, fs) => {
    const scale = effectiveTextScale(fs, 1);
    const spec = layoutSpec({ width: w, height: h, textScale: scale }, 'battle');
    expect(spec.mode).toBe('console');
    const need = railHeight(scale, 4, 2, CHOICE_COLUMNS);
    expect([need, need <= spec.regions.actions.height]).toEqual([need, true]);
  });

  it.each(windows)('%s: the stage box keeps at least the art height after both plates', (_l, w, h, fs) => {
    const scale = effectiveTextScale(fs, 1);
    const spec = layoutSpec({ width: w, height: h, textScale: scale }, 'battle');
    const box = stageBoxHeight(spec.regions.primary.height, scale);
    expect([box, box >= STAGE_MIN_DP]).toEqual([box, true]);
  });

  it.each(windows.filter(([, w, h]) => w < h))('%s: the message line (2 lines) fits the contract info band', (_l, w, h, fs) => {
    const scale = effectiveTextScale(fs, 1);
    const spec = layoutSpec({ width: w, height: h, textScale: scale }, 'battle');
    expect(messageHeight(scale, 2)).toBeLessThanOrEqual(spec.regions.info!.height);
  });

  it('keeps every choice cell at least 48dp, and the numbers sane', () => {
    for (const s of [1, 1.3, 2]) {
      expect(choiceCellHeight(s)).toBeGreaterThanOrEqual(48);
      expect(plateHeight(s, true)).toBeGreaterThan(plateHeight(s, false));
    }
    // The art's scale-1 height: the rows below the compact sky crop, at the lowest supported density.
    expect(STAGE_MIN_ROWS).toBe(94);
    expect(STAGE_MIN_DP).toBe(47);
  });
});
