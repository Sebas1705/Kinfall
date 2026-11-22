// Immersive mode on Android: the navigation bar and the status bar are hidden (a swipe from the
// edge brings them back for a moment, the system default once they are hidden) or shown again.
// A no-op on every other platform, and it never rejects: a device that refuses just keeps its bars.
import * as NavigationBar from 'expo-navigation-bar';
import { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';

import { useImmersive } from './immersiveSetting';

export async function applyImmersive(on: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    StatusBar.setHidden(on, 'fade');
    await NavigationBar.setVisibilityAsync(on ? 'hidden' : 'visible');
  } catch {
    /* keep the bars as they are */
  }
}

/** Applies the saved choice now and whenever it changes; mount it once at the app root. */
export function useApplyImmersive(): void {
  const on = useImmersive();
  useEffect(() => {
    void applyImmersive(on);
  }, [on]);
}
