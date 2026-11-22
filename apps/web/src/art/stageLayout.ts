// Pure layout helpers for the scene art (no DOM): which zone and seed a battle is drawn with, and
// the whole-number scale and horizontal framing of the 256x144 scene in a given width.
import { SCENE_HEIGHT, SCENE_WIDTH } from '@kinfall/core/art/scene/backdrop';

export interface SceneKey {
  zone: number;
  seed: string;
}

/**
 * Run battles are seeded `${runSeed}:z<zone>-l<layer>-c<col>` (sim/run/encounters.ts), so a run's
 * battles share its backdrop. Any other seed (the demo battle page) gets a zone from its text.
 */
export function sceneKeyOf(battleSeed: string): SceneKey {
  const m = /^(.*):z(\d+)-l\d+-c\d+$/.exec(battleSeed);
  if (m) return { zone: Number(m[2]), seed: m[1]! };
  let h = 0;
  for (let i = 0; i < battleSeed.length; i++) h = (h * 31 + battleSeed.charCodeAt(i)) >>> 0;
  return { zone: h % 3, seed: battleSeed };
}

/**
 * Scene pixels that must stay visible: both creatures (x 46..212 at the stage anchors), centred on
 * STAGE_CENTRE_X; the platforms' outer rims may be cropped on narrow phones.
 */
export const MIN_VISIBLE_WIDTH = 164;
export const STAGE_CENTRE_X = 129;

export interface StageFrame {
  /** Whole-number device pixels per scene pixel. */
  scale: number;
  /** Visible scene width (may be wider than the scene: tiled layers extend sideways). */
  viewWidth: number;
  /** Scene x drawn at the left edge of the view (negative when the view is wider). */
  originX: number;
  /** Visible scene height and the scene y at the top edge (the sky may be cropped). */
  viewHeight: number;
  originY: number;
}

/**
 * Picks the largest whole-number scale at which the scene's important middle still fits `width`
 * device pixels, preferring to show all 256 columns once the width allows it. `cropTop` trims sky
 * rows (scene px) when the caller wants a lower banner. `maxScale` caps the scale (still a whole
 * number, never below 1) when the region the scene lives in is short: the console battle derives
 * it from the stage rect so the picture never outgrows its region.
 */
export function stageFrame(
  width: number,
  cropTop = 0,
  rows = SCENE_HEIGHT - cropTop,
  maxScale = Number.POSITIVE_INFINITY,
): StageFrame {
  const w = Math.max(1, Math.floor(width));
  const full = Math.floor(w / SCENE_WIDTH);
  const wanted = Math.max(1, full >= 2 ? full : Math.floor(w / MIN_VISIBLE_WIDTH));
  const scale = Math.max(1, Math.min(wanted, Math.floor(maxScale)));
  const viewWidth = Math.ceil(w / scale);
  // Views narrower than the scene centre on the creatures; wider ones on the scene.
  const centre = viewWidth < SCENE_WIDTH ? STAGE_CENTRE_X : SCENE_WIDTH / 2;
  const originX = Math.floor(centre - viewWidth / 2);
  const originY = Math.max(0, Math.min(SCENE_HEIGHT - 1, Math.floor(cropTop)));
  const viewHeight = Math.max(1, Math.min(SCENE_HEIGHT - originY, Math.floor(rows)));
  return { scale, viewWidth, originX, viewHeight, originY };
}

/** Idle camera sway in scene px (+-6 over about 19 s); 0 with reduced motion. */
export function cameraSway(tMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return Math.round(Math.sin((tMs / 19_000) * Math.PI * 2) * 6);
}
