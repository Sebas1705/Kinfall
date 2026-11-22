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
/** The smallest one-line heading size, the last resort before the heading is cut with an ellipsis. */
export const TITLE_SIZE_MIN = 12;
export const BUTTON_SIZE = 13;
/** Padding and border around a button's text (dp, both sides). */
export const BUTTON_CHROME = 16;
export const BUTTON_MIN = 48;
export const CHIP_SIZE = 13;
/** Padding and border around a chip's text (dp, both sides). */
export const CHIP_CHROME = 14;

/** Characters of the heading that must stay visible when it is cut with an ellipsis (the full text stays its accessible name). */
export const TITLE_CUT_MIN_CHARS = 8;

export type ChipMode = 'full' | 'compact' | 'none';
export interface HudPlan {
  chips: ChipMode;
  titleLines: 1 | 2;
  /** The heading's font size (dp): 16 on one line, 13 on two, 12 on one line when nothing larger fits. */
  titleSize: number;
  /** True when the heading is cut with an ellipsis (it still keeps TITLE_CUT_MIN_CHARS characters). */
  titleCut: boolean;
  /** The width left for the heading (dp) once the chips and the buttons have theirs, for the tests. */
  titleRoom: number;
  /** The row's estimated content width and what the row has (dp), for the tests. */
  need: number;
  have: number;
}

export interface HudInput {
  /** The HUD's width (dp). */
  width: number;
  /** The HUD's height (dp): a heading option taller than the bar is skipped. Omitted in the fallback, where the bar grows. */
  height?: number;
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
export function titleHeight(lines: 1 | 2, scale: number, size = lines === 1 ? TITLE_SIZE : TITLE_SIZE_2): number {
  return lines * lineHeight(size, scale);
}

export function hudPlan(input: HudInput): HudPlan {
  const { width, height, scale, title, chips, compact, buttons } = input;
  const have = width - 2 * HUD_PAD;
  const buttonsW = buttons.reduce((a, b) => a + buttonWidth(b, scale), 0) + buttons.length * HUD_GAP;
  const chipsW = (mode: ChipMode): number => {
    if (mode === 'none' || chips.length === 0) return 0;
    const texts = mode === 'full' ? chips : [compact];
    return texts.reduce((a, c) => a + chipWidth(c, scale), 0) + (texts.length - 1) * 4 + HUD_GAP;
  };
  // Heading options, in order of preference; one that is taller than the bar is skipped (at 200% text
  // two lines of 13 sp are 66 dp in a 60 dp bar).
  const titles: Array<[1 | 2, number]> = ([[1, TITLE_SIZE], [2, TITLE_SIZE_2], [1, TITLE_SIZE_MIN]] as Array<[1 | 2, number]>).filter(
    ([lines, size]) => height === undefined || titleHeight(lines, scale, size) <= height,
  );
  const titleNeed = (lines: 1 | 2, size: number) => Math.ceil(textWidth(title.length, size, scale) / lines / 0.9);
  // The heading keeps its preferred form over the chips' size, and the chips go before the heading is
  // squeezed any further: full then compact for each heading option, and no chips only after all of them.
  const attempts: Array<[ChipMode, 1 | 2, number]> = [];
  for (const [lines, size] of titles) for (const mode of ['full', 'compact'] as const) attempts.push([mode, lines, size]);
  for (const [lines, size] of titles) attempts.push(['none', lines, size]);
  for (const [mode, lines, size] of attempts) {
    const need = titleNeed(lines, size) + chipsW(mode) + buttonsW;
    if (need <= have) return { chips: chips.length === 0 ? 'none' : mode, titleLines: lines, titleSize: size, titleCut: false, titleRoom: have - chipsW(mode) - buttonsW, need, have };
  }
  // Nothing fits whole: the smallest heading on one line, no chips, cut with an ellipsis. It keeps
  // TITLE_CUT_MIN_CHARS characters (the heading's full text is still its accessible name).
  const [lines, size] = titles[titles.length - 1] ?? [1, TITLE_SIZE_MIN];
  const titleRoom = have - buttonsW;
  return { chips: 'none', titleLines: lines, titleSize: size, titleCut: true, titleRoom, need: titleNeed(lines, size) + buttonsW, have };
}
