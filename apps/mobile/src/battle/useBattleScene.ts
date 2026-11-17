// The battle scene's motion, with React Native's built-in Animated (native driver: transforms and
// opacity only). It implements core's BattleScene: `render` draws a state at rest, `play` walks a
// turn's events as short animations. Guarantees, as in the web animator:
// - the sim's state is never touched: events only change what is shown;
// - every step has a hard time budget (a timer finishes it if the native side never calls back);
// - a newer render cancels a running play (its remaining events are skipped) and `play` always
//   resolves; the controller's watchdog bounds the whole turn on top of that;
// - reduced motion plays nothing: the settle render shows the final state.
import type { BattleScene } from '@webgames/core/models/battleController';
import type { BattleEvent, BattleState, Side } from '@webgames/core/sim/state';
import { useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { applyShownEvent, shownSides, SIDES, type ShownSides } from './sceneModel';

/** Nominal step lengths (ms), the same as the web scene. */
export const STEP_MS = {
  lunge: 260,
  hit: 180,
  hp: 380,
  status: 220,
  skip: 300,
  swapOut: 160,
  swapIn: 160,
  faint: 360,
} as const;

/** Extra time after a step's nominal length before its timer finishes it anyway. */
export const STEP_FALLBACK_MS = 150;

/** Opacity of a fallen creature (as the web scene). */
export const FAINTED_OPACITY = 0.3;

export interface SideMotion {
  /** Lunge offset (dp). */
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  /** Hit flash overlay opacity. */
  flash: Animated.Value;
  /** Heal pulse overlay opacity. */
  pulse: Animated.Value;
  /** HP bar fill, 0..1 (scaleX). */
  hp: Animated.Value;
  /** Status chip scale (pops in). */
  chip: Animated.Value;
}

export interface SceneHandle {
  scene: BattleScene;
  shown: ShownSides;
  motion: Record<Side, SideMotion>;
}

const newMotion = (): SideMotion => ({
  x: new Animated.Value(0),
  y: new Animated.Value(0),
  opacity: new Animated.Value(1),
  flash: new Animated.Value(0),
  pulse: new Animated.Value(0),
  hp: new Animated.Value(1),
  chip: new Animated.Value(1),
});

const ratio = (hp: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0);

/** Starts `anim` and resolves when it ends or when its budget runs out (then it is stopped). */
export function runStep(anim: Animated.CompositeAnimation, budgetMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      anim.stop();
      finish();
    }, budgetMs + STEP_FALLBACK_MS);
    try {
      anim.start(() => finish());
    } catch {
      finish();
    }
  });
}

const timing = (value: Animated.Value, toValue: number, duration: number) =>
  Animated.timing(value, { toValue, duration, easing: Easing.out(Easing.quad), useNativeDriver: true });

/**
 * The scene for one battle screen. `spriteSize` (dp) scales the lunge. The returned `scene` object
 * is stable for the component's lifetime.
 */
