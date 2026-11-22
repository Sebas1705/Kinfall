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
/** Minimum "text-sized" height (height / textScale) each screen needs to fit without scrolling. */
export const MIN_BUDGET: Record<ScreenId, number> = {
  title: 270,
  map: 270,
  battle: 270,
  event: 270,
  end: 270,
};

const HUD_LINE = 28;
const INFO_LINE = 18;
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
  const hudH = Math.min(Math.round(HUD_LINE * scale), Math.floor(height / 3));
  const hud: Rect = { x: content.x, y: 0, width: cw, height: hudH };

  if (landscape) {
    const actionsW = Math.round(clamp(ACTIONS_SHARE * cw, ACTIONS_MIN, ACTIONS_MAX));
    const bodyH = height - hudH;
    return {
      content,
      hud,
      primary: { x: content.x, y: hudH, width: cw - actionsW, height: bodyH },
      actions: { x: content.x + cw - actionsW, y: hudH, width: actionsW, height: bodyH },
      info: null,
    };
  }

  const primaryH = Math.round(PRIMARY_PORTRAIT_SHARE * height);
  const infoH = Math.round(2 * INFO_LINE * scale);
  const actionsY = hudH + primaryH + infoH;
  return {
    content,
    hud,
    primary: { x: content.x, y: hudH, width: cw, height: primaryH },
    info: { x: content.x, y: hudH + primaryH, width: cw, height: infoH },
    actions: { x: content.x, y: actionsY, width: cw, height: height - actionsY },
  };
}

export function layoutSpec(info: WindowInfo, screen: ScreenId): LayoutSpec {
  const landscape = info.width > info.height;
  const fits =
    info.height >= MIN_HEIGHT_PX &&
    info.textScale <= TEXT_SCALE_MAX &&
    info.height / Math.max(info.textScale, Number.EPSILON) >= MIN_BUDGET[screen];
  return {
    orientation: landscape ? 'landscape' : 'portrait',
    width: widthClass(info.width),
    height: heightClass(info.height),
    mode: fits ? 'console' : 'fallback',
    regions: planRegions(info, landscape),
  };
}
