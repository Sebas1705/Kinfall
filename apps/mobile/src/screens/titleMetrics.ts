// Heights of the console title, as pure functions of the text scale (see mapMetrics for why): the
// primary region holds the hero (the one flexible part), the starter strip and the hint line; the
// rail holds the notice, Continue, New run and Discard.
import { RAIL_GAP, lineHeight } from './battleMetrics';

export const MAIN_PAD = 4;
export const MAIN_GAP = 4;
export const RAIL_PAD = 4;

// ---- the starter strip: three cards side by side ----
export const NAME_SIZE = 13;
export const HINT_SIZE = 13;
export const HINT_LINES = 2;
/** The creature's sprite: 24 cells at 2 dp. */
export const SPRITE_DP = 48;
/** Vertical room the card's frame takes around its content. */
export const CARD_CHROME = 16;
export const CARD_GAP = 2;

/** Fixed height of a starter card: the sprite and the name (one line) under it (48 at least). */
export function cardHeight(scale: number): number {
  return Math.max(48, CARD_CHROME + SPRITE_DP + CARD_GAP + lineHeight(NAME_SIZE, scale));
}

/** The hint of the chosen starter, below the strip. */
export function hintHeight(scale: number): number {
  return HINT_LINES * lineHeight(HINT_SIZE, scale);
}

/** The least the hero scene gets (the wordmark and a slice of the scene). */
export const HERO_MIN = 64;

/** What the hero gets of a primary region `primaryHeight` tall once the strip and the hint take theirs. */
export function heroHeight(primaryHeight: number, scale: number): number {
  return primaryHeight - 2 * MAIN_PAD - 2 * MAIN_GAP - cardHeight(scale) - hintHeight(scale);
}

// ---- the rail ----
export const BUTTON_CHROME = 16;
export const BUTTON_SIZE = 17;
export const NOTICE_SIZE = 14;
export type NoticeKind = 'unavailable' | 'corrupt';
/**
 * Lines of the save notice: the rail is narrow in landscape, wide in portrait, and a damaged save also
 * has the Discard button under its notice. A longer notice is cut visually only for a damaged save's
 * reason; its full text is also in the Discard sheet.
 */
export function noticeLinesCap(kind: NoticeKind, landscape: boolean): number {
  if (landscape) return kind === 'corrupt' ? 5 : 6;
  return 4;
}

/** A rail button: one line (shrinking to fit), at least 48 dp. */
export function buttonHeight(scale: number): number {
  return Math.max(48, BUTTON_CHROME + lineHeight(BUTTON_SIZE, scale));
}

export function noticeHeight(scale: number, kind: NoticeKind, landscape: boolean): number {
  return noticeLinesCap(kind, landscape) * lineHeight(NOTICE_SIZE, scale);
}

/** Total height of the rail: Continue and New run always, a notice (and Discard for a damaged save) when the save needs them. */
export function railHeight(scale: number, notice: NoticeKind | null, landscape: boolean): number {
  const parts = [buttonHeight(scale), buttonHeight(scale)];
  if (notice === 'corrupt') parts.push(buttonHeight(scale));
  if (notice) parts.unshift(noticeHeight(scale, notice, landscape));
  return 2 * RAIL_PAD + parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * RAIL_GAP;
}
