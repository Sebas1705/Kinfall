// Animation scheduler for the battle view (presentation side, no Pixi). Guarantees that matter for
// play: every animation settles (frame ticks, a timeout fallback, finishAll or cancel), an exception
// inside a step is logged and never leaves a promise pending, and a newer play cancels an older one.

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PlayContext {
  /** False once a newer play started, the play was cancelled or the animator was disposed. */
  live(): boolean;
  /** Like `Animator.animate`, but resolves at once without running when this play is no longer live. */
  animate(duration: number, step: (p: number) => void): Promise<void>;
}

export interface AnimatorOptions {
  timers?: TimerApi;
  /** Extra time after an animation's nominal length before the timeout fallback finishes it. */
  fallbackMs?: number;
  /** Called when the first animation starts (e.g. start the frame ticker). */
  onStart?: () => void;
  /** Called when the last animation finished (e.g. stop the ticker and draw once). */
  onIdle?: () => void;
  onError?: (err: unknown) => void;
}

export interface Animator {
  /** Runs `step(p)` for p in [0, 1] over `duration` ms of ticks; always resolves. */
  animate(duration: number, step: (p: number) => void): Promise<void>;
  /** Advances every animation by `deltaMS`; never throws. */
  tick(deltaMS: number): void;
  /** Finishes every running animation now (step(1), then resolve). */
  finishAll(): void;
  /** While set, animations apply their final step synchronously. */
  setInstant(value: boolean): void;
  isInstant(): boolean;
  /** Number of running animations. */
  readonly active: number;
  /**
   * Plays `events` in order through `handler`. Starting a newer play (or `cancel`) finishes the
   * older play's animations instantly, skips its remaining events and resolves it. A handler that
   * throws is logged and the next event still plays.
   */
  play<E>(events: readonly E[], handler: (event: E, ctx: PlayContext) => Promise<void> | void, instant: boolean): Promise<void>;
  /** Cancels the current play, if any. */
  cancel(): void;
  /** Cancels everything; later animations resolve at once. */
  dispose(): void;
}

interface Anim {
  elapsed: number;
  duration: number;
  step: (p: number) => void;
  resolve: () => void;
  timer: unknown;
}

const defaultTimers: TimerApi = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createAnimator(options: AnimatorOptions = {}): Animator {
  const timers = options.timers ?? defaultTimers;
  const fallbackMs = options.fallbackMs ?? 150;
  const onError = options.onError ?? ((err: unknown) => console.error('animation step failed', err));
  const anims = new Set<Anim>();
  let instant = false;
  let disposed = false;
  let generation = 0;

  const safe = (fn: (() => void) | undefined) => {
    if (!fn) return;
    try {
      fn();
    } catch (err) {
      onError(err);
    }
  };

  const runStep = (step: (p: number) => void, p: number): boolean => {
    try {
      step(p);
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  };

  const finish = (a: Anim) => {
    if (!anims.delete(a)) return;
    timers.clearTimeout(a.timer);
    try {
      runStep(a.step, 1);
    } finally {
      a.resolve();
    }
    if (anims.size === 0) safe(options.onIdle);
  };

  const finishAll = () => {
    for (const a of [...anims]) finish(a);
  };

  const animate = (duration: number, step: (p: number) => void): Promise<void> => {
    if (instant || disposed || duration <= 0) {
      runStep(step, 1);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const a: Anim = { elapsed: 0, duration, step, resolve, timer: undefined };
      a.timer = timers.setTimeout(() => finish(a), duration + fallbackMs);
      const wasIdle = anims.size === 0;
      anims.add(a);
      if (!runStep(step, 0)) {
        finish(a);
        return;
      }
      if (wasIdle) safe(options.onStart);
    });
  };

  const tick = (deltaMS: number) => {
    const dt = Number.isFinite(deltaMS) && deltaMS > 0 ? deltaMS : 0;
    for (const a of [...anims]) {
      if (!anims.has(a)) continue;
      a.elapsed += dt;
      if (a.elapsed >= a.duration) finish(a);
      else if (!runStep(a.step, a.elapsed / a.duration)) finish(a);
    }
  };

  return {
    animate,
    tick,
    finishAll,
    setInstant(value: boolean) {
      instant = value;
    },
    isInstant: () => instant,
    get active() {
      return anims.size;
    },
    async play(events, handler, playInstant) {
      const gen = ++generation;
      finishAll();
      instant = playInstant;
      const live = () => gen === generation && !disposed;
      const ctx: PlayContext = {
        live,
        animate: (duration, step) => (live() ? animate(duration, step) : Promise.resolve()),
      };
      try {
        for (const e of events) {
          if (!live()) break;
          try {
            await handler(e, ctx);
          } catch (err) {
            onError(err);
          }
        }
      } finally {
        if (gen === generation) {
          finishAll();
          instant = false;
        }
      }
    },
    cancel() {
      generation++;
      finishAll();
      instant = false;
    },
    dispose() {
      disposed = true;
      generation++;
      finishAll();
    },
  };
}
