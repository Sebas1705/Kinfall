import { useColorScheme } from 'react-native';

/** Key colours, mirrored from the web tokens in apps/web/src/styles.css (:root and dark media query). */
export interface Theme {
  bg: string;
  text: string;
  muted: string;
  border: string;
}

export const LIGHT: Theme = { bg: '#f6f6fa', text: '#16161d', muted: '#4c4f60', border: '#c9cad6' };
export const DARK: Theme = { bg: '#0e0e13', text: '#f1f1f6', muted: '#b6b9c9', border: '#3a3d4f' };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
