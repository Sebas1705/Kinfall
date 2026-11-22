// Heights and widths of the console map, as pure functions of the window and the text scale. Jest
// cannot measure a layout, so every size the board depends on is bounded (a fixed node cell, one
// line for the step label, a fixed short-name height) and MapView's styles read these same
// constants; runMetrics.test.ts then proves by arithmetic that the worst bounded map fits.
import { lineHeight, messageHeight } from './battleMetrics';

/** A zone has at most 7 layers (the boss is the last, alone) and at most 3 nodes in each. */
export const MAP_LAYERS = 7;
export const MAP_MAX_NODES = 3;

export const BOARD_PAD = 4;
/** Smallest touch target (dp), both ways. */
export const NODE_MIN = 48;
/** Widest a node gets on a roomy window (dp). */
export const NODE_MAX_W = 64;
/** The step label above a column ("Step 3"); one line. */
export const STEP_SIZE = 12;
export const STEP_GAP = 2;
export const NODE_GAP = 2;
/**
 * The short type name under a node's frame (the first word of its label). Fixed size on purpose: the
 * board's columns are 48 to 64 dp wide, so the name cannot grow with the text; the full label and
 * the state are in the rail's readout (which does scale) and in the node's accessible name.
 */
export const NAME_SIZE = 10;
export const NAME_GAP = 1;
export const NAME_LINE = Math.ceil(NAME_SIZE * 1.25);

/** Width of one layer's column on a primary region `primaryWidth` dp wide. */
export function columnWidth(primaryWidth: number): number {
  return Math.floor((primaryWidth - 2 * BOARD_PAD) / MAP_LAYERS);
}

/** A node is never narrower than a touch target: on a very narrow window it overlaps its neighbours slightly. */
export function nodeWidth(column: number): number {
  return Math.min(NODE_MAX_W, Math.max(NODE_MIN, column));
}

/** Height of one node cell: the 48 dp frame and the short name under it. */
export function nodeCellHeight(): number {
  return NODE_MIN + NAME_GAP + NAME_LINE;
}

/** Height of one layer's column with `nodes` nodes. */
export function columnHeight(scale: number, nodes = MAP_MAX_NODES): number {
  return lineHeight(STEP_SIZE, scale) + STEP_GAP + nodes * nodeCellHeight() + (nodes - 1) * NODE_GAP;
}

/** Height of the whole board (padding included) for the tallest column. */
export function boardHeight(scale: number): number {
  return 2 * BOARD_PAD + columnHeight(scale);
}

/** What the board gets of the primary region: in landscape the message line floats over its bottom edge. */
export function boardAvailable(primaryHeight: number, scale: number, landscape: boolean): number {
  return primaryHeight - (landscape ? messageHeight(scale, 1) : 0);
}

// ---- the rail: the readout of the focused node ----
export const READOUT_LABEL_SIZE = 15;
export const READOUT_STATE_SIZE = 13;
/** Vertical room the readout plate's frame and padding take. */
export const READOUT_CHROME = 24;
export const RAIL_PAD = 4;
/** The legend under the readout (the glyphs that carry a state without colour): at most two lines. */
export const LEGEND_SIZE = 13;
export const LEGEND_LINES = 2;
export const RAIL_GAP = 4;

/** Height of the readout plate: the node's name and its state, one line each. */
export function readoutHeight(scale: number): number {
  return READOUT_CHROME + lineHeight(READOUT_LABEL_SIZE, scale) + lineHeight(READOUT_STATE_SIZE, scale);
}

/** Height of the whole rail: the readout plate and the legend in their padding. */
export function railHeight(scale: number): number {
  return 2 * RAIL_PAD + readoutHeight(scale) + RAIL_GAP + LEGEND_LINES * lineHeight(LEGEND_SIZE, scale);
}
