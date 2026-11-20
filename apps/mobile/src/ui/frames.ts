// The pixel HUD frames of the scene art (plates, buttons in four states, bar tracks) for the
// current theme and zone, generated once per combination, plus the size of one frame cell in dp.
// Light mode uses the parchment frames, dark mode the dusk ones (the battle scene itself keeps its
// zone palette in both).
import {
  barStyle,
  buttonFrame,
  plateFrame,
  zoneIdOf,
  type BarStyle,
  type ButtonState,
  type NineSlice,
  type UiTheme,
  type ZoneId,
} from '@kinfall/core/art/scene';
import { createContext, useContext } from 'react';
import { PixelRatio, useColorScheme } from 'react-native';

/** Target size of one frame cell in dp (rounded to whole device pixels). */
export const FRAME_CELL_DP = 2;

/** Whole device pixels per frame cell, and that size in dp. */
export function frameCell(ratio = PixelRatio.get()): { px: number; dp: number } {
  const px = Math.max(1, Math.round(FRAME_CELL_DP * ratio));
  return { px, dp: px / ratio };
}

const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  let v = cache.get(key) as T | undefined;
  if (v === undefined) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

export function plateOf(theme: UiTheme, zone: ZoneId): NineSlice {
  return once(`plate|${theme}|${zone}`, () => plateFrame({ theme, zone }));
}

export function buttonOf(state: ButtonState, theme: UiTheme, zone: ZoneId): NineSlice {
  return once(`button|${state}|${theme}|${zone}`, () => buttonFrame(state, { theme, zone }));
}

export function barOf(kind: 'hp' | 'focus', theme: UiTheme, zone: ZoneId): BarStyle {
  return once(`bar|${kind}|${theme}|${zone}`, () => barStyle(kind, { theme, zone }));
}

/** The zone whose accent colours the frame gems (the run's zone; zone 0 outside a run). */
export const ArtZoneContext = createContext<ZoneId>(0);

/** Frame theme and zone of the current screen. */
export function useFrameStyle(): { theme: UiTheme; zone: ZoneId } {
  const scheme = useColorScheme();
  const zone = useContext(ArtZoneContext);
  return { theme: scheme === 'dark' ? 'dusk' : 'parchment', zone };
}

/** The art zone of a run's zone index. */
export function artZone(zoneIndex: number): ZoneId {
  return zoneIdOf(zoneIndex);
}
