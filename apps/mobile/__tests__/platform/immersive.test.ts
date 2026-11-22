import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { Platform, StatusBar } from 'react-native';

jest.mock('expo-navigation-bar', () => ({ NavigationBar: { setHidden: jest.fn() } }));

import { NavigationBar } from 'expo-navigation-bar';

import { applyImmersive, useApplyImmersive } from '../../src/platform/immersive';
import { IMMERSIVE_KEY, immersiveSetting, loadImmersiveSetting, resetImmersiveSettingForTests } from '../../src/platform/immersiveSetting';
import { memoryStorage } from '../../test-support/runFixtures';

const setHidden = jest.mocked(NavigationBar.setHidden);

function os(name: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => name });
}

let hidden: jest.SpiedFunction<typeof StatusBar.setHidden>;
beforeEach(() => {
  hidden = jest.spyOn(StatusBar, 'setHidden').mockImplementation(() => {});
  setHidden.mockClear();
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
    expect(setHidden).toHaveBeenCalledWith(true);
    expect(hidden).toHaveBeenCalledWith(true, 'fade');
  });

  it('shows them again when turned off', async () => {
    os('android');
    await applyImmersive(false);
    expect(setHidden).toHaveBeenCalledWith(false);
    expect(hidden).toHaveBeenCalledWith(false, 'fade');
  });

  it('does nothing on iOS', async () => {
    os('ios');
    await applyImmersive(true);
    expect(setHidden).not.toHaveBeenCalled();
    expect(hidden).not.toHaveBeenCalled();
  });

  it('never rejects when the native call fails', async () => {
    os('android');
    setHidden.mockImplementationOnce(() => {
      throw new Error('no activity');
    });
    await expect(applyImmersive(true)).resolves.toBeUndefined();
  });
});

describe('useApplyImmersive', () => {
  it('applies the saved choice at mount and on every change', async () => {
    os('android');
    await immersiveSetting.set(true);
    await renderHook(() => useApplyImmersive());
    expect(setHidden).toHaveBeenLastCalledWith(true);
    await immersiveSetting.set(false);
    expect(setHidden).toHaveBeenLastCalledWith(false);
  });

  it('never hides the bars with the default while the saved choice is unread, and not at all when it is off', async () => {
    os('android');
    const storage = memoryStorage({ [IMMERSIVE_KEY]: '0' });
    await renderHook(() => useApplyImmersive());
    expect(setHidden).not.toHaveBeenCalled();
    await loadImmersiveSetting(storage);
    expect(setHidden).toHaveBeenCalledTimes(1);
    expect(setHidden).toHaveBeenCalledWith(false);
    expect(setHidden).not.toHaveBeenCalledWith(true);
  });
});