export function useBattleScene(spriteSize: number, logger: Pick<Console, 'error'> = console): SceneHandle {
  const [shown, setShown] = useState<ShownSides>({ enemy: null, player: null });
  const motion = useMemo(() => ({ enemy: newMotion(), player: newMotion() }), []);
  const live = useRef({ generation: 0, rendered: null as BattleState | null, shown: shown, spriteSize, logger });
  live.current.spriteSize = spriteSize;
  live.current.logger = logger;

  const scene = useMemo<BattleScene>(() => {
    const ref = live.current;
    const show = (next: ShownSides) => {
      ref.shown = next;
      setShown(next);
    };
    const rest = (next: ShownSides) => {
      for (const side of SIDES) {
        const m = motion[side];
        for (const v of Object.values(m)) v.stopAnimation();
        const c = next[side];
        m.x.setValue(0);
        m.y.setValue(0);
        m.flash.setValue(0);
        m.pulse.setValue(0);
        m.chip.setValue(1);
        m.opacity.setValue(c?.fainted ? FAINTED_OPACITY : 1);
        m.hp.setValue(c ? ratio(c.hp, c.maxHp) : 0);
      }
    };

    const playEvent = async (e: BattleEvent, alive: () => boolean) => {
      if (!('side' in e)) return;
      const side = e.side;
      const m = motion[side];
      const before = ref.shown[side];
      const after = applyShownEvent(ref.shown, e, ref.rendered);
      // A swap shows the new creature only after the old one faded out.
      if (e.type !== 'swap' && after !== ref.shown) show(after);
      const now = after[side];
      switch (e.type) {
        case 'move': {
          const reach = Math.round(ref.spriteSize * 0.2);
          const dir = side === 'player' ? 1 : -1;
          const half = STEP_MS.lunge / 2;
          await runStep(Animated.parallel([timing(m.x, dir * reach, half), timing(m.y, -dir * (reach / 2), half)]), half);
          if (!alive()) return;
          await runStep(Animated.parallel([timing(m.x, 0, half), timing(m.y, 0, half)]), half);
          return;
        }
        case 'damage': {
          if (!now) return;
          m.flash.setValue(0.8);
          const shake = Math.max(2, Math.round(ref.spriteSize * 0.05));
          await runStep(
            Animated.parallel([
              timing(m.flash, 0, STEP_MS.hit),
              Animated.sequence([timing(m.x, shake, STEP_MS.hit / 3), timing(m.x, -shake, STEP_MS.hit / 3), timing(m.x, 0, STEP_MS.hit / 3)]),
              timing(m.hp, ratio(now.hp, now.maxHp), STEP_MS.hp),
            ]),
            STEP_MS.hp,
          );
          return;
        }
        case 'heal': {
          if (!now) return;
          m.pulse.setValue(0.6);
          await runStep(Animated.parallel([timing(m.pulse, 0, STEP_MS.hp), timing(m.hp, ratio(now.hp, now.maxHp), STEP_MS.hp)]), STEP_MS.hp);
          return;
        }
        case 'status': {
          m.chip.setValue(0.4);
          await runStep(Animated.spring(m.chip, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }), STEP_MS.status);
          return;
        }
        case 'skip': {
          await runStep(Animated.sequence([timing(m.opacity, 0.6, STEP_MS.skip / 2), timing(m.opacity, 1, STEP_MS.skip / 2)]), STEP_MS.skip);
          return;
        }
        case 'swap': {
          if (!before || !now) return;
          await runStep(timing(m.opacity, 0, STEP_MS.swapOut), STEP_MS.swapOut);
          if (!alive()) return;
          show(after);
          m.y.setValue(0);
          m.hp.setValue(ratio(now.hp, now.maxHp));
          await runStep(timing(m.opacity, 1, STEP_MS.swapIn), STEP_MS.swapIn);
          return;
        }
        case 'fainted': {
          await runStep(
            Animated.parallel([
              timing(m.opacity, FAINTED_OPACITY, STEP_MS.faint),
              timing(m.y, Math.round(ref.spriteSize * 0.08), STEP_MS.faint),
              timing(m.hp, 0, STEP_MS.faint),
            ]),
            STEP_MS.faint,
          );
          return;
        }
        default:
          return;
      }
    };

    return {
      render(state) {
        // The real state wins: a play still running is cancelled before the scene is redrawn.
        ref.generation++;
        ref.rendered = state;
        const next = shownSides(state);
        rest(next);
        show(next);
      },
      async play(events, opts) {
        if (opts.reducedMotion) return;
        const generation = ++ref.generation;
        const alive = () => ref.generation === generation;
        for (const e of events) {
          if (!alive()) return;
          try {
            await playEvent(e, alive);
          } catch (err) {
            ref.logger.error('battle animation step failed', err);
          }
        }
      },
    };
  }, [motion]);

  return { scene, shown, motion };
}
