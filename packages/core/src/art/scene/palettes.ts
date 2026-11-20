// The "dusk-lit pixel fantasy" palettes: one limited dusk palette per zone (sky, silhouettes,
// floor, light source, ambient life), effect colours per element, and the two UI frame palettes
// (dusk = dark, parchment = light). Every value lives here once; generators only index into it.
import type { ElementId } from '../../content/schema';
import type { Hex } from './color';

/** Zone index as used by the run (0 Ashen Marsh, 1 Thornwood Hollow, 2 Veil Reach). */
export type ZoneId = 0 | 1 | 2;
export const ZONE_IDS: readonly ZoneId[] = [0, 1, 2];

export interface ZonePalette {
  zone: ZoneId;
  /** Stable slug for logs and tests (the visible zone name is a translated string, `zone.N`). */
  slug: 'ashen-marsh' | 'thornwood-hollow' | 'veil-reach';
  /** Sky bands from the top of the scene down to the horizon (6 colours). */
  sky: Hex[];
  /** The scene's light: a low sun or a moon, which side it sits on, and its colours. */
  light: { kind: 'sun' | 'moon'; side: -1 | 1; core: Hex; shade: Hex; glow: Hex[] };
  /** Thin clouds: body and the edge lit by the light. */
  cloud: [Hex, Hex];
  /** Star colours (empty: no stars). */
  stars: Hex[];
  /** Far silhouettes (haze-close to the horizon colour): fill, rim. */
  far: [Hex, Hex];
  /** Middle silhouettes: fill, rim light, warm detail (glowing windows, lanterns, runes). */
  mid: [Hex, Hex, Hex];
  /** Floor: base, dark, light, liquid, liquid highlight, accent speck. */
  floor: [Hex, Hex, Hex, Hex, Hex, Hex];
  /** Foreground fringe (drawn over the creatures): fill, rim. */
  near: [Hex, Hex];
  /** Ground platform under a creature: top, top light, side, side dark, tuft. */
  platform: [Hex, Hex, Hex, Hex, Hex];
  /** Soft creature shadow (with alpha). */
  shadow: Hex;
  /** Warm accent of the zone (ember glow, firefly gold, veil rose): ornaments and highlights. */
  accent: Hex;
  /** Ambient particle colours. */
  ambient: Hex[];
}

export const ZONE_PALETTES: Record<ZoneId, ZonePalette> = {
  0: {
    zone: 0,
    slug: 'ashen-marsh',
    sky: ['#1e1430', '#2f183c', '#4c2045', '#7a2d47', '#b24a43', '#e07a48'],
    light: { kind: 'sun', side: -1, core: '#ffe2a0', shade: '#ffb35c', glow: ['#f59a5266', '#f2804a33'] },
    cloud: ['#5c2444', '#d9704a'],
    stars: ['#e8c9d9'],
    far: ['#6a2a46', '#a8463f'],
    mid: ['#33172f', '#c8583a', '#ffb347'],
    floor: ['#331a30', '#1f0f20', '#52263a', '#8a3448', '#f09a58', '#6e3442'],
    near: ['#120914', '#4c2045'],
    platform: ['#4a2a3a', '#7a4a4c', '#2c1626', '#1b0d1c', '#9a5a48'],
    shadow: '#0c050c99',
    accent: '#ff9d4a',
    ambient: ['#ffb347', '#ff7a3a', '#ffe2a0', '#9a8296'],
  },
  1: {
    zone: 1,
    slug: 'thornwood-hollow',
    sky: ['#0a1222', '#101e34', '#172e44', '#21434f', '#2f5c5c', '#4c7f6c'],
    light: { kind: 'moon', side: 1, core: '#f4f1da', shade: '#c9d6b8', glow: ['#a8d2b444', '#7fb09a22'] },
    cloud: ['#1d3a48', '#7fae9a'],
    stars: ['#dfeee0', '#b8d8c8'],
    far: ['#244a50', '#5f907e'],
    mid: ['#11252a', '#78ad92', '#ffd36b'],
    floor: ['#15302a', '#0c1d1a', '#244436', '#2c5248', '#9fd0b0', '#c7e06a'],
    near: ['#07120e', '#22402f'],
    platform: ['#2c4a34', '#4f7a48', '#1a2e24', '#0c1d1a', '#8fbf5a'],
    shadow: '#030a0899',
    accent: '#ffd36b',
    ambient: ['#ffe27a', '#fff6c2', '#a8d86a', '#7fae4a'],
  },
  2: {
    zone: 2,
    slug: 'veil-reach',
    sky: ['#0c0a20', '#18143a', '#271f52', '#3f2f69', '#66457e', '#9c6c94'],
    light: { kind: 'moon', side: 1, core: '#fff2f6', shade: '#e6c6dc', glow: ['#d7a8d055', '#b07ab028'] },
    cloud: ['#2d2459', '#c49ad0'],
    stars: ['#fff2f6', '#c9b3e6'],
    far: ['#3a2d60', '#8c6cae'],
    mid: ['#1a1434', '#c49ad0', '#ff9fd0'],
    floor: ['#221b3c', '#130e25', '#352c5c', '#4a3d7e', '#e8c8f0', '#7a6aa8'],
    near: ['#0a0718', '#33295a'],
    platform: ['#3c3264', '#6a5a94', '#241d40', '#130e25', '#a08ac8'],
    shadow: '#05031099',
    accent: '#ff9fd0',
    ambient: ['#c9b3e6', '#fff2f6', '#e48fb6', '#8a7ad6'],
  },
};

