// HUD frames as nine-slice pixel grids: plates (panels), buttons in four states and bar tracks,
// in the dusk (dark) or parchment (light) theme, with the zone accent on the corner gems.
// The platform draws real text inside `content`; frames never carry words.
import type { PixelGrid } from '../palette';
import type { Hex } from './color';
import { Grid } from './grid';
import { UI_PALETTES, ZONE_PALETTES, type UiPalette, type UiTheme, type ZoneId } from './palettes';

export interface Insets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * A nine-slice frame. Corners (`slice` cells from each edge) are drawn as is, edges stretch along
 * one axis and the centre stretches both ways; always scale by a whole number first. `content`
 * is the inset (in grid cells) where the platform places text, and `textColor` the colour that
 * text must use on this frame (contrast-checked by the tests).
 */
export interface NineSlice {
  grid: PixelGrid;
  slice: Insets;
  content: Insets;
  textColor: Hex;
  /** Smallest size, in grid cells, at which the frame still looks right. */
  minWidth: number;
  minHeight: number;
}

export type ButtonState = 'normal' | 'pressed' | 'disabled' | 'focused';
export const BUTTON_STATES: readonly ButtonState[] = ['normal', 'pressed', 'disabled', 'focused'];

export interface FrameOptions {
  theme: UiTheme;
  /** Zone whose accent colours the ornaments (defaults to zone 0). */
  zone?: ZoneId;
}

function gem(_ui: UiPalette, zone: ZoneId): Hex {
  return ZONE_PALETTES[zone].accent;
}

/** Clears the corner cell of an outline to round the frame by one pixel. */
function roundCorners(g: Grid, inset = 0): void {
  const w = g.width - inset;
  const h = g.height - inset;
  for (const [x, y] of [[inset, inset], [w - 1, inset], [inset, h - 1], [w - 1, h - 1]] as const) g.set(x, y, 0);
}

/**
 * HUD plate, 16x16, slice 6: a dark outline, a two-cell bevelled trim band (lit top-left, shaded
 * bottom-right), a dark inner line, the body, and an L-shaped metal bracket with a gem on each
 * corner.
 */
export function plateFrame(opts: FrameOptions): NineSlice {
  const ui = UI_PALETTES[opts.theme];
  const S = 16;
  // 1 outline, 2 trim light, 3 trim, 4 trim shade, 5 body, 6 bracket, 7 bracket light, 8 gem, 9 gem light
  const g = new Grid(S, S, ['#00000000', ui.outline, ui.trimLight, ui.trim, ui.trimShade, ui.plate, ui.ornament, ui.ornamentLight, gem(ui, opts.zone ?? 0), '#fff8e6']);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.min(x, S - 1 - x);
      const dy = Math.min(y, S - 1 - y);
      const e = Math.min(dx, dy);
      // Which edge band the cell sits on: top/left are lit, bottom/right are shaded.
      const lit = (dy === e && y < S / 2) || (dx === e && x < S / 2);
      let idx: number;
      if (e === 0) idx = dx === 0 && dy === 0 ? 0 : 1;
      else if (e === 1) idx = lit ? 2 : 4;
      else if (e === 2) idx = lit ? 3 : 4;
      else if (e === 3) idx = 1;
      else idx = 5;
      // Corner bracket: an L three cells thick reaching five cells along each edge.
      if (dx <= 5 && dy <= 5 && (dx <= 2 || dy <= 2) && e >= 1) idx = (dx === 1 || dy === 1) && lit ? 7 : 6;
      g.set(x, y, idx);
    }
  }
  // Gems: a 2x2 stone in the crook of each bracket, lit on its top-left cell.
  for (const [gx, gy] of [[2, 2], [S - 4, 2], [2, S - 4], [S - 4, S - 4]] as const) {
    g.rect(gx, gy, 2, 2, 8);
    g.set(gx, gy, 9);
  }
  return { grid: g.toPixelGrid(), slice: { left: 6, top: 6, right: 6, bottom: 6 }, content: { left: 5, top: 4, right: 5, bottom: 4 }, textColor: ui.text, minWidth: S, minHeight: S };
}

