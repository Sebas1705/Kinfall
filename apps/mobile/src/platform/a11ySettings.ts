import { useEffect, useState } from 'react';
import { AccessibilityInfo, PixelRatio, useWindowDimensions } from 'react-native';

export interface A11ySettings {
  /** The system "remove animations" / reduce motion switch. */
  reduceMotion: boolean;
  /** The system font scale (1 = default size). */
  fontScale: number;
}

/**
 * Live system accessibility settings. `reduceMotion` starts false until the system answers;
 * `fontScale` is read on every render, and a window change (which carries font scale changes)
 * triggers that render.
 */
export function useA11ySettings(): A11ySettings {
  const [reduceMotion, setReduceMotion] = useState(false);
  useWindowDimensions();

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return { reduceMotion, fontScale: PixelRatio.getFontScale() };
}
