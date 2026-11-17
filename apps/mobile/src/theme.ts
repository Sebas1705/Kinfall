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
}

export const LIGHT: Theme = {
  bg: '#f6f6fa',
  surface: '#ffffff',
  surface2: '#ececf3',
  text: '#16161d',
  muted: '#4c4f60',
  border: '#c9cad6',
  outline: '#767a8c',
  accent: '#3a5bd9',
  accentText: '#ffffff',
  focus: '#1f46c4',
  danger: '#b3261e',
  good: '#1e7a34',
  disabledText: '#5f6271',
};

export const DARK: Theme = {
  bg: '#0e0e13',
  surface: '#181922',
  surface2: '#232532',
  text: '#f1f1f6',
  muted: '#b6b9c9',
  border: '#3a3d4f',
  outline: '#7d8196',
  accent: '#8ea8ff',
  accentText: '#0e0e13',
  focus: '#b6c6ff',
  danger: '#ff8a80',
  good: '#74d68a',
  disabledText: '#9a9db0',
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
];
