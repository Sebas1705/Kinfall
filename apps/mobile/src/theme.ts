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
  border: string;
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
  accent: '#3a5bd9',
  accentText: '#ffffff',
  focus: '#1f46c4',
  danger: '#b3261e',
  good: '#1e7a34',
  disabledText: '#6b6e7d',
};

export const DARK: Theme = {
  bg: '#0e0e13',
  surface: '#181922',
  surface2: '#232532',
  text: '#f1f1f6',
  muted: '#b6b9c9',
  border: '#3a3d4f',
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
