// The battle stage: the zone scene of the run with both creatures on their platforms. The turn
// animator's values (lunge, swap and faint fades; scene px) become the creatures' pose, the
// StageDirector's effects play on top. Hidden from screen readers: the HUD plates and the battle
// log say everything in text.
import type { Side } from '@kinfall/core/sim/state';
import { useEffect, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { ShownSides } from '../battle/sceneModel';
import type { SideMotion } from '../battle/useBattleScene';
import { ArtScene } from './ArtScene';
import type { SceneCreature } from './paintScene';
import { creatureGrid } from './sceneCache';
import type { StageDirector } from './stageDirector';
import type { FrameOptions } from './stageLayout';

/** Size of a 24x24 creature on the stage, in scene px (STAGE.spriteScale 2): the lunge's unit. */
export const STAGE_SPRITE_SIZE = 48;

export interface BattleStageProps {
  zone: number;
  seed: string;
  shown: ShownSides;
  motion: Record<Side, SideMotion>;
  director: StageDirector;
  reducedMotion: boolean;
  maxHeight: number;
  initialWidth: number;
  /** Framing options (the compact battle crops more sky). */
  frame?: FrameOptions;
  style?: StyleProp<ViewStyle>;
}

export function BattleStage({ zone, seed, shown, motion, director, reducedMotion, maxHeight, initialWidth, frame, style }: BattleStageProps) {
  const enemyId = shown.enemy?.speciesId ?? null;
  const playerId = shown.player?.speciesId ?? null;
  const creatures = useMemo<Partial<Record<Side, SceneCreature | null>>>(
    () => ({ enemy: enemyId ? { grid: creatureGrid(enemyId) } : null, player: playerId ? { grid: creatureGrid(playerId) } : null }),
    [enemyId, playerId],
  );

  // The animator's values, as they change, become the pose the stage draws next.
  useEffect(() => {
    const subs: Array<() => void> = [];
    for (const side of ['player', 'enemy'] as const) {
      const m = motion[side];
      const pose = director.poses[side];
      const watch = (v: SideMotion['x'], set: (n: number) => void) => {
        // Start from the current value (a resumed battle may already show a fainted creature).
        const current = (v as unknown as { __getValue?: () => number }).__getValue?.();
        if (typeof current === 'number') set(current);
        const id = v.addListener(({ value }) => {
          set(value);
          director.wake();
        });
        subs.push(() => v.removeListener(id));
      };
      watch(m.x, (n) => (pose.dx = n));
      watch(m.y, (n) => (pose.dy = n));
      watch(m.opacity, (n) => (pose.alpha = n));
    }
    return () => subs.forEach((off) => off());
  }, [motion, director]);

  return (
    <ArtScene
      zone={zone}
      seed={seed}
      reducedMotion={reducedMotion}
      creatures={creatures}
      director={director}
      maxHeight={maxHeight}
      initialWidth={initialWidth}
      {...(frame ? { frame } : {})}
      style={style}
      testID="battle-stage"
    />
  );
}
