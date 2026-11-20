// The single animation clock of a scene. It draws at the display rate while something is moving
// (an effect, a turn), at most 30 fps while only ambient life moves, and not at all while the app
// is in the background, the screen is not focused, or nothing moves (reduced motion): then it
// draws one still frame. The scheduler is injectable so the loop is unit-tested without frames.
import { useCallback, useContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

/** Frame rate cap while only ambient life moves. */
export const IDLE_FPS = 30;

export interface FrameScheduler {
  request(cb: (now: number) => void): number;
  cancel(id: number): void;
  now(): number;
}

export const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

export interface FrameLoopOptions {
  draw(now: number): void;
  /** True while anything on the scene moves (ambient life with motion on, effects, a turn). */
  moving(): boolean;
  /** True while something faster than the ambient life moves (effects, a turn): no fps cap. */
  fast(): boolean;
  scheduler?: FrameScheduler;
  idleFps?: number;
}

export interface FrameLoop {
  /** Re-checks whether frames are needed (call after starting an effect or changing props). */
  wake(): void;
  setVisible(visible: boolean): void;
  /** True while a frame is scheduled. */
  running(): boolean;
  dispose(): void;
}

export function createFrameLoop(opts: FrameLoopOptions): FrameLoop {
  const sched = opts.scheduler ?? rafScheduler;
  // 80% of the frame period: display frames arrive with jitter (a 33.3 ms gap measured as 31.9 ms
  // would otherwise skip to the next frame and drop the rate to 20 fps).
  const minGap = (1000 / (opts.idleFps ?? IDLE_FPS)) * 0.8;
  let id = 0;
  let visible = true;
  let disposed = false;
  let last = -Infinity;

  const tick = (now: number) => {
    id = 0;
    if (disposed || !visible) return;
    if (!opts.moving()) {
      // The last moving frame settles into a still one.
      opts.draw(now);
      return;
    }
    if (opts.fast() || now - last >= minGap) {
      last = now;
      opts.draw(now);
    }
    id = sched.request(tick);
  };

  const loop: FrameLoop = {
    wake() {
      if (disposed || !visible) return;
      if (opts.moving()) {
        if (!id) id = sched.request(tick);
      } else if (!id) {
        opts.draw(sched.now());
      }
    },
    setVisible(v) {
      visible = v;
      if (!v && id) {
        sched.cancel(id);
        id = 0;
      }
      if (v) loop.wake();
    },
    running: () => id !== 0,
    dispose() {
      disposed = true;
      if (id) sched.cancel(id);
      id = 0;
    },
  };
  return loop;
}

/**
 * A frame loop tied to the component: paused while the app is not active or the navigation screen
 * is blurred. `enabled` false (no art backend) never schedules anything. Returns `wake`.
 */
export function useFrameLoop(opts: FrameLoopOptions, enabled: boolean): () => void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const loopRef = useRef<FrameLoop | null>(null);
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (!enabled) return;
    const loop = createFrameLoop({
      draw: (now) => optsRef.current.draw(now),
      moving: () => optsRef.current.moving(),
      fast: () => optsRef.current.fast(),
      ...(opts.scheduler ? { scheduler: opts.scheduler } : {}),
      ...(opts.idleFps ? { idleFps: opts.idleFps } : {}),
    });
    loopRef.current = loop;
    let appActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let focused = navigation ? navigation.isFocused() : true;
    const update = () => loop.setVisible(appActive && focused);
    update();
    const sub = AppState.addEventListener('change', (s) => {
      appActive = s === 'active';
      update();
    });
    const offFocus = navigation?.addListener('focus', () => {
      focused = true;
      update();
    });
    const offBlur = navigation?.addListener('blur', () => {
      focused = false;
      update();
    });
    return () => {
      sub.remove();
      offFocus?.();
      offBlur?.();
      loop.dispose();
      loopRef.current = null;
    };
    // The scheduler and fps are fixed for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, navigation]);

  return useCallback(() => loopRef.current?.wake(), []);
}
