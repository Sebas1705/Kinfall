// Every (window, text scale, screen) the layout contract (packages/core/src/layout/spec.ts) calls a
// console, generated from the contract itself so the fit proofs cannot drift from it: when a budget
// moves, the rows move with it. Lives outside __tests__ so Jest does not take it for a suite.
import { effectiveTextScale, layoutSpec, type ScreenId } from '@kinfall/core/layout/spec';

/** The window sizes (dp) of the test matrix: phones both ways, a tablet, desktops, a short window. */
export const WINDOW_SIZES: ReadonlyArray<readonly [number, number]> = [
  [360, 640],
  [411, 914],
  [600, 800],
  [640, 360],
  [800, 1280],
  [914, 411],
  [1280, 800],
  [1366, 768],
  [1920, 1080],
];
/** System font scales (the contract caps the effective scale at 2). */
export const FONT_SCALES: readonly number[] = [1, 1.3, 1.5, 2];

export type ConsoleRow = [label: string, width: number, height: number, fontScale: number];

/** The rows where `screen` is a console, labelled like "411x914 at 200%". */
export function consoleRows(screen: ScreenId): ConsoleRow[] {
  const rows: ConsoleRow[] = [];
  for (const [w, h] of WINDOW_SIZES) {
    for (const fs of FONT_SCALES) {
      const scale = effectiveTextScale(fs, 1);
      if (layoutSpec({ width: w, height: h, textScale: scale }, screen).mode !== 'console') continue;
      rows.push([`${w}x${h} at ${Math.round(fs * 100)}%`, w, h, fs]);
    }
  }
  return rows;
}

/** Windows only the fallback sees (the contract's 320 dp wide row and a window under 320 high), besides the matrix. */
const FALLBACK_EXTRA: ReadonlyArray<readonly [number, number]> = [
  [320, 640],
  [560, 300],
];

/** The rows where `screen` is the fallback (huge text or a very short window). */
export function fallbackRows(screen: ScreenId): ConsoleRow[] {
  const rows: ConsoleRow[] = [];
  for (const [w, h] of [...WINDOW_SIZES, ...FALLBACK_EXTRA]) {
    for (const fs of FONT_SCALES) {
      const scale = effectiveTextScale(fs, 1);
      if (layoutSpec({ width: w, height: h, textScale: scale }, screen).mode !== 'fallback') continue;
      rows.push([`${w}x${h} at ${Math.round(fs * 100)}%`, w, h, fs]);
    }
  }
  return rows;
}
