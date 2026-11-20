import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { setLang } from '@kinfall/core/platform/i18n';
import { AccessibilityInfo } from 'react-native';

import {
  REDUCE_MOTION_KEY,
  appReduceMotion,
  loadMotionSetting,
  resetMotionSettingForTests,
  setAppReduceMotion,
  useReducedMotion,
} from '../../src/platform/motionSetting';
import { MotionToggle } from '../../src/ui/MotionToggle';
import { memoryStorage } from '../../test-support/runFixtures';

beforeEach(() => {
  setLang('en');
  resetMotionSettingForTests();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
});
afterEach(() => {
  resetMotionSettingForTests();
  jest.restoreAllMocks();
});

describe('app reduce-motion setting', () => {
  it('loads the saved switch and saves changes', async () => {
    const storage = memoryStorage();
    storage.data.set(REDUCE_MOTION_KEY, '1');
    expect(await loadMotionSetting(storage)).toBe(true);
    setAppReduceMotion(false);
    await Promise.resolve();
    expect(storage.data.get(REDUCE_MOTION_KEY)).toBe('0');
    expect(appReduceMotion()).toBe(false);
  });

  it('falls back to off when the storage fails', async () => {
    const broken = { getItem: () => Promise.reject(new Error('nope')), setItem: () => Promise.reject(new Error('nope')), removeItem: () => Promise.resolve() };
    expect(await loadMotionSetting(broken)).toBe(false);
    // A failed save keeps the choice for this session.
    setAppReduceMotion(true);
    await Promise.resolve();
    expect(appReduceMotion()).toBe(true);
  });

  it('reduces motion when either the system or the app asks', async () => {
    await loadMotionSetting(memoryStorage());
    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    await act(async () => setAppReduceMotion(true));
    expect(result.current).toBe(true);
    await act(async () => setAppReduceMotion(false));
    expect(result.current).toBe(false);
  });

  it('follows the system switch', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockImplementation(() => Promise.resolve(true));
    await loadMotionSetting(memoryStorage());
    const { result } = await renderHook(() => useReducedMotion());
    await act(async () => {});
    expect(result.current).toBe(true);
  });
});

describe('MotionToggle', () => {
  it('is a named switch whose checked state follows the app setting', async () => {
    await loadMotionSetting(memoryStorage());
    await render(<MotionToggle />);
    const sw = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(sw.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(sw);
    expect(screen.getByRole('switch', { name: 'Reduce motion' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(appReduceMotion()).toBe(true);
  });

  it('is named in Spanish too', async () => {
    setLang('es');
    await render(<MotionToggle />);
    expect(screen.getByRole('switch', { name: 'Reducir movimiento' })).toBeTruthy();
  });
});
