// Heights of the console end screen, as pure functions of the text scale (see mapMetrics for why):
// the primary region holds the result scene (the flexible part), the score plate and a note; the
// rail holds New run and Back to start.
import { RAIL_GAP, lineHeight, messageHeight } from './battleMetrics';
import { textLines } from './textFit';
import { buttonHeight } from './titleMetrics';

export const MAIN_PAD = 4;
export const MAIN_GAP = 4;
export const RAIL_PAD = 4;
export const SCORE_LABEL_SIZE = 18;
export const SCORE_VALUE_SIZE = 28;
/** Vertical room the plate's frame and padding take. */
export const SCORE_CHROME = 24;
export const NOTE_SIZE = 14;
/** Lines the note takes at most (two, three when a long translation needs them in a narrow window). */
export const NOTE_LINES = 2;
export const NOTE_LINES_MAX = 3;

/** Lines of the note in a primary region `width` dp wide: at least one, at most NOTE_LINES_MAX (the scene gives way). */
export function noteLines(text: string, width: number, scale: number): number {
  return Math.min(NOTE_LINES_MAX, Math.max(1, textLines(text, width - 2 * MAIN_PAD, NOTE_SIZE, scale)));
}
/** The least the result scene gets. */
export const SCENE_MIN = 64;

export function scoreHeight(scale: number): number {
  return SCORE_CHROME + Math.max(lineHeight(SCORE_LABEL_SIZE, scale), lineHeight(SCORE_VALUE_SIZE, scale));
}

export function noteHeight(scale: number, lines = NOTE_LINES): number {
  return lines * lineHeight(NOTE_SIZE, scale);
}

/** What the scene gets of the primary region: in landscape the message line floats over its bottom edge. */
export function sceneHeight(primaryHeight: number, scale: number, landscape: boolean, noteLinesTaken = NOTE_LINES): number {
  return primaryHeight - (landscape ? messageHeight(scale, 1) : 0) - 2 * MAIN_PAD - 2 * MAIN_GAP - scoreHeight(scale) - noteHeight(scale, noteLinesTaken);
}

/** The rail: New run and Back to start. */
export function railHeight(scale: number): number {
  return 2 * RAIL_PAD + 2 * buttonHeight(scale) + RAIL_GAP;
}
