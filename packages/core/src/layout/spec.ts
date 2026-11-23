// The console layout contract: pure functions of the window (size in dp or CSS px, plus the text
// scale) that say which size classes apply, whether the console (no-scroll) layout fits, and how
// the content box is split into regions. Web and mobile both consume this module, so it must stay
// platform-neutral (no DOM or React Native imports).

export type WidthClass = 'compact' | 'medium' | 'expanded';
export type HeightClass = 'compact' | 'medium' | 'expanded';
export type Orientation = 'landscape' | 'portrait';
export type LayoutMode = 'console' | 'fallback';
export type ScreenId = 'title' | 'map' | 'battle' | 'event' | 'end';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The rects tile `content` exactly, with no overlap. `info` is null in landscape. */
export interface RegionPlan {
  content: Rect;
  hud: Rect;
  primary: Rect;
  actions: Rect;
  info: Rect | null;
}

export interface WindowInfo {
  width: number;
  height: number;
  /** Effective text scale (see effectiveTextScale); 1 = default. */
  textScale: number;
}

export interface LayoutSpec {
  orientation: Orientation;
  width: WidthClass;
  height: HeightClass;
  mode: LayoutMode;
  regions: RegionPlan;
}

export const WIDTH_MEDIUM = 600;
export const WIDTH_EXPANDED = 840;
export const HEIGHT_MEDIUM = 480;
export const HEIGHT_EXPANDED = 900;
export const CONTENT_MAX_LANDSCAPE = 1200;
export const CONTENT_MAX_PORTRAIT = 720;
/** Above this text scale the console layout gives way to the scrolling fallback. */
export const TEXT_SCALE_MAX = 2;
/** Below this window height (dp) the console layout never applies. */
export const MIN_HEIGHT_PX = 320;
/**
 * Minimum "text-sized" height (height / textScale) each screen needs to fit without scrolling, per
 * orientation: a portrait window stacks the primary area over the rail, so it needs far more height
 * (a map: 468 px at 360 wide, 272 px in landscape). Measured on the web screens in Task 6 as the
 * maximum of minimum-fitting-height / text scale over 1.0, 1.3 and 1.5 (landscape 640 and 914 wide,
 * portrait 360 and 320 wide), rounded up to 5. A phone at 200% text therefore falls back by design
 * (spec 7.5): a 640 px portrait window is 320 text-sized px, under the portrait budgets of the
 * title, map, battle and event.
 *
 * The title and event portrait budgets (460), the title landscape budget (245) and the end portrait
 * budget (330) were raised after the mobile fit proofs (apps/mobile/__tests__/screens/runMetrics.test.ts,
 * run over every console row of the contract up to 200% text) showed the Android screens overflow
 * their regions at 360x640 @150%, 411x914 @200%, 600x800 @200% (title, event), 640x360 @150% (title)
 * and 360x640 @200% (end): those rows fall back instead (spec section 12).
 */
export interface ScreenBudget {
  landscape: number;
  portrait: number;
}
export const MIN_BUDGET: Record<ScreenId, ScreenBudget> = {
  title: { landscape: 245, portrait: 460 },
  map: { landscape: 275, portrait: 470 },
  battle: { landscape: 270, portrait: 480 },
  event: { landscape: 250, portrait: 460 },
  end: { landscape: 210, portrait: 330 },
};

// Band heights (px at text scale 1). The HUD was measured on the web shell: 52 px, which is the
// 44 px touch targets plus half a rem of padding. Only the part above HUD_FIXED grows with the text
// scale, because the targets do not (spec 7.1). The info band is two lines of text and does grow.
export const HUD_FIXED = 44;
export const HUD_LINE = 52;
export const INFO_LINE = 18;
const PRIMARY_PORTRAIT_SHARE = 0.41;
const ACTIONS_SHARE = 0.32;
const ACTIONS_MIN = 200;
const ACTIONS_MAX = 360;

/** System font scale times the app's own text scale, capped at TEXT_SCALE_MAX. */
export function effectiveTextScale(system: number, app: number): number {
  return Math.min(TEXT_SCALE_MAX, system * app);
}

export function widthClass(width: number): WidthClass {
  return width < WIDTH_MEDIUM ? 'compact' : width < WIDTH_EXPANDED ? 'medium' : 'expanded';
}

export function heightClass(height: number): HeightClass {
  return height < HEIGHT_MEDIUM ? 'compact' : height < HEIGHT_EXPANDED ? 'medium' : 'expanded';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function planRegions(info: WindowInfo, landscape: boolean): RegionPlan {
  const { width, height } = info;
  const scale = Math.max(1, info.textScale);
  const cw = Math.min(width, landscape ? CONTENT_MAX_LANDSCAPE : CONTENT_MAX_PORTRAIT);
  const content: Rect = { x: Math.floor((width - cw) / 2), y: 0, width: cw, height };
  const hudH = Math.min(Math.round(HUD_FIXED + (HUD_LINE - HUD_FIXED) * scale), Math.floor(height / 3));
  const hud: Rect = { x: content.x, y: 0, width: cw, height: hudH };

  if (landscape) {
    const actionsW = Math.min(cw, Math.round(clamp(ACTIONS_SHARE * cw, ACTIONS_MIN, ACTIONS_MAX)));
    const bodyH = height - hudH;
    return {
      content,
      hud,
      primary: { x: content.x, y: hudH, width: cw - actionsW, height: bodyH },
      actions: { x: content.x + cw - actionsW, y: hudH, width: actionsW, height: bodyH },
      info: null,
    };
  }

  const primaryH = Math.min(Math.round(PRIMARY_PORTRAIT_SHARE * height), height - hudH);
  const infoH = Math.min(Math.round(2 * INFO_LINE * scale), height - hudH - primaryH);
  const actionsY = hudH + primaryH + infoH;
  return {
    content,
    hud,
    primary: { x: content.x, y: hudH, width: cw, height: primaryH },
    info: { x: content.x, y: hudH + primaryH, width: cw, height: infoH },
    actions: { x: content.x, y: actionsY, width: cw, height: height - actionsY },
  };
}

/** Non-finite or negative sizes become 0; fractions are floored so rect edges are integers. */
function sanitizeSize(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function layoutSpec(raw: WindowInfo, screen: ScreenId): LayoutSpec {
  const info: WindowInfo = {
    width: sanitizeSize(raw.width),
    height: sanitizeSize(raw.height),
    textScale: Number.isFinite(raw.textScale) && raw.textScale > 0 ? raw.textScale : 1,
  };
  const landscape = info.width > info.height;
  const fits =
    info.height >= MIN_HEIGHT_PX &&
    info.textScale <= TEXT_SCALE_MAX &&
    info.height / info.textScale >= MIN_BUDGET[screen][landscape ? 'landscape' : 'portrait'];
  return {
    orientation: landscape ? 'landscape' : 'portrait',
    width: widthClass(info.width),
    height: heightClass(info.height),
    mode: fits ? 'console' : 'fallback',
    regions: planRegions(info, landscape),
  };
}
