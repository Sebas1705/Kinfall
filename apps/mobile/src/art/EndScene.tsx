// The end screen's scene: the run's last zone with the victory or defeat flourish (stars and a
// rising title, or falling ash, a dimmed screen and a fading title). A won run shows the party lead
// on its platform. Decorative: the result is the screen's heading in text.
import type { Side } from '@kinfall/core/sim/state';
import { useEffect, useMemo, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { ArtScene } from './ArtScene';
import type { SceneCreature } from './paintScene';
import { creatureGrid } from './sceneCache';
import { createStageDirector } from './stageDirector';

export interface EndSceneProps {
  zone: number;
  seed: string;
  won: boolean;
  /** The localized words of the flourish ("Victory" / "Defeat"). */
  title: string;
  /** Species on the near platform (the party lead of a won run). */
  lead: string | null;
  reducedMotion: boolean;
  maxHeight: number;
  initialWidth: number;
  style?: StyleProp<ViewStyle>;
}

export function EndScene({ zone, seed, won, title, lead, reducedMotion, maxHeight, initialWidth, style }: EndSceneProps) {
  // One flourish per end screen; it keeps the reduce-motion setting it started with.
  const director = useMemo(() => createStageDirector(`${seed}|end`), [seed]);
  const played = useRef<string | null>(null);
  useEffect(() => {
    // First time: the full flourish. After a language change: the end state at once with the new
    // words (the flourish is not replayed).
    const replay = played.current !== null;
    played.current = title;
    director.fx.clear();
    director.fx.add(won ? 'victory' : 'defeat', director.now(), { target: 'screen', reducedMotion: reducedMotion || replay, title, hold: true });
    director.wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [director, won, title]);
  const creatures = useMemo<Partial<Record<Side, SceneCreature | null>>>(
    () => ({ player: won && lead ? { grid: creatureGrid(lead) } : null, enemy: null }),
    [won, lead],
  );
  return (
    <ArtScene
      zone={zone}
      seed={seed}
      reducedMotion={reducedMotion}
      creatures={creatures}
      director={director}
      maxHeight={maxHeight}
      initialWidth={initialWidth}
      style={style}
      testID="end-scene"
    />
  );
}