/** Effect colours per element: core (brightest), main, deep, and a pale spark. */
export interface ElementFxPalette {
  core: Hex;
  main: Hex;
  deep: Hex;
  spark: Hex;
}

export const ELEMENT_FX: Record<ElementId, ElementFxPalette> = {
  ember: { core: '#fff1c4', main: '#ff9d3a', deep: '#c8402a', spark: '#ffd36b' },
  thorn: { core: '#eaffb0', main: '#8fcf4a', deep: '#3f7a2c', spark: '#d6f07a' },
  tide: { core: '#effbff', main: '#6cc4f2', deep: '#2a6ab8', spark: '#b8ecff' },
  gale: { core: '#ffffff', main: '#c8bff6', deep: '#7a6ad0', spark: '#eeeaff' },
  umbra: { core: '#ffd6ec', main: '#b05a96', deep: '#4a1a46', spark: '#e48fb6' },
};

/** Colours for effects that are not tied to an element (impacts, heals, souls, flourishes). */
export const NEUTRAL_FX = {
  impact: '#fff6dc',
  impactWarm: '#ffd36b',
  dull: '#9a94a8',
  dullDark: '#5a546a',
  heal: '#8ff0a0',
  healCore: '#eaffd8',
  soul: '#a8e6ff',
  soulCore: '#f2fcff',
  gold: '#ffd36b',
  ash: '#6a6070',
  dim: '#0a0814',
} as const;

export type UiTheme = 'dusk' | 'parchment';

/** Pixel frame palette for HUD plates, buttons and bars. */
export interface UiPalette {
  theme: UiTheme;
  /** Page background the frames are tested against. */
  page: Hex;
  /** Outer dark line of every frame. */
  outline: Hex;
  /** Plate body and its bevel. */
  plate: Hex;
  plateLight: Hex;
  plateShade: Hex;
  /** Bevelled trim band around plates. */
  trim: Hex;
  trimLight: Hex;
  trimShade: Hex;
  /** Metal corner brackets (the gems in them use the zone accent). */
  ornament: Hex;
  ornamentLight: Hex;
  text: Hex;
  textMuted: Hex;
  button: Hex;
  buttonLight: Hex;
  buttonShade: Hex;
  buttonText: Hex;
  pressed: Hex;
  disabled: Hex;
  disabledText: Hex;
  /** Focus ring: must reach 3:1 against the page and the plate. */
  focus: Hex;
  track: Hex;
  hpHigh: Hex;
  hpMid: Hex;
  hpLow: Hex;
  focusFill: Hex;
  /** Bright top row of a bar fill. */
  fillShine: Hex;
}

export const UI_PALETTES: Record<UiTheme, UiPalette> = {
  dusk: {
    theme: 'dusk',
    page: '#0e0c16',
    outline: '#06050a',
    plate: '#1d1829',
    plateLight: '#3b3152',
    plateShade: '#120f1b',
    trim: '#463a5e',
    trimLight: '#6e5d92',
    trimShade: '#261f36',
    ornament: '#a9844a',
    ornamentLight: '#e8c27a',
    text: '#f6eedf',
    textMuted: '#cbc1d8',
    button: '#2f2643',
    buttonLight: '#6b5a96',
    buttonShade: '#120e1c',
    buttonText: '#f6eedf',
    pressed: '#221b32',
    disabled: '#1f1a2a',
    disabledText: '#a39bb2',
    focus: '#ffd36b',
    track: '#0a0810',
    hpHigh: '#5fc25a',
    hpMid: '#e8b23a',
    hpLow: '#ef6a4f',
    focusFill: '#6a9cf2',
    fillShine: '#ffffff66',
  },
  parchment: {
    theme: 'parchment',
    page: '#f3ead6',
    outline: '#2a1c18',
    plate: '#efe2c4',
    plateLight: '#fff8e6',
    plateShade: '#c9b28a',
    trim: '#b08a56',
    trimLight: '#dcbc86',
    trimShade: '#7a5a34',
    ornament: '#5a3a22',
    ornamentLight: '#8a6040',
    text: '#2a1c18',
    textMuted: '#5a463c',
    button: '#e2cfa6',
    buttonLight: '#fbf0d6',
    buttonShade: '#b39868',
    buttonText: '#2a1c18',
    pressed: '#d2bc8e',
    disabled: '#e6dcc6',
    disabledText: '#6a5a4e',
    focus: '#7a2e10',
    track: '#3a2a24',
    hpHigh: '#3f9a3a',
    hpMid: '#c88a14',
    hpLow: '#e0553a',
    focusFill: '#4a8af0',
    fillShine: '#ffffff80',
  },
};
