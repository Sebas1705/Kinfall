import { describe, expect, it } from 'vitest';
import { effectFor } from '@kinfall/core/art/scene';
import { FLASH_GAP_MS, FX_PARTICLE_CAP, createFx } from '../../src/art/fx';

describe('createFx', () => {
  it('plays a move effect with particles and ends after its duration', () => {
    const fx = createFx('s');
    fx.add('move.ember', 0, { target: 'enemy', source: 'player', reducedMotion: false });
    expect(fx.busy(10)).toBe(true);
    const mid = fx.frame(300);
    expect(mid.particles.length).toBeGreaterThan(0);
    const end = effectFor('move.ember').durationMs;
    expect(fx.busy(end + 1)).toBe(false);
    expect(fx.frame(end + 1).particles).toEqual([]);
  });

  it('flashes and shakes on a hit, and keeps flashes at least FLASH_GAP_MS apart', () => {
    const fx = createFx('s');
    fx.add('hit', 0, { target: 'enemy', reducedMotion: false });
    const peak = Math.max(...[10, 30, 45, 60, 80].map((t) => fx.frame(t).bodies.enemy.flash));
    expect(peak).toBeGreaterThan(0);
    fx.clear();
    fx.add('hit', 1000, { target: 'enemy', reducedMotion: false });
    fx.add('hit', 1000 + FLASH_GAP_MS - 100, { target: 'player', reducedMotion: false });
    const second = Math.max(...[10, 30, 45, 60, 80].map((t) => fx.frame(1000 + FLASH_GAP_MS - 100 + t).bodies.player.flash));
    expect(second).toBe(0);
  });

  it('reduced motion: no flash, no shake, and particles do not move', () => {
    const fx = createFx('s');
    fx.add('superEffective', 0, { target: 'enemy', reducedMotion: true });
    const a = fx.frame(20);
    const b = fx.frame(200);
    for (const f of [a, b]) {
      expect(f.bodies.enemy.flash).toBe(0);
      expect(f.shake).toEqual({ x: 0, y: 0 });
    }
    expect(b.particles).toEqual(a.particles);
  });

  it('caps effect particles so ambient life always has room', () => {
    const fx = createFx('s');
    for (let i = 0; i < 6; i++) fx.add('evolve', 0, { target: 'player', reducedMotion: false });
    for (let t = 0; t < 1600; t += 100) expect(fx.frame(t).particles.length).toBeLessThanOrEqual(FX_PARTICLE_CAP);
  });

  it('holds the defeat dim and title after the effect, until cleared', () => {
    const fx = createFx('s');
    fx.add('defeat', 0, { target: 'screen', reducedMotion: false, title: 'Defeat', hold: true });
    const after = fx.frame(5000);
    expect(after.title?.text).toBe('Defeat');
    expect(after.screen?.alpha ?? 0).toBeGreaterThan(0);
    expect(fx.busy(5000)).toBe(false);
    fx.clear();
    expect(fx.frame(6000).title).toBeNull();
  });

  it('reduced-motion defeat shows its end state at once', () => {
    const fx = createFx('s');
    fx.add('defeat', 0, { target: 'screen', reducedMotion: true, title: 'Defeat', hold: true });
    const f = fx.frame(0);
    expect(f.title?.text).toBe('Defeat');
    expect(f.screen?.alpha ?? 0).toBeGreaterThan(0);
    expect(f.particles).toEqual([]);
  });

  it('floats numbers over the target, side by side when they overlap', () => {
    const fx = createFx('s');
    fx.number('damage', 42.4, 'enemy', 0, false);
    fx.number('heal', 7, 'enemy', 50, false);
    const f = fx.frame(100);
    expect(f.numbers.map((n) => n.text)).toEqual(['42', '+7']);
    expect(f.numbers[0]!.x).not.toBe(f.numbers[1]!.x);
    expect(f.numbers[0]!.y).toBeLessThan(100);
    expect(fx.frame(5000).numbers).toEqual([]);
  });

  it('reduced-motion numbers hold still, then go', () => {
    const fx = createFx('s');
    fx.number('superEffective', 12, 'player', 0, true);
    const a = fx.frame(10).numbers[0]!;
    const b = fx.frame(500).numbers[0]!;
    expect(b.y).toBe(a.y);
    expect(b.alpha).toBe(1);
    expect(fx.frame(2000).numbers).toEqual([]);
  });

  it('faint is particles only when the caller animates the body', () => {
    const fx = createFx('s');
    fx.add('faint', 0, { target: 'enemy', reducedMotion: false, particlesOnly: true });
    for (const t of [100, 400, 800]) {
      const b = fx.frame(t).bodies.enemy;
      expect(b.alpha).toBe(1);
      expect(b.offset).toEqual({ x: 0, y: 0 });
    }
  });
});
