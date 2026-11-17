// Screen-reader announcements that work on both platforms without saying things twice. Android
// reads `accessibilityLiveRegion` views by itself when their content changes, so the app only
// marks those regions there. iOS has no live regions: the same text is announced explicitly with
// AccessibilityInfo.announceForAccessibility. Announcements are keyed, so a re-render (or a language
// change that rewrites the same lines) never repeats them; only a new key speaks.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** True where the app must announce by itself (no live regions). */
export function needsExplicitAnnouncements(os: string = Platform.OS): boolean {
  return os === 'ios';
}

/**
 * Announces `text` once per distinct `key` on platforms without live regions. A null key or an
 * empty text announces nothing (use it for "nothing new", e.g. after a resume).
 */
export function useAnnounce(key: unknown, text: string): void {
  const last = useRef<unknown>(null);
  useEffect(() => {
    if (key === null || key === undefined || key === last.current) return;
    last.current = key;
    if (text && needsExplicitAnnouncements()) AccessibilityInfo.announceForAccessibility(text);
  }, [key, text]);
}
