// Heights of the console event screen, as pure functions of the text scale (see mapMetrics for why):
// the choices are the rail (one column in landscape, two in portrait), the primary region holds an
// optional vignette beside the text (description, offer card, note), each with a bounded number of
// lines.
import { VIGNETTE_HEIGHT, VIGNETTE_WIDTH } from '@kinfall/core/art/scene';
import { lineHeight } from './battleMetrics';
import { textLines } from './textFit';

// ---- the choices ----
export const CHOICE_LABEL_SIZE = 14;
export const CHOICE_DETAIL_SIZE = 10;
/** Vertical room the button frame takes (its content insets and ring) around the text. */
export const CHOICE_CHROME = 14;
/** Horizontal room a choice cell takes around its text: the frame (16) and the widest padding (a replace choice's stripe, 10 + 2). */
export const CHOICE_INSET = 28;
export const CHOICE_PAD = 1;
export const CHOICE_GAP = 1;
export const COLUMNS_PORTRAIT = 2;
/** Share of the content width the landscape rail takes at least (details stay on few lines). */
export const RAIL_SHARE = 0.6;
/** Widest the landscape rail gets. */
export const RAIL_MAX = 360;

/** The text of a choice as the screen shows it. */
export interface ChoiceText {
  label: string;
  detail?: string;
}

/** Width of the landscape rail: the contract's, or wider so that five choices with details fit. */
export function railWidth(contentWidth: number, contractWidth: number): number {
  return Math.min(RAIL_MAX, Math.max(contractWidth, Math.round(RAIL_SHARE * contentWidth)));
}

/** Width of one choice cell: the whole rail in landscape, half the band in portrait. */
export function cellWidth(landscape: boolean, railOrContentWidth: number): number {
  return landscape ? railOrContentWidth - 2 * CHOICE_PAD : Math.floor((railOrContentWidth - 2 * CHOICE_PAD - CHOICE_GAP) / COLUMNS_PORTRAIT);
}

/** Lines the detail of a choice takes in a cell `width` dp wide (0 without a detail). */
export function detailLines(c: ChoiceText, width: number, scale: number): number {
  return c.detail ? textLines(c.detail, width - CHOICE_INSET, CHOICE_DETAIL_SIZE, scale) : 0;
}

/** Lines the label of a choice takes in a cell `width` dp wide: one in the wide landscape rail, two at most when it needs them. */
export function labelLines(c: ChoiceText, width: number, scale: number): number {
  return textLines(c.label, width - CHOICE_INSET, CHOICE_LABEL_SIZE, scale);
}

/** Fixed height of a choice cell with `labels` lines of label and `lines` lines of detail (48 at least). */
export function choiceHeight(scale: number, lines: number, labels = 1): number {
  return Math.max(48, CHOICE_CHROME + labels * lineHeight(CHOICE_LABEL_SIZE, scale) + lines * lineHeight(CHOICE_DETAIL_SIZE, scale));
}

/** Total height of the rail for `choices`; in portrait the cells sit in two columns (a row is as tall as its tallest cell). */
export function railHeight(scale: number, choices: ChoiceText[], width: number, landscape: boolean): number {
  const cell = (c: ChoiceText) => choiceHeight(scale, detailLines(c, width, scale), labelLines(c, width, scale));
  const rows: number[] = [];
  if (landscape) for (const c of choices) rows.push(cell(c));
  else for (let i = 0; i < choices.length; i += COLUMNS_PORTRAIT) rows.push(Math.max(...choices.slice(i, i + COLUMNS_PORTRAIT).map(cell)));
  return 2 * CHOICE_PAD + rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * CHOICE_GAP;
}

// ---- the primary region ----
export const MAIN_PAD = 4;
export const MAIN_GAP = 8;
export const DESC_SIZE = 15;
export const NOTE_SIZE = 14;
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

/** The texts of the body: the description, whether there is an offer card, and the note. */
export interface BodyText {
  desc: string;
  offer: boolean;
  note?: string;
}

export interface BodyPlan {
  /** Cell size of the vignette beside the text, or 0 when it steps aside (it is decoration). */
  cell: number;
  /** Lines the description and the note take in the text column (the screen shows exactly this many). */
  descLines: number;
  noteLines: number;
  /** Height of the tallest part of the body, padding included. */
  height: number;
}

function planFor(width: number, scale: number, text: BodyText, cell: number): BodyPlan {
  const textWidthDp = width - 2 * MAIN_PAD - (cell > 0 ? vignetteBox(cell).width + MAIN_GAP : 0);
  const descLines = textLines(text.desc, textWidthDp, DESC_SIZE, scale);
  const noteLines = text.note ? textLines(text.note, textWidthDp - 14, NOTE_SIZE, scale) : 0;
  const parts = [descLines * lineHeight(DESC_SIZE, scale)];
  if (text.offer) parts.push(offerHeight(scale));
  if (noteLines > 0) parts.push(noteLines * lineHeight(NOTE_SIZE, scale));
  const textH = parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * MAIN_GAP;
  return { cell, descLines, noteLines, height: 2 * MAIN_PAD + Math.max(textH, cell > 0 ? vignetteBox(cell).height : 0) };
}

/**
 * The body of the primary region (`width` x `height` dp, the message line's room already taken
 * off): the largest vignette that still leaves the text column TEXT_MIN_WIDTH and whose plan fits the
 * height, else no vignette. Line counts come from the (conservative) estimate of the actual
 * strings, so no text is ever cut: when even the full-width plan does not fit the height, the test
 * says so (the text then belongs in the Run sheet).
 */
export function bodyPlan(width: number, height: number, scale: number, text: BodyText): BodyPlan {
  for (const cell of [...VIGNETTE_CELLS].reverse()) {
    if (width - 2 * MAIN_PAD - vignetteBox(cell).width - MAIN_GAP < TEXT_MIN_WIDTH) continue;
    const plan = planFor(width, scale, text, cell);
    if (plan.height <= height) return plan;
  }
  return planFor(width, scale, text, 0);
}
