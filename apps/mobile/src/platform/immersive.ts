// Immersive mode on Android: the navigation bar and the status bar are hidden (a swipe from the
// edge brings them back for a moment, the system default once they are hidden) or shown again.
// A no-op on every other platform, and it never rejects: a device that refuses just keeps its bars.
import { NavigationBar } from 'expo-navigation-bar';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform, StatusBar } from 'react-native';

import { immersiveSetting, useImmersive } from './immersiveSetting';

export async function applyImmersive(on: boolean): Promise<void> {
  // Async only to keep the callers' contract; the native calls are synchronous.
  if (Platform.OS !== 'android') return;
  try {
    StatusBar.setHidden(on, 'fade');
    NavigationBar.setHidden(on);
  } catch {
    /* keep the bars as they are */
  }
}

/** Applies the saved choice now and whenever it changes; mount it once at the app root. */
export function useApplyImmersive(): void {
  const on = useImmersive();
  const loaded = useSyncExternalStore(immersiveSetting.subscribeLoaded, immersiveSetting.isLoaded, immersiveSetting.isLoaded);
  useEffect(() => {
    if (loaded) void applyImmersive(on);
  }, [on, loaded]);
}
