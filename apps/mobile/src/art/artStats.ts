// Opt-in frame statistics of the scene art, for measuring on a device: build the bundle with
// EXPO_PUBLIC_ART_STATS=1 and every 5 s each scene logs one line, e.g.
//   [art] battle-stage fps=29.8 busyFps=41.0 busyFrames=96 draw=1.1ms max=9ms
// `fps` counts every drawn frame over the window; `busyFps` only the frames drawn while effects or
// a turn played (time between consecutive busy frames). `draw` is the JS time to record a frame.
// Read them with `adb logcat -s ReactNativeJS`. Off by default: nothing is counted or logged.
export const ART_STATS = process.env.EXPO_PUBLIC_ART_STATS === '1';

const WINDOW_MS = 5000;
/** A gap longer than this between two busy frames is a pause, not a frame interval. */
const BUSY_GAP_MS = 200;

interface Window {
  start: number;
  frames: number;
  drawMs: number;
  maxMs: number;
  busyFrames: number;
  busyMs: number;
  lastBusy: number;
}

const windows = new Map<string, Window>();
const fresh = (start: number): Window => ({ start, frames: 0, drawMs: 0, maxMs: 0, busyFrames: 0, busyMs: 0, lastBusy: -Infinity });

/** Records one drawn frame of scene `name` that took `ms` to build (no-op unless ART_STATS). */
export function recordFrame(name: string, now: number, ms: number, busy = false, log: (line: string) => void = console.log): void {
  if (!ART_STATS) return;
  let w = windows.get(name);
  if (!w) {
    w = fresh(now);
    windows.set(name, w);
  }
  w.frames++;
  w.drawMs += ms;
  w.maxMs = Math.max(w.maxMs, ms);
  if (busy) {
    const gap = now - w.lastBusy;
    if (gap < BUSY_GAP_MS) {
      w.busyFrames++;
      w.busyMs += gap;
    }
    w.lastBusy = now;
  }
  const span = now - w.start;
  if (span >= WINDOW_MS) {
    const busyFps = w.busyMs > 0 ? ((w.busyFrames * 1000) / w.busyMs).toFixed(1) : '-';
    log(`[art] ${name} fps=${((w.frames * 1000) / span).toFixed(1)} busyFps=${busyFps} busyFrames=${w.busyFrames} draw=${(w.drawMs / w.frames).toFixed(1)}ms max=${w.maxMs}ms`);
    windows.set(name, fresh(now));
  }
}
