import { describe, expect, it } from '@jest/globals';

import { createFrameLoop, IDLE_FPS, type FrameScheduler } from '../../src/art/frameLoop';

/** A scheduler driven by hand: `step(ms)` advances the clock and runs the pending frame. */
function fakeScheduler() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, (t: number) => void>();
  const sched: FrameScheduler = {
    request(cb) {
      const id = next++;
      pending.set(id, cb);
      return id;
    },
    cancel(id) {
      pending.delete(id);
    },
    now: () => now,
  };
  const step = (ms: number) => {
    now += ms;
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) cb(now);
  };
  return { sched, step, pending: () => pending.size };
}

describe('frame loop', () => {
  it('caps ambient-only frames at 30 fps', () => {
    const s = fakeScheduler();
    const draws: number[] = [];
    const loop = createFrameLoop({ draw: (t) => draws.push(t), moving: () => true, fast: () => false, scheduler: s.sched });
    loop.wake();
    for (let i = 0; i < 60; i++) s.step(1000 / 60);
    // One second of 60 Hz display frames draws about 30 times.
    expect(draws.length).toBeGreaterThanOrEqual(IDLE_FPS - 2);
    expect(draws.length).toBeLessThanOrEqual(IDLE_FPS + 1);
  });

  it('draws every display frame while effects or a turn play', () => {
    const s = fakeScheduler();
    let draws = 0;
    const loop = createFrameLoop({ draw: () => draws++, moving: () => true, fast: () => true, scheduler: s.sched });
    loop.wake();
    for (let i = 0; i < 60; i++) s.step(1000 / 60);
    expect(draws).toBe(60);
  });

  it('draws one still frame and schedules nothing when nothing moves (reduced motion)', () => {
    const s = fakeScheduler();
    let draws = 0;
    const loop = createFrameLoop({ draw: () => draws++, moving: () => false, fast: () => false, scheduler: s.sched });
    loop.wake();
    expect(draws).toBe(1);
    expect(loop.running()).toBe(false);
    expect(s.pending()).toBe(0);
  });

  it('settles into a still frame when motion stops, and resumes on wake', () => {
    const s = fakeScheduler();
    let moving = true;
    let draws = 0;
    const loop = createFrameLoop({ draw: () => draws++, moving: () => moving, fast: () => true, scheduler: s.sched });
    loop.wake();
    s.step(16);
    s.step(16);
    moving = false;
    s.step(16);
    expect(loop.running()).toBe(false);
    const settled = draws;
    s.step(16);
    expect(draws).toBe(settled);
    moving = true;
    loop.wake();
    s.step(16);
    expect(draws).toBe(settled + 1);
  });

  it('stops while hidden (background app or blurred screen) and after dispose', () => {
    const s = fakeScheduler();
    let draws = 0;
    const loop = createFrameLoop({ draw: () => draws++, moving: () => true, fast: () => true, scheduler: s.sched });
    loop.wake();
    s.step(16);
    loop.setVisible(false);
    expect(loop.running()).toBe(false);
    s.step(16);
    loop.wake();
    expect(loop.running()).toBe(false);
    const hidden = draws;
    loop.setVisible(true);
    s.step(16);
    expect(draws).toBe(hidden + 1);
    loop.dispose();
    expect(loop.running()).toBe(false);
    s.step(16);
    expect(draws).toBe(hidden + 1);
  });
});
