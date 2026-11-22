// Heights of the console end screen, as pure functions of the text scale (see mapMetrics for why):
// the primary region holds the result scene (the flexible part), the score plate and a note; the
// rail holds New run and Back to start.
import { RAIL_GAP, lineHeight, messageHeight } from './battleMetrics';
import { buttonHeight } from './titleMetrics';

export const MAIN_PAD = 4;
export const MAIN_GAP = 4;
export const RAIL_PAD = 4;
export const SCORE_LABEL_SIZE = 18;
export const SCORE_VALUE_SIZE = 28;
/** Vertical room the plate's frame and padding take. */
export const SCORE_CHROME = 24;
export const NOTE_SIZE = 14;
export const NOTE_LINES = 2;
/** The least the result scene gets. */
export const SCENE_MIN = 64;

export function scoreHeight(scale: number): number {
  return SCORE_CHROME + Math.max(lineHeight(SCORE_LABEL_SIZE, scale), lineHeight(SCORE_VALUE_SIZE, scale));
}

export function noteHeight(scale: number): number {
  return NOTE_LINES * lineHeight(NOTE_SIZE, scale);
}

/** What the scene gets of the primary region: in landscape the message line floats over its bottom edge. */
export function sceneHeight(primaryHeight: number, scale: number, landscape: boolean): number {
  return primaryHeight - (landscape ? messageHeight(scale, 1) : 0) - 2 * MAIN_PAD - 2 * MAIN_GAP - scoreHeight(scale) - noteHeight(scale);
}

/** The rail: New run and Back to start. */
export function railHeight(scale: number): number {
  return 2 * RAIL_PAD + 2 * buttonHeight(scale) + RAIL_GAP;
}
