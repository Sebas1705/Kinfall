import { describe, expect, it, vi } from 'vitest';
import type { BattleState } from '@kinfall/core/sim/state';
import { lazyBattleView } from '../../src/view/lazyView';

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};
const fake = () => ({ render: vi.fn(), play: vi.fn(() => Promise.resolve()), destroy: vi.fn() });
const s1 = { turn: 1 } as unknown as BattleState;
const s2 = { turn: 2 } as unknown as BattleState;

describe('lazyBattleView', () => {
  it('loads once on the first render and then draws the latest state', async () => {
    const real = fake();
    const load = vi.fn(() => Promise.resolve(real));
    const view = lazyBattleView(load, vi.fn());
    view.render(s1);
    view.render(s2);
    await expect(view.play([], { reducedMotion: false })).resolves.toBeUndefined();
    expect(real.play).not.toHaveBeenCalled();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(real.render).toHaveBeenCalledWith(s2);
    view.render(s1);
    expect(real.render).toHaveBeenLastCalledWith(s1);
    await view.play([], { reducedMotion: true });
    expect(real.play).toHaveBeenCalledWith([], { reducedMotion: true });
  });

  it('reports a failed load once and keeps resolving plays', async () => {
    const onUnavailable = vi.fn();
    const view = lazyBattleView(() => Promise.reject(new Error('no webgl')), onUnavailable);
    view.render(s1);
    view.render(s2);
    await flush();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    await expect(view.play([], { reducedMotion: false })).resolves.toBeUndefined();
  });
});
