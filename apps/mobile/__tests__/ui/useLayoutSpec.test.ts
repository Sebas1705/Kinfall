import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { resetTextSizeSettingForTests, textSizeSetting } from '../../src/platform/textSizeSetting';
import { useLayoutSpec } from '../../src/ui/useLayoutSpec';

function windowIs(width: number, height: number, fontScale: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, fontScale, scale: 2 });
}

beforeEach(() => resetTextSizeSettingForTests());
afterEach(() => {
  resetTextSizeSettingForTests();
  jest.restoreAllMocks();
});

describe('useLayoutSpec', () => {
  it('returns the landscape console for 640x360 at fontScale 1 and the fallback at fontScale 2', async () => {
    windowIs(640, 360, 1);
    const normal = (await renderHook(() => useLayoutSpec('battle'))).result.current;
    expect(normal.orientation).toBe('landscape');
    expect(normal.mode).toBe('console');
    windowIs(640, 360, 2);
    const big = (await renderHook(() => useLayoutSpec('battle'))).result.current;
    expect(big.mode).toBe('fallback');
  });

  it('follows the app text size multiplied by the system scale (capped)', async () => {
    windowIs(800, 400, 1.2);
    const { result } = await renderHook(() => useLayoutSpec('battle'));
    expect(result.current.mode).toBe('console');
    await act(async () => {
      await textSizeSetting.set(150);
    });
    expect(result.current.mode).toBe('fallback');
  });
});
