// Heights of the console hub, as pure functions of the text scale (see mapMetrics for why): the
// primary region holds the heading and one card per registered game (a playable game shows its name
// and, under it, its tagline; a game that is not playable yet shows its name and the "Coming soon"
// badge on one row, which keeps the three cards within a phone's portrait primary region); the rail
// holds Play. In landscape the one-line announcement of a game that is not playable yet is reserved
// under the cards (battleMetrics.messageHeight); in portrait it sits in the info band.
import { GAMES, type GameDef } from '@kinfall/core/games/registry';

import { lineHeight, messageHeight, RAIL_GAP } from './battleMetrics';
import { textLines } from './textFit';
import { buttonHeight } from './titleMetrics';

export const MAIN_PAD = 4;
export const MAIN_GAP = 4;
export const RAIL_PAD = 4;
export { RAIL_GAP, buttonHeight };

export const HEADING_SIZE = 15;
export const NAME_SIZE = 16;
export const TAGLINE_SIZE = 13;
/** The most lines a playable game's tagline takes; it shrinks to fit them (down to TAGLINE_MIN_SCALE). */
export const TAGLINE_LINES_MAX = 3;
export const TAGLINE_MIN_SCALE = 0.7;
export const BADGE_SIZE = 12;
/** Vertical room the card's frame takes around its content (as the title's starter cards). */
export const CARD_CHROME = 16;
/** Space between the name and the tagline of a playable card, and between the name and the badge of a soon card. */
export const CARD_GAP = 4;
/** Padding and border of the badge, top and bottom. */
export const BADGE_CHROME = 4;

export function headingHeight(scale: number): number {
  return lineHeight(HEADING_SIZE, scale);
}

/** The badge: one line of text with its padding and border. */
export function badgeHeight(scale: number): number {
  return lineHeight(BADGE_SIZE, scale) + BADGE_CHROME;
}

/** Horizontal room a card frame and padding take (both sides): the text lines wrap in what is left. */
export const CARD_SIDE = 24;

/**
 * Lines a tagline takes in a primary region `primaryWidth` wide (1 to TAGLINE_LINES_MAX): the estimate of
 * the text at its smallest shrunk size, which is the size the card text view fits it to. A longer text
 * than the cap is cut (the accessible name of the card has it all), and the fit tests prove it never is.
 */
export function taglineLines(text: string, primaryWidth: number, scale: number): number {
  const inner = primaryWidth - 2 * MAIN_PAD - CARD_SIDE;
  return Math.min(TAGLINE_LINES_MAX, textLines(text, inner, TAGLINE_SIZE * TAGLINE_MIN_SCALE, scale));
}

/**
 * Height of a card; 48 dp at least. A playable game: the name over its tagline (`lines` lines). A game
 * that is not playable yet: the name and the badge side by side, so the row is as tall as the taller.
 */
export function cardHeight(scale: number, status: GameDef['status'], lines = 2): number {
  const body =
    status === 'playable'
      ? lineHeight(NAME_SIZE, scale) + 2 + lines * lineHeight(TAGLINE_SIZE, scale)
      : Math.max(lineHeight(NAME_SIZE, scale), badgeHeight(scale));
  return Math.max(48, CARD_CHROME + body);
}

/** Every card plus the gaps between them; `lines` is the tagline lines of the playable cards. */
export function listHeight(scale: number, lines = 2): number {
  return GAMES.reduce((sum, g) => sum + cardHeight(scale, g.status, lines), 0) + (GAMES.length - 1) * MAIN_GAP;
}

/** The primary region content: padding, the heading (when shown) and the card list. */
export function mainHeight(scale: number, lines = 2, heading = true): number {
  return 2 * MAIN_PAD + (heading ? headingHeight(scale) + MAIN_GAP : 0) + listHeight(scale, lines);
}

/** What the primary region must have: the content, and in landscape the reserved announcement line. */
export function primaryNeed(scale: number, landscape: boolean, lines = 2, heading = true): number {
  return mainHeight(scale, lines, heading) + (landscape ? messageHeight(scale, 1) : 0);
}

/** Room the fit tests keep free in the primary region (a gesture bar or cutout inset the contract does not know). */
export const SPARE = 10;

/**
 * Whether the visible heading ("Choose a game") has room above the cards. The cards come first: a tight
 * window (a large text on a narrow phone, where the Spanish tagline takes three lines) drops the heading,
 * and the list keeps its accessible name (the radio group label) and the app title stays in the HUD.
 */
export function showHeading(primaryHeight: number, scale: number, landscape: boolean, lines = 2): boolean {
  return primaryNeed(scale, landscape, lines, true) + SPARE <= primaryHeight;
}

/** The rail: Play. */
export function railHeight(scale: number): number {
  return 2 * RAIL_PAD + buttonHeight(scale);
}

/** Padding and border of the badge, left and right, both sides together. */
export const BADGE_PAD_X = 10;
