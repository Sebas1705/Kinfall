// What a scene shows on top of its backdrop, owned outside the canvas so the battle's turn animator
// can feed it: the running effects and floating numbers (fx.ts), the creatures' extra pose from the
// animator (lunge, swap and faint fades), and whether a turn is playing. The scene component reads
// it every frame and gets woken when something starts.
import { CONTENT } from '@kinfall/core/content';
import { effectsForBattleEvent } from '@kinfall/core/art/scene';
import type { BattleEvent, Side } from '@kinfall/core/sim/state';

import { createFx, type Fx } from './fx';
import { rafScheduler, type FrameScheduler } from './frameLoop';
import type { CreaturePose } from './paintScene';

export interface StageDirector {
  fx: Fx;
  /** Scene clock in ms since the director was made. */
  now(): number;
  /** Asks the scene for frames (set by the scene component; a no-op until it mounts). */
  wake(): void;
  setWake(fn: (() => void) | null): void;
  /** A turn is playing: the scene draws at the display rate. */
  turnBusy: boolean;
  poses: Record<Side, CreaturePose>;
}

export function createStageDirector(seed: string, scheduler: FrameScheduler = rafScheduler): StageDirector {
  const started = scheduler.now();
  let wake: (() => void) | null = null;
  return {
    fx: createFx(seed),
    now: () => scheduler.now() - started,
    wake: () => wake?.(),
    setWake(fn) {
      wake = fn;
    },
    turnBusy: false,
    poses: { player: { dx: 0, dy: 0, alpha: 1 }, enemy: { dx: 0, dy: 0, alpha: 1 } },
  };
}

export interface ResultTitles {
  victory: string;
  defeat: string;
}

/**
 * Starts the decorative effects of one battle event (as the web battle view does): the move's
 * element effect, hit / super effective / resisted, heal, faint (particles only: the animator fades
 * the body), victory or defeat with its localized title, and a floating number for damage and
 * heals. They run on the scene clock and never delay the turn.
 */
export function startEventEffects(d: StageDirector, e: BattleEvent, reducedMotion: boolean, titles: ResultTitles): void {
  const now = d.now();
  for (const eff of effectsForBattleEvent(e, CONTENT)) {
    const end = eff.effect === 'victory' || eff.effect === 'defeat';
    d.fx.add(eff.effect, now, {
      target: eff.target,
      ...(eff.source ? { source: eff.source } : {}),
      reducedMotion,
      particlesOnly: eff.effect === 'faint',
      ...(end ? { title: eff.effect === 'victory' ? titles.victory : titles.defeat, hold: true } : {}),
    });
  }
  if (e.type === 'damage') {
    const kind = e.effectiveness >= 200 ? 'superEffective' : e.effectiveness <= 50 ? 'resisted' : 'damage';
    d.fx.number(kind, e.amount, e.side, now, reducedMotion);
  } else if (e.type === 'heal') {
    d.fx.number('heal', e.amount, e.side, now, reducedMotion);
  }
  d.wake();
}
