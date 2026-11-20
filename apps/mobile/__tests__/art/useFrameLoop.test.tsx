// The scene clock pauses in the background and on a blurred navigation screen, and never runs
// without the art backend.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useFrameLoop, type FrameScheduler } from '../../src/art/frameLoop';

function fakeScheduler() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, (t: number) => void>();
  const sched: FrameScheduler = {
    request(cb) {
      pending.set(next, cb);
      return next++;
    },
    cancel(id) {
      pending.delete(id);
    },
    now: () => now,
  };
  const step = (ms = 16) => {
    now += ms;
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) cb(now);
  };
  return { sched, step };
}

function Clock({ sched, onDraw, enabled = true }: { sched: FrameScheduler; onDraw: () => void; enabled?: boolean }) {
  const wake = useFrameLoop({ draw: onDraw, moving: () => true, fast: () => true, scheduler: sched }, enabled);
  useEffect(() => wake(), [wake]);
  return null;
}

afterEach(() => jest.restoreAllMocks());

describe('useFrameLoop', () => {
  it('stops drawing while the app is in the background and resumes when active', async () => {
    let listener: ((s: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      listener = fn as (s: AppStateStatus) => void;
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    const s = fakeScheduler();
    let draws = 0;
    await render(<Clock sched={s.sched} onDraw={() => draws++} />);
    s.step();
    s.step();
    expect(draws).toBe(2);
    await act(async () => listener!('background'));
    s.step();
    s.step();
    expect(draws).toBe(2);
    await act(async () => listener!('active'));
    s.step();
    expect(draws).toBe(3);
  });

  it('stops on blur and resumes on focus of its navigation screen', async () => {
    const handlers: Record<string, () => void> = {};
    const navigation = {
      isFocused: () => true,
      addListener: (name: string, fn: () => void) => {
        handlers[name] = fn;
        return () => delete handlers[name];
      },
    };
    const s = fakeScheduler();
    let draws = 0;
    await render(
      <NavigationContext.Provider value={navigation as never}>
        <Clock sched={s.sched} onDraw={() => draws++} />
      </NavigationContext.Provider>,
    );
    s.step();
    expect(draws).toBe(1);
    await act(async () => handlers.blur!());
    s.step();
    s.step();
    expect(draws).toBe(1);
    await act(async () => handlers.focus!());
    s.step();
    expect(draws).toBe(2);
  });

  it('never schedules frames without the art backend', async () => {
    const s = fakeScheduler();
    let draws = 0;
    await render(<Clock sched={s.sched} onDraw={() => draws++} enabled={false} />);
    s.step();
    s.step();
    expect(draws).toBe(0);
  });
});
