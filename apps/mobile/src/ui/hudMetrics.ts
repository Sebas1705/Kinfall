// What the HUD bar holds and how it fits, as pure functions (Jest cannot measure text, see
// screens/textFit.ts): the heading, the party as chips and the two buttons share one fixed-height
// row. The plan picks, in order of preference, full chips ("Brambleback 12/12") or one compact chip
// ("heart 3 !"), and a one-line or two-line heading, so that the estimated widths fit the row; the
// full party is always in the Run sheet and each chip's accessible name has the member's HP.
import { lineHeight } from '../screens/battleMetrics';
import { textWidth } from '../screens/textFit';

export const HUD_PAD = 8;
export const HUD_GAP = 8;
export const TITLE_SIZE = 16;
/** The heading's size when it takes two lines. */
export const TITLE_SIZE_2 = 13;
export const BUTTON_SIZE = 13;
/** Padding and border around a button's text (dp, both sides). */
export const BUTTON_CHROME = 16;
export const BUTTON_MIN = 48;
export const CHIP_SIZE = 13;
/** Padding and border around a chip's text (dp, both sides). */
export const CHIP_CHROME = 14;

export type ChipMode = 'full' | 'compact' | 'none';
export interface HudPlan {
  chips: ChipMode;
  titleLines: 1 | 2;
  /** The row's estimated content width and what the row has (dp), for the tests. */
  need: number;
  have: number;
}

export interface HudInput {
  /** The HUD's width (dp). */
  width: number;
  scale: number;
  title: string;
  /** Full chip texts ("Name hp/max"), in party order. */
  chips: string[];
  /** The compact chip's text. */
  compact: string;
  /** Labels of the buttons (the extra one, if any, and Settings). */
  buttons: string[];
}

export function buttonWidth(label: string, scale: number): number {
  return Math.max(BUTTON_MIN, textWidth(label.length, BUTTON_SIZE, scale) + BUTTON_CHROME);
}

export function chipWidth(text: string, scale: number): number {
  return textWidth(text.length, CHIP_SIZE, scale) + CHIP_CHROME;
}

/** Height of the heading's lines in the bar (the bar is at least this tall, see the contract's HUD height). */
export function titleHeight(lines: 1 | 2, scale: number): number {
  return lines * lineHeight(lines === 1 ? TITLE_SIZE : TITLE_SIZE_2, scale);
}

export function hudPlan(input: HudInput): HudPlan {
  const { width, scale, title, chips, compact, buttons } = input;
  const have = width - 2 * HUD_PAD;
  const buttonsW = buttons.reduce((a, b) => a + buttonWidth(b, scale), 0) + buttons.length * HUD_GAP;
  const chipsW = (mode: ChipMode): number => {
    if (mode === 'none' || chips.length === 0) return 0;
    const texts = mode === 'full' ? chips : [compact];
    return texts.reduce((a, c) => a + chipWidth(c, scale), 0) + (texts.length - 1) * 4 + HUD_GAP;
  };
  const order: Array<[ChipMode, 1 | 2]> = [
    ['full', 1],
    ['compact', 1],
    ['full', 2],
    ['compact', 2],
    ['none', 1],
    ['none', 2],
  ];
  const titleNeed = (lines: 1 | 2) => Math.ceil(textWidth(title.length, lines === 1 ? TITLE_SIZE : TITLE_SIZE_2, scale) / lines / 0.9);
  for (const [mode, lines] of order) {
    const need = titleNeed(lines) + chipsW(mode) + buttonsW;
    if (need <= have) return { chips: chips.length === 0 ? 'none' : mode, titleLines: lines, need, have };
  }
  const need = titleNeed(2) + buttonsW;
  return { chips: 'none', titleLines: 2, need, have };
}
