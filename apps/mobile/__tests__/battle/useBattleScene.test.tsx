import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { CONTENT } from '@webgames/core/content';
import { createBattle } from '@webgames/core/sim/battle';
import type { BattleEvent, BattleState } from '@webgames/core/sim/state';
import type { Animated } from 'react-native';

import { FAINTED_OPACITY, STEP_FALLBACK_MS, STEP_MS, useBattleScene } from '../../src/battle/useBattleScene';
import { flush, mockAnimations } from '../../test-support/battleFixtures';

/** The current number of an Animated.Value (test-only read). */
const valueOf = (v: Animated.Value) => (v as unknown as { __getValue(): number }).__getValue();

function battle(): BattleState {
  return createBattle('scene', { speciesIds: ['cindermite', 'tidewisp'] }, { speciesIds: ['brambleback'] }, CONTENT, { telegraph: true });
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useBattleScene', () => {
  it('renders a state at rest: shown creatures, full HP bars, no motion', async () => {
    mockAnimations();
    const s = battle();
    s.teams.enemy[0]!.hp = Math.floor(s.teams.enemy[0]!.maxHp / 2);
    const { result } = await renderHook(() => useBattleScene(96));
    await act(async () => result.current.scene.render(s));
    expect(result.current.shown.player!.speciesId).toBe('cindermite');
    expect(valueOf(result.current.motion.player.hp)).toBe(1);
    expect(valueOf(result.current.motion.enemy.hp)).toBeCloseTo(s.teams.enemy[0]!.hp / s.teams.enemy[0]!.maxHp);
    expect(valueOf(result.current.motion.enemy.opacity)).toBe(1);
  });

  it('walks every event kind, updating what is shown and tweening the bars', async () => {
    const anims = mockAnimations();
    const s = battle();
    const { result } = await renderHook(() => useBattleScene(96));
    await act(async () => result.current.scene.render(s));
    const max = s.teams.enemy[0]!.maxHp;
    const events: BattleEvent[] = [
      { type: 'turnStart', turn: 1 },
      { type: 'move', side: 'player', moveId: 'ember_lash', hit: true },
      { type: 'damage', side: 'enemy', amount: 10, effectiveness: 1 },
      { type: 'status', side: 'enemy', status: 'scorch' },
      { type: 'heal', side: 'enemy', amount: 4 },
      { type: 'skip', side: 'enemy' },
      { type: 'swap', side: 'player', toIndex: 1 },
      { type: 'fainted', side: 'enemy' },
      { type: 'end', winner: 'player' },
    ];
    await act(async () => {
      await result.current.scene.play(events, { reducedMotion: false });
    });
    const { shown, motion } = result.current;
    expect(shown.enemy).toMatchObject({ hp: 0, fainted: true, status: null });
    expect(shown.player!.speciesId).toBe('tidewisp');
    expect(valueOf(motion.enemy.hp)).toBe(0);
    expect(valueOf(motion.enemy.opacity)).toBe(FAINTED_OPACITY);
    expect(valueOf(motion.player.opacity)).toBe(1);
    expect(valueOf(motion.player.x)).toBe(0);
    expect(anims.started.filter((a) => a.kind === 'spring')).toHaveLength(1);
    // The damage tween went to the HP after the hit (before the heal).
    expect(anims.started.some((a) => a.toValue === (max - 10) / max)).toBe(true);
  });

  it('plays nothing with reduced motion', async () => {
    const anims = mockAnimations();
    const s = battle();
    const { result } = await renderHook(() => useBattleScene(96));
    await act(async () => result.current.scene.render(s));
    const before = result.current.shown;
    await act(async () => {
      await result.current.scene.play([{ type: 'damage', side: 'enemy', amount: 10, effectiveness: 1 }], { reducedMotion: true });
    });
    expect(anims.started).toHaveLength(0);
    expect(result.current.shown).toBe(before);
  });

  it('finishes a step that never calls back on its time budget, and a render cancels the rest of the play', async () => {
    mockAnimations({ stall: true });
    const s = battle();
    const { result } = await renderHook(() => useBattleScene(96));
    await act(async () => result.current.scene.render(s));
    let done = false;
    const events: BattleEvent[] = [
      { type: 'damage', side: 'enemy', amount: 10, effectiveness: 1 },
      { type: 'damage', side: 'enemy', amount: 10, effectiveness: 1 },
      { type: 'damage', side: 'enemy', amount: 10, effectiveness: 1 },
    ];
    await act(async () => {
      void result.current.scene.play(events, { reducedMotion: false }).then(() => {
        done = true;
      });
    });
    await flush();
    expect(result.current.shown.enemy!.hp).toBe(s.teams.enemy[0]!.maxHp - 10);
    await act(async () => {
      jest.advanceTimersByTime(STEP_MS.hp + STEP_FALLBACK_MS);
    });
    await flush();
    expect(result.current.shown.enemy!.hp).toBe(s.teams.enemy[0]!.maxHp - 20);
    // The real state wins: rendering it stops the play after the running step.
    await act(async () => result.current.scene.render(s));
    await act(async () => {
      jest.advanceTimersByTime(STEP_MS.hp + STEP_FALLBACK_MS);
    });
    await flush();
    expect(done).toBe(true);
    expect(result.current.shown.enemy!.hp).toBe(s.teams.enemy[0]!.maxHp);
  });
});
