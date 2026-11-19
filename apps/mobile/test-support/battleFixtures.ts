// Test helpers for the battle screen: deterministic Animated, a session standing in a battle, and a
// microtask flush that lets a turn's play settle.
import { jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import type { RunState } from '@kinfall/core/sim/run/types';
import type { BattleState } from '@kinfall/core/sim/state';
import { Animated } from 'react-native';

import type { RunSession } from '../src/run/session';
import { firstNode, makeSession, memoryStorage, STARTER, type MemoryStorage } from './runFixtures';

type Config = { toValue: number | Animated.Value };

/** Animated.timing and Animated.spring jump to their end value at once (or never finish when `stall`). */
export function mockAnimations(options: { stall?: boolean } = {}) {
  const started: Array<{ kind: 'timing' | 'spring'; toValue: unknown }> = [];
  const make = (kind: 'timing' | 'spring') =>
    ((value: Animated.Value, config: Config) => {
      const anim = {
        start(cb?: (r: { finished: boolean }) => void) {
          started.push({ kind, toValue: config.toValue });
          if (options.stall) return;
          if (typeof config.toValue === 'number') value.setValue(config.toValue);
          cb?.({ finished: true });
        },
        stop() {},
        reset() {},
      };
      return anim as unknown as Animated.CompositeAnimation;
    }) as never;
  jest.spyOn(Animated, 'timing').mockImplementation(make('timing'));
  jest.spyOn(Animated, 'spring').mockImplementation(make('spring'));
  return { started };
}

/** Lets pending promise chains (a turn's play and settle) run to the end. */
export async function flush(times = 30): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i++) await Promise.resolve();
  });
}

export function battleOf(run: RunState | null): BattleState {
  if (!run || run.phase.kind !== 'battle') throw new Error('not in a battle');
  return run.phase.battle;
}

/**
 * A session over a memory storage that started `seed` and picked the first node (a wild battle
 * for the seeds used in the tests).
 */
export function sessionInBattle(seed: string, storage: MemoryStorage = memoryStorage()): { session: RunSession; storage: MemoryStorage } {
  const session = makeSession(storage);
  session.start(seed, STARTER);
  session.pickNode(firstNode(session.getSnapshot().run!));
  battleOf(session.getSnapshot().run);
  return { session, storage };
}
