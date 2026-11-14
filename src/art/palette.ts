import type { ElementId } from '../content/schema';

/** A small indexed-colour image. Palette index 0 is always transparent. */
export interface PixelGrid {
  width: number;
  height: number;
  pixels: Uint8Array;
  palette: string[];
}

/** Palette slots shared by every element palette. */
export const TRANSPARENT = 0;
export const OUTLINE = 1;
export const BODY = 2;
export const PATTERN = 3;
export const EYE_WHITE = 4;
export const PUPIL = 5;

/**
 * Body colours sit in a mid-tone band so they keep at least 3:1 contrast on both the
 * dark (#0e0e13) and light (#f6f6fa) UI backgrounds; the tests check this.
 */
const PALETTES: Record<ElementId, string[]> = {
  ember: ['#00000000', '#5a1f10', '#d9603b', '#f2b35a', '#fff4e6', '#1a0d08'],
  thorn: ['#00000000', '#1d4318', '#4f9a3c', '#c7e06a', '#f4fbe6', '#0f1f0c'],
  tide: ['#00000000', '#12316b', '#3b82d9', '#9fd8f5', '#eefaff', '#0a1630'],
  gale: ['#00000000', '#35296f', '#8a7ad6', '#e2dcff', '#fbf9ff', '#17123a'],
  umbra: ['#00000000', '#3a1230', '#a0527a', '#e48fb6', '#fff0f7', '#1c0817'],
};

/** Original colour palette of an element: transparent, outline, body, pattern, eye white, pupil. */
export function elementPalette(element: ElementId): string[] {
  return [...PALETTES[element]];
}
