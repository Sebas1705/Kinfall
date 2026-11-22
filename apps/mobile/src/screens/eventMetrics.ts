// Heights of the console event screen, as pure functions of the text scale (see mapMetrics for why):
// the choices are the rail (one column in landscape, two in portrait), the primary region holds an
// optional vignette beside the text (description, offer card, note), each with a bounded number of
// lines.
import { VIGNETTE_HEIGHT, VIGNETTE_WIDTH } from '@kinfall/core/art/scene';
import { lineHeight } from './battleMetrics';

// ---- the choices ----
export const CHOICE_LABEL_SIZE = 15;
export const CHOICE_DETAIL_SIZE = 12;
/** Vertical room the button frame takes (its content insets and ring) around the text. */
export const CHOICE_CHROME = 16;
export const CHOICE_PAD = 2;
export const CHOICE_GAP = 2;
/** Detail lines of a choice: one in the wide landscape rail, two in the half-width portrait cells. */
export const DETAIL_LINES_LANDSCAPE = 1;
export const DETAIL_LINES_PORTRAIT = 2;
export const COLUMNS_PORTRAIT = 2;
/** Share of the content width the landscape rail takes at least (details stay on one line). */
export const RAIL_SHARE = 0.55;
/** Widest the landscape rail gets. */
export const RAIL_MAX = 360;

/** Width of the landscape rail: the contract's, or wider so that five choices with details fit. */
export function railWidth(contentWidth: number, contractWidth: number): number {
  return Math.min(RAIL_MAX, Math.max(contractWidth, Math.round(RAIL_SHARE * contentWidth)));
}

/** Fixed height of a choice cell with `detailLines` lines of detail (48 at least). */
export function choiceHeight(scale: number, detailLines: number): number {
  return Math.max(48, CHOICE_CHROME + lineHeight(CHOICE_LABEL_SIZE, scale) + detailLines * lineHeight(CHOICE_DETAIL_SIZE, scale));
}

/** Total height of the rail for `choices`; in portrait the cells sit in two columns (a row is as tall as its tallest cell). */
export function railHeight(scale: number, choices: Array<{ detail: boolean }>, landscape: boolean): number {
  const lines = landscape ? DETAIL_LINES_LANDSCAPE : DETAIL_LINES_PORTRAIT;
  const cell = (c: { detail: boolean }) => choiceHeight(scale, c.detail ? lines : 0);
  const rows: number[] = [];
  if (landscape) for (const c of choices) rows.push(cell(c));
  else for (let i = 0; i < choices.length; i += COLUMNS_PORTRAIT) rows.push(Math.max(...choices.slice(i, i + COLUMNS_PORTRAIT).map(cell)));
  return 2 * CHOICE_PAD + rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * CHOICE_GAP;
}

// ---- the primary region ----
export const MAIN_PAD = 4;
export const MAIN_GAP = 8;
export const DESC_SIZE = 15;
export const DESC_LINES = 3;
export const NOTE_SIZE = 14;
export const NOTE_LINES = 3;
export const OFFER_NAME_SIZE = 16;
export const OFFER_DETAIL_SIZE = 13;
/** The offer card's sprite: 24 cells at 2 dp. */
export const OFFER_SPRITE = 48;
export const OFFER_CHROME = 24;
/** The vignette plate's frame, per side (dp): 5 cells of 2 dp across, 4 down. */
export const VIGNETTE_FRAME_X = 10;
export const VIGNETTE_FRAME_Y = 8;
/** Vignette cell sizes (dp) the screen may use, smallest first. */
export const VIGNETTE_CELLS = [2, 3] as const;
/** A vignette needs a text column at least this wide beside it (dp). */
export const TEXT_MIN_WIDTH = 190;

export function vignetteBox(cell: number): { width: number; height: number } {
  return { width: VIGNETTE_WIDTH * cell + 2 * VIGNETTE_FRAME_X, height: VIGNETTE_HEIGHT * cell + 2 * VIGNETTE_FRAME_Y };
}

export function offerHeight(scale: number): number {
  return OFFER_CHROME + Math.max(OFFER_SPRITE, lineHeight(OFFER_NAME_SIZE, scale) + lineHeight(OFFER_DETAIL_SIZE, scale));
}

/** Height of the text column: description, then the offer card and the note when there are any. */
export function textHeight(scale: number, show: { offer: boolean; note: boolean }): number {
  const parts = [DESC_LINES * lineHeight(DESC_SIZE, scale)];
  if (show.offer) parts.push(offerHeight(scale));
  if (show.note) parts.push(NOTE_LINES * lineHeight(NOTE_SIZE, scale));
  return parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * MAIN_GAP;
}

export interface BodyPlan {
  /** Cell size of the vignette beside the text, or 0 when it steps aside (it is decoration). */
  cell: number;
  /** Height of the tallest part of the body, padding included. */
  height: number;
}

/**
 * The body of the primary region (`width` x `height` dp, the message line's room already taken
 * off): the largest vignette that still leaves the text column `TEXT_MIN_WIDTH` and fits the
 * height, else no vignette. The text column is bounded, so a plan that fits keeps fitting.
 */
export function bodyPlan(width: number, height: number, scale: number, show: { offer: boolean; note: boolean }): BodyPlan {
  const text = textHeight(scale, show);
  const inner = width - 2 * MAIN_PAD;
  for (const cell of [...VIGNETTE_CELLS].reverse()) {
    const box = vignetteBox(cell);
    if (inner - box.width - MAIN_GAP >= TEXT_MIN_WIDTH && Math.max(text, box.height) <= height - 2 * MAIN_PAD) {
      return { cell, height: 2 * MAIN_PAD + Math.max(text, box.height) };
    }
  }
  return { cell: 0, height: 2 * MAIN_PAD + text };
}
