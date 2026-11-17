// Window size classes and the layout decisions built on them, as pure functions of the window
// (width and height in dp, plus the system font scale). One place decides when a screen gets two
// panes or the compact battle, so screens never scatter their own breakpoints.
import { useWindowDimensions } from 'react-native';

/** Width classes at 600 and 840 dp (Material window size classes). */
export type WidthClass = 'compact' | 'medium' | 'expanded';
/** Height classes at 480 and 900 dp. */
export type HeightClass = 'compact' | 'medium' | 'expanded';

export const WIDTH_MEDIUM = 600;
export const WIDTH_EXPANDED = 840;
export const HEIGHT_MEDIUM = 480;
export const HEIGHT_EXPANDED = 900;

/** Content width cap of a single-column screen (dp). */
export const SINGLE_MAX_WIDTH = 720;
/** Content width cap of a two-pane screen (dp). */
export const TWO_PANE_MAX_WIDTH = 1200;
/**
 * Below this many "text-sized" dp of window height (height divided by the font scale), the
 * battle's creatures and choices no longer fit one screen, so the battle switches to its compact
 * layout with the choices pinned at the bottom.
 */
export const BATTLE_TEXT_HEIGHT = 600;

export function widthClass(width: number): WidthClass {
  return width < WIDTH_MEDIUM ? 'compact' : width < WIDTH_EXPANDED ? 'medium' : 'expanded';
}

export function heightClass(height: number): HeightClass {
  return height < HEIGHT_MEDIUM ? 'compact' : height < HEIGHT_EXPANDED ? 'medium' : 'expanded';
}

export interface WindowInfo {
  width: number;
  height: number;
  /** System font scale (1 = default). */
  fontScale: number;
}

export interface Layout {
  width: WidthClass;
  height: HeightClass;
  /**
   * Two columns side by side: expanded width (tablets, unfolded foldables), or a medium width in
   * landscape (phones on their side), where one tall column would leave most of the screen empty.
   */
  twoPane: boolean;
  /** The battle pins its choices at the bottom and draws smaller creatures (one column only). */
  compactBattle: boolean;
  /** Cap of the content width (dp); content is centred inside the window. */
  maxContentWidth: number;
}

export function layoutFor({ width, height, fontScale }: WindowInfo): Layout {
  const w = widthClass(width);
  const twoPane = w === 'expanded' || (w === 'medium' && width > height);
  const compactBattle = !twoPane && height / Math.max(1, fontScale) < BATTLE_TEXT_HEIGHT;
  return {
    width: w,
    height: heightClass(height),
    twoPane,
    compactBattle,
    maxContentWidth: twoPane ? TWO_PANE_MAX_WIDTH : SINGLE_MAX_WIDTH,
  };
}

/** The layout of the current window; re-renders on rotation, resize and font scale changes. */
export function useLayout(): Layout {
  const { width, height, fontScale } = useWindowDimensions();
  return layoutFor({ width, height, fontScale });
}
