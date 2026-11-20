import { describe, expect, it } from '@jest/globals';
import { SCENE_HEIGHT, SCENE_WIDTH, STAGE } from '@kinfall/core/art/scene';

import {
  FULL_SCENE_MIN_SCALE,
  MIN_VISIBLE_WIDTH,
  PHONE_CROP_TOP,
  cameraSway,
  layerShift,
  sceneKeyOf,
  stageFrame,
  tileStarts,
} from '../../src/art/stageLayout';

describe('sceneKeyOf', () => {
  it('reads the zone and run seed from a run battle seed', () => {
    expect(sceneKeyOf('ABCD1234:z2-l3-c1')).toEqual({ zone: 2, seed: 'ABCD1234' });
    expect(sceneKeyOf('with:colon:z0-l0-c0')).toEqual({ zone: 0, seed: 'with:colon' });
  });

  it('gives any other seed a stable zone of 0..2', () => {
    const a = sceneKeyOf('demo');
    expect(a).toEqual(sceneKeyOf('demo'));
    expect([0, 1, 2]).toContain(a.zone);
    expect(a.seed).toBe('demo');
  });
});

describe('stageFrame', () => {
  it('fills a phone width with the creatures at a whole scale and crops the sky', () => {
    // 360dp at 2.625 = 945 px, plenty of height.
    const f = stageFrame(945, 2000);
    expect(f.scale).toBe(Math.floor(945 / MIN_VISIBLE_WIDTH));
    expect(Number.isInteger(f.scale)).toBe(true);
    expect(f.originY).toBe(PHONE_CROP_TOP);
    expect(f.viewHeight).toBe(SCENE_HEIGHT - PHONE_CROP_TOP);
    expect(f.heightPx).toBe(f.viewHeight * f.scale);
    // Both creatures (24x24 at the sprite scale) stay inside the view.
    const half = (24 * STAGE.spriteScale) / 2;
    expect(f.originX).toBeLessThanOrEqual(STAGE.player.x - half);
    expect(f.originX + f.viewWidth).toBeGreaterThanOrEqual(STAGE.enemy.x + half);
  });

  it('shows the whole scene on wide boxes', () => {
    const f = stageFrame(SCENE_WIDTH * FULL_SCENE_MIN_SCALE + 10, 5000);
    expect(f.scale).toBe(FULL_SCENE_MIN_SCALE);
    expect(f.originY).toBe(0);
    expect(f.viewHeight).toBe(SCENE_HEIGHT);
    expect(f.originX).toBeLessThanOrEqual(0);
    expect(f.originX + f.viewWidth).toBeGreaterThanOrEqual(SCENE_WIDTH);
  });

  it('keeps the creatures crop on a phone even when the pixels would fit the whole scene', () => {
    // 411dp at 2.625 = 1079 px: 4 px per art px would fit the whole scene, but phones get the crop.
    const phone = stageFrame(1079, 5000, { whole: false });
    expect(phone.originY).toBe(PHONE_CROP_TOP);
    expect(phone.scale).toBe(Math.floor(1079 / MIN_VISIBLE_WIDTH));
    const pane = stageFrame(1079, 5000, { whole: true });
    expect(pane.originY).toBe(0);
    expect(pane.scale).toBe(Math.floor(1079 / SCENE_WIDTH));
  });

  it('lets the height cap win (landscape, compact battle), never below scale 1', () => {
    const capped = stageFrame(945, 360);
    expect(capped.heightPx).toBeLessThanOrEqual(360);
    expect(capped.scale).toBe(Math.floor(360 / (SCENE_HEIGHT - PHONE_CROP_TOP)));
    // The view widens instead (tiled layers cover it).
    expect(capped.viewWidth).toBe(Math.ceil(945 / capped.scale));
    expect(stageFrame(100, 10).scale).toBe(1);
  });

  it('draws a banner slice of every column', () => {
    const f = stageFrame(945, 400, { banner: { cropTop: 34, rows: 62 } });
    expect(f.originY).toBe(34);
    expect(f.viewHeight).toBe(62);
    expect(f.scale).toBe(Math.floor(945 / SCENE_WIDTH));
    expect(f.originX + f.viewWidth).toBeGreaterThanOrEqual(SCENE_WIDTH - 1);
  });
});

describe('tiling and camera', () => {
  it('covers the whole view with copies of a tiled layer, wherever the camera is', () => {
    for (const shift of [-300, -7, 0, 5, 256, 999]) {
      const starts = tileStarts(0, shift, 256, -40, 300);
      expect(starts[0]!).toBeLessThanOrEqual(-40);
      expect(starts[starts.length - 1]! + 256).toBeGreaterThanOrEqual(300);
      for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBe(256);
    }
  });

  it('moves layers by whole pixels and keeps the camera still with reduced motion', () => {
    expect(Number.isInteger(layerShift(0.4, 1.5, 3, 1234))).toBe(true);
    expect(layerShift(1, 0, 6, 0)).toBe(-6);
    for (const t of [0, 1000, 4750, 9000]) expect(cameraSway(t, true)).toBe(0);
    const sway = [0, 2000, 4750, 9500, 14250].map((t) => cameraSway(t, false));
    expect(Math.max(...sway.map(Math.abs))).toBeLessThanOrEqual(6);
    expect(new Set(sway).size).toBeGreaterThan(1);
  });
});
