// Pure layout helpers for the scene art (no React Native): which zone and seed a battle is drawn
// with, and the whole-number scale and framing of the 256x144 scene in a box of device pixels.
// Mirrors apps/web/src/art/stageLayout.ts, with a height cap for phones and landscape windows.
import { SCENE_HEIGHT, SCENE_WIDTH } from '@kinfall/core/art/scene';

export interface SceneKey {
  zone: number;
  seed: string;
}

/**
 * Run battles are seeded `${runSeed}:z<zone>-l<layer>-c<col>` (sim/run/encounters.ts), so a run's
 * battles share its backdrop. Any other seed gets a zone from its text.
 */
export function sceneKeyOf(battleSeed: string): SceneKey {
  const m = /^(.*):z(\d+)-l\d+-c\d+$/.exec(battleSeed);
  if (m) return { zone: Number(m[2]), seed: m[1]! };
  let h = 0;
  for (let i = 0; i < battleSeed.length; i++) h = (h * 31 + battleSeed.charCodeAt(i)) >>> 0;
  return { zone: h % 3, seed: battleSeed };
}

/** Scene columns that must stay visible: both creatures (x 46..212), centred on STAGE_CENTRE_X. */
export const MIN_VISIBLE_WIDTH = 164;
export const STAGE_CENTRE_X = 129;
/** Sky rows cropped when the creatures fill the width (phones), so the stage is not mostly sky. */
export const PHONE_CROP_TOP = 26;
/** From this many device px per scene px the whole scene is shown instead of the creatures' crop. */
export const FULL_SCENE_MIN_SCALE = 4;

export interface StageFrame {
  /** Whole device pixels per scene pixel. */
  scale: number;
  /** Visible scene width (wider than the scene when tiled layers extend sideways). */
  viewWidth: number;
  /** Scene x at the left edge (negative when the view is wider than the scene). */
  originX: number;
  /** Visible scene rows and the scene y at the top edge. */
  viewHeight: number;
  originY: number;
  /** Size of the drawn stage in device px (the width is the box width). */
  widthPx: number;
  heightPx: number;
}

/**
 * Picks the largest whole-number scale for a box `widthPx` wide and at most `maxHeightPx` tall:
 * - narrow boxes (phones) show the creatures' middle (x 46..212) as large as possible and crop the
 *   top sky rows;
 * - boxes wide enough for the whole scene at `FULL_SCENE_MIN_SCALE` or more show all 256 columns
 *   and every row;
 * - the height cap wins over both (landscape phones, the compact battle), and the view then grows
 *   sideways (tiled layers cover it).
 */
export interface FrameOptions {
  /** Sky rows to crop in the creatures' crop (default PHONE_CROP_TOP). */
  cropTop?: number;
  /** Banner mode: always every column, rows `cropTop` .. `cropTop + rows`. */
  banner?: { cropTop: number; rows: number };
}

export function stageFrame(widthPx: number, maxHeightPx: number, opts: FrameOptions = {}): StageFrame {
  const w = Math.max(1, Math.floor(widthPx));
  const full = Math.floor(w / SCENE_WIDTH);
  if (opts.banner) {
    const originY = Math.max(0, Math.min(SCENE_HEIGHT - 1, Math.floor(opts.banner.cropTop)));
    const rows = Math.max(1, Math.min(SCENE_HEIGHT - originY, Math.floor(opts.banner.rows)));
    const scale = Math.max(1, Math.min(Math.max(1, full), Math.floor(Math.max(1, maxHeightPx) / rows)));
    const viewWidth = Math.ceil(w / scale);
    return { scale, viewWidth, originX: Math.floor(SCENE_WIDTH / 2 - viewWidth / 2), viewHeight: rows, originY, widthPx: w, heightPx: rows * scale };
  }
  const wholeScene = full >= FULL_SCENE_MIN_SCALE;
  const originY = wholeScene ? 0 : Math.max(0, Math.min(SCENE_HEIGHT - 1, Math.floor(opts.cropTop ?? PHONE_CROP_TOP)));
  const rows = SCENE_HEIGHT - originY;
  const byWidth = wholeScene ? full : Math.floor(w / MIN_VISIBLE_WIDTH);
  const byHeight = Math.floor(Math.max(1, maxHeightPx) / rows);
  const scale = Math.max(1, Math.min(byWidth, byHeight));
  const viewWidth = Math.ceil(w / scale);
  const centre = viewWidth < SCENE_WIDTH ? STAGE_CENTRE_X : SCENE_WIDTH / 2;
  const originX = Math.floor(centre - viewWidth / 2);
  return { scale, viewWidth, originX, viewHeight: rows, originY, widthPx: w, heightPx: rows * scale };
}

/** Idle camera sway in scene px (+-6 over about 19 s); 0 with reduced motion. */
export function cameraSway(tMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return Math.round(Math.sin((tMs / 19_000) * Math.PI * 2) * 6);
}

/** Horizontal shift of a backdrop layer in whole scene px for a camera offset and a drift clock. */
export function layerShift(parallax: number, driftPxPerSec: number, camX: number, tMs: number): number {
  return Math.round(-camX * parallax - (driftPxPerSec * tMs) / 1000);
}

/** Scene x positions where copies of a tiled layer start so that they cover [fromX, toX). */
export function tileStarts(layerX: number, shift: number, tileWidth: number, fromX: number, toX: number): number[] {
  const w = tileWidth;
  let x = fromX + ((((layerX + shift - fromX) % w) + w) % w);
  if (x > fromX) x -= w;
  const out: number[] = [];
  for (; x < toX; x += w) out.push(x);
  return out;
}
