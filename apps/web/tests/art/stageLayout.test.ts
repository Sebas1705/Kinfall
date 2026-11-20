import { describe, expect, it } from 'vitest';
import { SCENE_HEIGHT, SCENE_WIDTH, STAGE } from '@kinfall/core/art/scene';
import { MIN_VISIBLE_WIDTH, cameraSway, sceneKeyOf, stageFrame } from '../../src/art/stageLayout';

describe('sceneKeyOf', () => {
  it('reads the zone and run seed from a run battle seed', () => {
    expect(sceneKeyOf('abc123:z0-l1-c2')).toEqual({ zone: 0, seed: 'abc123' });
    expect(sceneKeyOf('my:seed:z2-l7-c0')).toEqual({ zone: 2, seed: 'my:seed' });
  });

  it('gives any other seed a stable zone from its text', () => {
    const a = sceneKeyOf('demo');
    expect(a).toEqual(sceneKeyOf('demo'));
    expect(a.seed).toBe('demo');
    expect([0, 1, 2]).toContain(a.zone);
    const zones = new Set(['zone0', 'zone1', 'zone2', 'e2e', 'a11y', 'x', 'y', 'z'].map((s) => sceneKeyOf(s).zone));
    expect(zones.size).toBe(3);
  });
});

describe('stageFrame', () => {
  it('uses whole-number scales only', () => {
    for (let w = 100; w <= 2000; w += 37) {
      const f = stageFrame(w);
      expect(Number.isInteger(f.scale)).toBe(true);
      expect(f.scale).toBeGreaterThanOrEqual(1);
      expect(f.viewWidth * f.scale).toBeGreaterThanOrEqual(w);
    }
  });

  it('shows the whole scene once the width allows a 2x scale or more', () => {
    const f = stageFrame(SCENE_WIDTH * 3 + 10);
    expect(f.scale).toBe(3);
    expect(f.originX).toBeLessThanOrEqual(0);
    expect(f.originX + f.viewWidth).toBeGreaterThanOrEqual(SCENE_WIDTH);
  });

  it('keeps both creatures in view on phones at 2x', () => {
    const f = stageFrame(360);
    expect(f.scale).toBe(2);
    const half = 12 * STAGE.spriteScale;
    // At most a pixel of either sprite's outer edge may be cropped.
    expect(STAGE.player.x - half).toBeGreaterThanOrEqual(f.originX - 1);
    expect(STAGE.enemy.x + half).toBeLessThanOrEqual(f.originX + f.viewWidth + 1);
    expect(stageFrame(MIN_VISIBLE_WIDTH * 2).scale).toBe(2);
    expect(stageFrame(MIN_VISIBLE_WIDTH * 2 - 1).scale).toBe(1);
  });

  it('crops sky rows from the top when asked', () => {
    const f = stageFrame(400, 26);
    expect(f.originY).toBe(26);
    expect(f.viewHeight).toBe(SCENE_HEIGHT - 26);
    const banner = stageFrame(400, 24, 76);
    expect(banner.viewHeight).toBe(76);
  });
});

describe('cameraSway', () => {
  it('sways a few whole pixels and stays still with reduced motion', () => {
    const values = Array.from({ length: 200 }, (_, i) => cameraSway(i * 100, false));
    expect(Math.max(...values)).toBe(6);
    expect(Math.min(...values)).toBe(-6);
    for (const v of values) expect(Number.isInteger(v)).toBe(true);
    for (let t = 0; t < 20_000; t += 777) expect(cameraSway(t, true)).toBe(0);
  });
});
