import { useColorScheme } from 'react-native';

/** Key colours, mirrored from the web tokens in apps/web/src/styles.css (:root and dark media query). */
export interface Theme {
  bg: string;
  /** Cards and panels. */
  surface: string;
  /** Secondary buttons, bars' tracks. */
  surface2: string;
  text: string;
  muted: string;
  /** Panel and card outlines (decorative: panels are also told apart by their surface). */
  border: string;
  /** Outline of an enabled control that has no fill (secondary buttons, inputs, radio cards): >= 3:1 on every surface. */
  outline: string;
  /** Primary buttons and the selected starter. */
  accent: string;
  accentText: string;
  /** Pressed/selected outline (the web focus ring colour). */
  focus: string;
  /** Destructive confirmations and warnings (the web --lose). */
  danger: string;
  /** HP bar fill. */
  good: string;
  disabledText: string;
  /** Body of the pixel plates (UI_PALETTES plate). */
  plate: string;
  /** Body of the raised pixel buttons (UI_PALETTES button). */
  button: string;
}

// The page palette follows the scene art's UI palettes (parchment light, dusk dark; see
// packages/core/src/art/scene/palettes.ts), like the web tokens in apps/web/src/styles.css.
export const LIGHT: Theme = {
  bg: '#f3ead6',
  surface: '#fbf4e4',
  surface2: '#e9dfc8',
  text: '#2a1c18',
  muted: '#5a463c',
  border: '#9c7a4c',
  outline: '#7a5a34',
  accent: '#7a2e10',
  accentText: '#fff8e6',
  focus: '#7a2e10',
  danger: '#8c2016',
  good: '#2b6a25',
  disabledText: '#6a5a4e',
  plate: '#efe2c4',
  button: '#e2cfa6',
};

export const DARK: Theme = {
  bg: '#0e0c16',
  surface: '#1d1829',
  surface2: '#262036',
  text: '#f6eedf',
  muted: '#cbc1d8',
  border: '#6e5d92',
  outline: '#8f7fb6',
  accent: '#ffb35c',
  accentText: '#1d1829',
  focus: '#ffd36b',
  danger: '#ff8f84',
  good: '#86d67e',
  disabledText: '#a39bb2',
  plate: '#1d1829',
  button: '#2f2643',
};

/** Minimum touch target (dp). */
export const TOUCH = 48;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio of two `#rrggbb` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

type Key = keyof Theme;

/**
 * Every foreground/background pair the screens draw, with the WCAG AA minimum it must meet:
 * 4.5:1 for text, 3:1 for the parts of controls and meters needed to see them (1.4.11).
 * Disabled controls are exempt in WCAG but are held to 4.5:1 here anyway.
 */
export const CONTRAST_PAIRS: ReadonlyArray<{ fg: Key; bg: Key; min: number; use: string }> = [
  { fg: 'text', bg: 'bg', min: 4.5, use: 'body text' },
  { fg: 'text', bg: 'surface', min: 4.5, use: 'text in panels and buttons' },
  { fg: 'text', bg: 'surface2', min: 4.5, use: 'text on secondary surfaces' },
  { fg: 'muted', bg: 'bg', min: 4.5, use: 'hints and the seed line' },
  { fg: 'muted', bg: 'surface', min: 4.5, use: 'details in panels and choices' },
  { fg: 'muted', bg: 'surface2', min: 4.5, use: 'state text of locked map nodes' },
  { fg: 'accentText', bg: 'accent', min: 4.5, use: 'primary buttons, selected language' },
  { fg: 'accentText', bg: 'danger', min: 4.5, use: 'destructive buttons' },
  { fg: 'disabledText', bg: 'surface2', min: 4.5, use: 'disabled buttons and choices' },
  { fg: 'danger', bg: 'surface', min: 4.5, use: 'status chips' },
  { fg: 'danger', bg: 'bg', min: 4.5, use: '"Run lost" heading' },
  { fg: 'good', bg: 'bg', min: 4.5, use: '"Run won" heading' },
  { fg: 'accent', bg: 'surface', min: 4.5, use: 'map node glyphs' },
  { fg: 'accent', bg: 'bg', min: 4.5, use: 'dev tools link' },
  { fg: 'outline', bg: 'surface', min: 3, use: 'secondary button, input and card outlines' },
  { fg: 'outline', bg: 'bg', min: 3, use: 'control outlines against the screen' },
  { fg: 'accent', bg: 'bg', min: 3, use: 'available node and choice borders' },
  { fg: 'focus', bg: 'surface', min: 3, use: 'pressed outline' },
  { fg: 'danger', bg: 'bg', min: 3, use: 'confirmation and replace borders' },
  { fg: 'good', bg: 'surface2', min: 3, use: 'HP meter fill on its track' },
  { fg: 'accent', bg: 'surface2', min: 3, use: 'focus meter fill on its track' },
  { fg: 'text', bg: 'bg', min: 3, use: 'current map node border' },
  { fg: 'text', bg: 'plate', min: 4.5, use: 'text on pixel plates' },
  { fg: 'muted', bg: 'plate', min: 4.5, use: 'details on pixel plates' },
  { fg: 'text', bg: 'button', min: 4.5, use: 'text on pixel buttons' },
  { fg: 'muted', bg: 'button', min: 4.5, use: 'details on pixel buttons' },
  { fg: 'danger', bg: 'button', min: 4.5, use: 'destructive button labels' },
  { fg: 'danger', bg: 'plate', min: 4.5, use: 'status chips and warnings on plates' },
  { fg: 'good', bg: 'plate', min: 4.5, use: '"Run won" on the end plate' },
  { fg: 'danger', bg: 'bg', min: 4.5, use: 'warning stripe text' },
];
