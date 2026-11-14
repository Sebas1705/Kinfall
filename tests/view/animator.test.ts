import { describe, expect, it, vi } from 'vitest';
import { createAnimator } from '../../src/view/animator';
import type { PlayContext } from '../../src/view/animator';

/** Manual timers: nothing fires unless the test says so. */
function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    api: {
      setTimeout: (fn: () => void) => {
        const id = next++;
        pending.set(id, fn);
        return id;
      },
      clearTimeout: (h: unknown) => {
        pending.delete(h as number);
      },
    },
    fireAll() {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
    get size() {
      return pending.size;
    },
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('animator: a step that throws', () => {
  it('still resolves the animation when the final step throws', async () => {
    const timers = fakeTimers();
    const onError = vi.fn();
    const a = createAnimator({ timers: timers.api, onError });
    const done = vi.fn();
    a.animate(100, (p) => {
      if (p === 1) throw new Error('boom');
    }).then(done);
    a.tick(200);
    await flush();
    expect(done).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalled();
    expect(a.active).toBe(0);
    expect(timers.size).toBe(0);
  });

  it('keeps the other animations and the ticker running when one step throws mid-way', async () => {
    const timers = fakeTimers();
    const onIdle = vi.fn();
    const a = createAnimator({ timers: timers.api, onError: () => {}, onIdle });
    const seen: number[] = [];
    const bad = a.animate(100, (p) => {
      if (p > 0 && p < 1) throw new Error('mid-way');
    });
    const good = a.animate(100, (p) => seen.push(p));
    expect(() => a.tick(50)).not.toThrow();
    expect(a.active).toBe(1);
    expect(onIdle).not.toHaveBeenCalled();
    a.tick(60);
    await expect(Promise.all([bad, good])).resolves.toBeDefined();
    expect(seen).toEqual([0, 0.5, 1]);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resolves when the first step throws and through the timeout fallback without frames', async () => {
    const timers = fakeTimers();
    const a = createAnimator({ timers: timers.api, onError: () => {} });
    await a.animate(100, () => {
      throw new Error('at start');
    });
    const late = vi.fn();
    a.animate(100, () => {}).then(late);
    timers.fireAll(); // no tick ever arrives
    await flush();
    expect(late).toHaveBeenCalled();
  });

  it('play resolves when an event handler throws and keeps playing later events', async () => {
    const a = createAnimator({ timers: fakeTimers().api, onError: () => {} });
    const played: number[] = [];
    await a.play([1, 2, 3], (e) => {
      if (e === 2) throw new Error('bad event');
      played.push(e);
    }, true);
    expect(played).toEqual([1, 3]);
  });

  it('a throwing onStart or onIdle hook does not break anything', async () => {
    const a = createAnimator({
      timers: fakeTimers().api,
      onError: () => {},
      onStart: () => {
        throw new Error('start');
      },
      onIdle: () => {
        throw new Error('idle');
      },
    });
    const p = a.animate(10, () => {});
    a.tick(20);
    await expect(p).resolves.toBeUndefined();
  });
});

describe('animator: overlapping plays', () => {
  it('a second play cancels the first, which resolves and skips its remaining events', async () => {
    const a = createAnimator({ timers: fakeTimers().api });
    const firstSeen: string[] = [];
    const handler = (log: string[]) => async (e: string, ctx: PlayContext) => {
      log.push(`start ${e}`);
      await ctx.animate(100, () => {});
      if (ctx.live()) log.push(`end ${e}`);
    };
    const first = a.play(['a', 'b', 'c'], handler(firstSeen), false);
    await flush();
    expect(firstSeen).toEqual(['start a']);
    const secondSeen: string[] = [];
    const second = a.play(['x'], handler(secondSeen), false);
    await first; // resolves without any tick
    expect(firstSeen).toEqual(['start a']);
    a.tick(200);
    await second;
    expect(secondSeen).toEqual(['start x', 'end x']);
  });

  it('cancel() resolves the running play; a stale play cannot start new animations', async () => {
    const a = createAnimator({ timers: fakeTimers().api });
    const steps = vi.fn();
    let ctxRef: PlayContext | null = null;
    const p = a.play([1], async (_e, ctx) => {
      ctxRef = ctx;
      await ctx.animate(100, () => {});
    }, false);
    await flush();
    a.cancel();
    await p;
    await ctxRef!.animate(100, steps);
    expect(steps).not.toHaveBeenCalled();
    expect(a.active).toBe(0);
  });

  it('instant plays apply final steps synchronously and reset instant afterwards', async () => {
    const a = createAnimator({ timers: fakeTimers().api });
    const seen: number[] = [];
    await a.play([1], (_e, ctx) => ctx.animate(100, (p) => seen.push(p)), true);
    expect(seen).toEqual([1]);
    expect(a.isInstant()).toBe(false);
  });

  it('dispose resolves pending animations and later ones resolve at once', async () => {
    const a = createAnimator({ timers: fakeTimers().api });
    const p = a.animate(100, () => {});
    a.dispose();
    await expect(p).resolves.toBeUndefined();
    await expect(a.animate(100, () => {})).resolves.toBeUndefined();
  });
});
