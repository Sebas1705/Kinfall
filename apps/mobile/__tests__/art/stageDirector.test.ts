import { describe, expect, it } from '@jest/globals';
import { AMBIENT_PARTICLE_CAP, SCREEN_PARTICLE_CAP } from '@kinfall/core/art/scene';
import type { BattleEvent } from '@kinfall/core/sim/state';

import type { FrameScheduler } from '../../src/art/frameLoop';
import { FLASH_GAP_MS } from '../../src/art/fx';
import { createStageDirector, startEventEffects } from '../../src/art/stageDirector';

const TITLES = { victory: 'Victory', defeat: 'Defeat' };

function clock() {
  let now = 0;
  const sched: FrameScheduler = { request: () => 0, cancel: () => {}, now: () => now };
  return { sched, set: (t: number) => (now = t) };
}

const hit: BattleEvent[] = [
  { type: 'move', side: 'player', moveId: 'ember_lash', hit: true },
  { type: 'damage', side: 'enemy', amount: 30, effectiveness: 200 },
];

describe('stage director', () => {
  it('starts the move and damage effects with a floating number, and wakes the scene', () => {
    const c = clock();
    const d = createStageDirector('seed', c.sched);
    let woken = 0;
    d.setWake(() => woken++);
    for (const e of hit) startEventEffects(d, e, false, TITLES);
    expect(woken).toBe(2);
    c.set(200);
    const f = d.fx.frame(d.now());
    expect(f.particles.length).toBeGreaterThan(0);
    expect(f.particles.length).toBeLessThanOrEqual(SCREEN_PARTICLE_CAP - AMBIENT_PARTICLE_CAP);
    expect(f.numbers).toHaveLength(1);
    expect(f.numbers[0]!.text).toBe('30');
    expect(f.numbers[0]!.style.kind).toBe('superEffective');
    expect(d.fx.busy(d.now())).toBe(true);
    c.set(5000);
    expect(d.fx.busy(d.now())).toBe(false);
  });

  it('with reduced motion: no shake, no flash, a still frame, and done soon', () => {
    const c = clock();
    const d = createStageDirector('seed', c.sched);
    for (const e of hit) startEventEffects(d, e, true, TITLES);
    for (const t of [0, 40, 80, 120, 200, 280]) {
      c.set(t);
      const f = d.fx.frame(d.now());
      expect(f.shake).toEqual({ x: 0, y: 0 });
      expect(f.bodies.enemy.flash).toBe(0);
      expect(f.bodies.player.flash).toBe(0);
    }
    // The still particles do not move between frames.
    c.set(50);
    const a = d.fx.frame(d.now()).particles.map((p) => [p.x, p.y]);
    c.set(250);
    const b = d.fx.frame(d.now()).particles.map((p) => [p.x, p.y]);
    expect(b).toEqual(a);
    c.set(2000);
    expect(d.fx.busy(d.now())).toBe(false);
  });

  it('keeps hit flashes at most one per FLASH_GAP_MS', () => {
    const c = clock();
    const d = createStageDirector('seed', c.sched);
    startEventEffects(d, { type: 'damage', side: 'enemy', amount: 5, effectiveness: 100 }, false, TITLES);
    c.set(100);
    startEventEffects(d, { type: 'damage', side: 'player', amount: 5, effectiveness: 100 }, false, TITLES);
    let playerFlash = 0;
    for (let t = 100; t < 100 + FLASH_GAP_MS; t += 10) {
      c.set(t);
      playerFlash = Math.max(playerFlash, d.fx.frame(d.now()).bodies.player.flash);
    }
    expect(playerFlash).toBe(0);
  });

  it('holds the localized result title after the battle ends', () => {
    const c = clock();
    const d = createStageDirector('seed', c.sched);
    startEventEffects(d, { type: 'end', winner: 'enemy' }, false, TITLES);
    c.set(4000);
    const f = d.fx.frame(d.now());
    expect(f.title?.text).toBe('Defeat');
    expect(f.screen?.alpha ?? 0).toBeGreaterThan(0);
  });
});
