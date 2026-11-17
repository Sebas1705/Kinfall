import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { needsExplicitAnnouncements, useAnnounce } from '../../src/platform/announce';

let announce: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibility>;
const realOS = Platform.OS;

function setOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  announce.mockClear();
});
afterEach(() => {
  setOS(realOS as 'ios' | 'android');
  jest.restoreAllMocks();
});

describe('useAnnounce', () => {
  it('only iOS needs explicit announcements (Android reads live regions by itself)', () => {
    expect(needsExplicitAnnouncements('ios')).toBe(true);
    expect(needsExplicitAnnouncements('android')).toBe(false);
  });

  it('on iOS announces once per key: a re-render or a rewritten text with the same key stays silent', async () => {
    setOS('ios');
    const { rerender } = await renderHook(({ k, text }: { k: unknown; text: string }) => useAnnounce(k, text), {
      initialProps: { k: 1 as unknown, text: 'Turn one.' },
    });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('Turn one.');
    await rerender({ k: 1, text: 'Turno uno.' });
    expect(announce).toHaveBeenCalledTimes(1);
    await rerender({ k: 2, text: 'Turn two.' });
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('Turn two.');
  });

  it('a null key (nothing new, e.g. after a resume) or an empty text announces nothing', async () => {
    setOS('ios');
    const { rerender } = await renderHook(({ k, text }: { k: unknown; text: string }) => useAnnounce(k, text), {
      initialProps: { k: null as unknown, text: 'Old line.' },
    });
    await rerender({ k: 3, text: '' });
    expect(announce).not.toHaveBeenCalled();
  });

  it('on Android never announces by itself (no double reading with the live region)', async () => {
    setOS('android');
    await renderHook(() => useAnnounce(1, 'Turn one.'));
    expect(announce).not.toHaveBeenCalled();
  });
});
