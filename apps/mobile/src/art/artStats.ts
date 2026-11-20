// Opt-in frame statistics of the scene art, for measuring on a device: build the bundle with
// EXPO_PUBLIC_ART_STATS=1 and every 5 s each scene logs one line, e.g.
//   [art] battle-stage fps=29.8 draw=4.1ms max=9ms
// (read them with `adb logcat -s ReactNativeJS`). Off by default: nothing is counted or logged.
export const ART_STATS = process.env.EXPO_PUBLIC_ART_STATS === '1';

const WINDOW_MS = 5000;

interface Window {
  start: number;
  frames: number;
  drawMs: number;
  maxMs: number;
}

const windows = new Map<string, Window>();

/** Records one drawn frame of scene `name` that took `ms` to build (no-op unless ART_STATS). */
export function recordFrame(name: string, now: number, ms: number, log: (line: string) => void = console.log): void {
  if (!ART_STATS) return;
  let w = windows.get(name);
  if (!w) {
    w = { start: now, frames: 0, drawMs: 0, maxMs: 0 };
    windows.set(name, w);
  }
  w.frames++;
  w.drawMs += ms;
  w.maxMs = Math.max(w.maxMs, ms);
  const span = now - w.start;
  if (span >= WINDOW_MS) {
    log(`[art] ${name} fps=${((w.frames * 1000) / span).toFixed(1)} draw=${(w.drawMs / w.frames).toFixed(1)}ms max=${w.maxMs}ms`);
    windows.set(name, { start: now, frames: 0, drawMs: 0, maxMs: 0 });
  }
}
