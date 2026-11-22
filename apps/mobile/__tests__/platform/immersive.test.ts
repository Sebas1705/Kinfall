import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { Platform, StatusBar } from 'react-native';

jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(async () => {}) }));

import * as NavigationBar from 'expo-navigation-bar';

import { applyImmersive, useApplyImmersive } from '../../src/platform/immersive';
import { immersiveSetting, resetImmersiveSettingForTests } from '../../src/platform/immersiveSetting';

const setVisibility = jest.mocked(NavigationBar.setVisibilityAsync);

function os(name: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => name });
}

let hidden: jest.SpiedFunction<typeof StatusBar.setHidden>;
beforeEach(() => {
  hidden = jest.spyOn(StatusBar, 'setHidden').mockImplementation(() => {});
  setVisibility.mockClear();
  resetImmersiveSettingForTests();
});
afterEach(() => {
  jest.restoreAllMocks();
  resetImmersiveSettingForTests();
});

describe('applyImmersive', () => {
  it('hides the navigation bar and the status bar on Android', async () => {
    os('android');
    await applyImmersive(true);
    expect(setVisibility).toHaveBeenCalledWith('hidden');
    expect(hidden).toHaveBeenCalledWith(true, 'fade');
  });

  it('shows them again when turned off', async () => {
    os('android');
    await applyImmersive(false);
    expect(setVisibility).toHaveBeenCalledWith('visible');
    expect(hidden).toHaveBeenCalledWith(false, 'fade');
  });

  it('does nothing on iOS', async () => {
    os('ios');
    await applyImmersive(true);
    expect(setVisibility).not.toHaveBeenCalled();
    expect(hidden).not.toHaveBeenCalled();
  });

  it('never rejects when the native call fails', async () => {
    os('android');
    setVisibility.mockRejectedValueOnce(new Error('no activity'));
    await expect(applyImmersive(true)).resolves.toBeUndefined();
  });
});

describe('useApplyImmersive', () => {
  it('applies the saved choice at mount and on every change', async () => {
    os('android');
    await immersiveSetting.set(true);
    await renderHook(() => useApplyImmersive());
    expect(setVisibility).toHaveBeenLastCalledWith('hidden');
    await immersiveSetting.set(false);
    expect(setVisibility).toHaveBeenLastCalledWith('visible');
  });
});
