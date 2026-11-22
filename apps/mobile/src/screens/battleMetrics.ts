// Heights of the battle screen's parts, as pure functions of the text scale. Jest cannot measure a
// layout, so every height the console battle depends on is bounded (one line of text per row, fixed
// cell and plate heights) and BattleView's styles read these same constants; a test then proves by
// arithmetic that the rail fits its region and that the stage keeps at least the art's own height.
import { SCENE_HEIGHT } from '@kinfall/core/art/scene';

/** Sky rows the short stage crops (the band keeps both creatures and their platforms). */
export const COMPACT_CROP_TOP = 50;
/** Rows of the scene the stage always shows (the creatures never lie in the cropped sky). */
export const STAGE_MIN_ROWS = SCENE_HEIGHT - COMPACT_CROP_TOP;
/** The lowest screen density the stage floor is proven for (xhdpi): a scene row is 1 device px at scale 1. */
export const MIN_DENSITY = 2;
/** The least height (dp) the stage box may have: the art's scale-1 height at the lowest density. */
export const STAGE_MIN_DP = Math.ceil(STAGE_MIN_ROWS / MIN_DENSITY);

/** Height of one line of text at `size` sp (a generous 1.25 line height) and text scale `scale`. */
export function lineHeight(size: number, scale: number): number {
  return Math.ceil(size * 1.25 * Math.max(1, scale));
}

// ---- the choice rail / band ----
export const CHOICE_COLUMNS = 2;
export const LABEL_SIZE = 15;
export const DETAIL_SIZE = 12;
export const PROMPT_SIZE = 15;
/** Vertical room the button frame takes (its content insets and ring) around the text. */
export const CELL_CHROME = 24;
export const RAIL_PAD = 4;
export const RAIL_GAP = 4;
/** The thin divider that stands for a group's text header (the header role and name stay on it). */
export const DIVIDER = 2;
export const GROUP_GAP = 2;
export const ROW_GAP = 4;

/** The fixed height of a choice cell: the frame, one line of label and one of detail (48 at least). */
export function choiceCellHeight(scale: number): number {
  return Math.max(48, CELL_CHROME + lineHeight(LABEL_SIZE, scale) + lineHeight(DETAIL_SIZE, scale));
}

/** Total height of the rail for `moves` and `swaps` choices (the prompt, a divider per group, the rows). */
export function railHeight(scale: number, moves: number, swaps: number, columns = CHOICE_COLUMNS): number {
  const cell = choiceCellHeight(scale);
  const group = (n: number) => {
    const rows = Math.ceil(n / columns);
    return DIVIDER + GROUP_GAP + rows * cell + (rows - 1) * ROW_GAP;
  };
  const parts = [lineHeight(PROMPT_SIZE, scale), ...[moves, swaps].filter((n) => n > 0).map(group)];
  return 2 * RAIL_PAD + parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * RAIL_GAP;
}

// ---- the creature plates ----
export const NAME_SIZE = 16;
export const VALUE_SIZE = 14;
export const INTENT_SIZE = 14;
/** Vertical room the plate frame takes around its content. */
export const PLATE_CHROME = 20;
/** The HP bar (track, rim and outline: 7 frame cells of 2 dp). */
export const BAR_HEIGHT = 14;
export const PLATE_GAP = 2;

/** Fixed height of a plate: name row, HP and focus line, bar and, for the rival, the intent line. */
export function plateHeight(scale: number, withIntent: boolean): number {
  const rows = [lineHeight(NAME_SIZE, scale), lineHeight(VALUE_SIZE, scale), BAR_HEIGHT, ...(withIntent ? [lineHeight(INTENT_SIZE, scale)] : [])];
  return PLATE_CHROME + rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * PLATE_GAP;
}

// ---- the primary region ----
export const MAIN_PAD = 2;
export const MAIN_GAP = 2;

/** What the stage box gets of a primary region `primaryHeight` tall once both plates take theirs. */
export function stageBoxHeight(primaryHeight: number, scale: number): number {
  return primaryHeight - 2 * MAIN_PAD - 2 * MAIN_GAP - plateHeight(scale, true) - plateHeight(scale, false);
}

// ---- the message line ----
export const MESSAGE_SIZE = 13;
export const MESSAGE_BORDER = 1;

/** Height of the message line with `lines` lines of text. */
export function messageHeight(scale: number, lines: number): number {
  return MESSAGE_BORDER + lines * lineHeight(MESSAGE_SIZE, scale);
}
