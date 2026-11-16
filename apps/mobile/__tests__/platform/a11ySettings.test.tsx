import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, PixelRatio } from 'react-native';

import { useA11ySettings } from '../../src/platform/a11ySettings';

type Listener = (enabled: boolean) => void;

function mockInfo(initial: boolean) {
  let listener: Listener | null = null;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(initial);
  const add = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, l: Listener) => {
    if (name !== 'reduceMotionChanged') return { remove: () => {} };
    listener = l;
    return { remove };
  }) as never);
  add.mockClear();
  return { emit: (v: boolean) => listener?.(v), remove, add };
}

describe('useA11ySettings', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports the initial reduce motion and font scale', async () => {
    mockInfo(true);
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    const { result } = await renderHook(() => useA11ySettings());
    expect(result.current.fontScale).toBe(1.3);
    await act(async () => {});
    expect(result.current.reduceMotion).toBe(true);
  });

  it('defaults to motion allowed and updates on the change event', async () => {
    const info = mockInfo(false);
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    const { result } = await renderHook(() => useA11ySettings());
    await act(async () => {});
    expect(result.current.reduceMotion).toBe(false);
    await act(async () => info.emit(true));
    expect(result.current.reduceMotion).toBe(true);
    await act(async () => info.emit(false));
    expect(result.current.reduceMotion).toBe(false);
  });

  it('removes its subscription on unmount', async () => {
    const info = mockInfo(false);
    const { unmount } = await renderHook(() => useA11ySettings());
    expect(info.add).toHaveBeenCalledTimes(1);
    await unmount();
    expect(info.remove).toHaveBeenCalledTimes(1);
  });

  it('survives a rejecting reduce motion query', async () => {
    mockInfo(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('no'));
    const { result } = await renderHook(() => useA11ySettings());
    await act(async () => {});
    expect(result.current.reduceMotion).toBe(false);
  });
});