/** Button in one state. 14x14, slice 5; pressed sinks the content one cell. */
export function buttonFrame(state: ButtonState, opts: FrameOptions): NineSlice {
  const ui = UI_PALETTES[opts.theme];
  // Focused: a 2-cell ring, a 1-cell gap, then the button.
  const ring = state === 'focused' ? 3 : 0;
  const S = 14 + ring * 2;
  // 1 outline, 2 light, 3 body, 4 shade, 5 focus, 6 gem, 7 page gap
  const body = state === 'pressed' ? ui.pressed : state === 'disabled' ? ui.disabled : ui.button;
  const g = new Grid(S, S, ['#00000000', ui.outline, ui.buttonLight, body, ui.buttonShade, ui.focus, gem(ui, opts.zone ?? 0), ui.page]);
  if (ring) {
    g.rect(0, 0, S, S, 5);
    roundCorners(g);
  }
  const o = ring;
  const w = S - ring * 2;
  g.rect(o, o, w, w, 1);
  if (state === 'disabled') {
    g.rect(o + 1, o + 1, w - 2, w - 2, 3);
  } else if (state === 'pressed') {
    // Shade along the top (pushed in), body below.
    g.rect(o + 1, o + 1, w - 2, w - 2, 3);
    g.rect(o + 1, o + 1, w - 2, 2, 4);
  } else {
    // Chunky raised button: light top edge, two rows of shade at the bottom.
    g.rect(o + 1, o + 1, w - 2, w - 2, 3);
    g.rect(o + 1, o + 1, w - 2, 1, 2);
    g.rect(o + 1, o + 1, 1, w - 4, 2);
    g.rect(o + 1, o + w - 3, w - 2, 2, 4);
    // Small gem notch on the top edge's corners.
    g.set(o + 2, o + 2, 6);
    g.set(o + w - 3, o + 2, 6);
  }
  roundCorners(g, o);
  if (ring) {
    // A one-cell gap in the page colour between the ring and the button outline, so the ring
    // only ever touches the page colour (its contrast pair).
    for (let i = 2; i < S - 2; i++) {
      for (const [x, y] of [[i, 2], [i, S - 3], [2, i], [S - 3, i]] as const) {
        if (g.get(x, y) === 5) g.set(x, y, 7);
      }
    }
  }
  const sl = 5 + ring;
  const down = state === 'pressed' ? 1 : 0;
  return {
    grid: g.toPixelGrid(),
    slice: { left: sl, top: sl, right: sl, bottom: sl },
    content: { left: 4 + ring, top: 3 + ring + down, right: 4 + ring, bottom: 4 + ring - down },
    textColor: state === 'disabled' ? ui.disabledText : ui.buttonText,
    minWidth: S,
    minHeight: S,
  };
}

export type BarKind = 'hp' | 'focus';

export interface BarStyle {
  /** Track frame: nine-slice with the empty track inside `content`. */
  frame: NineSlice;
  /** Fill colours; the platform draws the fill as a rect inside `frame.content`. */
  fill: { high: Hex; mid: Hex; low: Hex };
  /** HP thresholds in percent: above `high` uses `fill.high`, above `mid` uses `fill.mid`. */
  thresholds: { high: number; mid: number };
  /** One-cell bright row along the top of the fill. */
  shine: Hex;
  /** Tick marks every `tickEvery` percent, in the outline colour (0 = none). */
  tickEvery: number;
  track: Hex;
}

/** HP or Focus bar: an 8x7 track frame (slice 3) and the fill colours. */
export function barStyle(kind: BarKind, opts: FrameOptions): BarStyle {
  const ui = UI_PALETTES[opts.theme];
  const W = 8;
  const H = 7;
  const g = new Grid(W, H, ['#00000000', ui.outline, ui.track, ui.plateLight]);
  g.rect(0, 0, W, H, 1);
  g.rect(1, 1, W - 2, H - 2, 3);
  g.rect(2, 2, W - 4, H - 4, 2);
  roundCorners(g);
  const frame: NineSlice = {
    grid: g.toPixelGrid(),
    slice: { left: 3, top: 3, right: 3, bottom: 3 },
    content: { left: 2, top: 2, right: 2, bottom: 2 },
    textColor: ui.text,
    minWidth: W,
    minHeight: H,
  };
  const fill = kind === 'hp' ? { high: ui.hpHigh, mid: ui.hpMid, low: ui.hpLow } : { high: ui.focusFill, mid: ui.focusFill, low: ui.focusFill };
  return { frame, fill, thresholds: { high: 50, mid: 25 }, shine: ui.fillShine, tickEvery: kind === 'hp' ? 25 : 0, track: ui.track };
}

/** Fill colour of a bar for a value in percent (0-100). */
export function barFill(style: BarStyle, percent: number): Hex {
  if (percent > style.thresholds.high) return style.fill.high;
  if (percent > style.thresholds.mid) return style.fill.mid;
  return style.fill.low;
}

/** A pair of colours that carries text or a focus/meter cue, with the ratio it must reach. */
export interface ContrastPair {
  name: string;
  fg: Hex;
  bg: Hex;
  min: number;
}

/**
 * Every colour pair of the frames that carries meaning: text on plates and buttons (4.5:1),
 * the focus ring against the page and the plate, and bar fills against their track (3:1).
 */
export function uiContrastPairs(theme: UiTheme): ContrastPair[] {
  const ui = UI_PALETTES[theme];
  return [
    { name: 'text on plate', fg: ui.text, bg: ui.plate, min: 4.5 },
    { name: 'muted text on plate', fg: ui.textMuted, bg: ui.plate, min: 4.5 },
    { name: 'text on page', fg: ui.text, bg: ui.page, min: 4.5 },
    { name: 'button text', fg: ui.buttonText, bg: ui.button, min: 4.5 },
    { name: 'button text pressed', fg: ui.buttonText, bg: ui.pressed, min: 4.5 },
    { name: 'disabled button text', fg: ui.disabledText, bg: ui.disabled, min: 4.5 },
    { name: 'focus ring on page', fg: ui.focus, bg: ui.page, min: 3 },
    { name: 'focus ring on plate', fg: ui.focus, bg: ui.plate, min: 3 },
    { name: 'hp high on track', fg: ui.hpHigh, bg: ui.track, min: 3 },
    { name: 'hp mid on track', fg: ui.hpMid, bg: ui.track, min: 3 },
    { name: 'hp low on track', fg: ui.hpLow, bg: ui.track, min: 3 },
    { name: 'focus fill on track', fg: ui.focusFill, bg: ui.track, min: 3 },
  ];
}
