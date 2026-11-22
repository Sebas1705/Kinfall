// The settings sheet: language, reduce motion, text size stepper (80 to 150) and the Android-only immersive switch.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setLang } from '@kinfall/core/platform/i18n';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';

import { immersiveSetting, resetImmersiveSettingForTests } from '../../src/platform/immersiveSetting';
import { resetMotionSettingForTests } from '../../src/platform/motionSetting';
import { resetTextSizeSettingForTests, textSizeSetting } from '../../src/platform/textSizeSetting';
import { SettingsSheet } from '../../src/ui/SettingsSheet';

const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
const realOS = Platform.OS;

beforeEach(() => {
  setLang('en');
  resetMotionSettingForTests();
  resetTextSizeSettingForTests();
  resetImmersiveSettingForTests();
  setOS('android');
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  setOS(realOS);
  resetTextSizeSettingForTests();
  resetImmersiveSettingForTests();
  resetMotionSettingForTests();
  setLang('en');
});

const minHeight = (el: { props: { style?: unknown } }) => {
  const s = StyleSheet.flatten(el.props.style as never) as { minHeight?: number; height?: number };
  return Number(s.minHeight ?? s.height ?? 0);
};

describe('SettingsSheet', () => {
  it('shows language, motion, text size and immersive controls', async () => {
    await render(<SettingsSheet visible onClose={() => {}} />);
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByTestId('lang-toggle')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeTruthy();
    expect(screen.getByText('Text size')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Hide system bars' })).toBeTruthy();
  });

  it('renders nothing while hidden', async () => {
    await render(<SettingsSheet visible={false} onClose={() => {}} />);
    expect(screen.queryByText('Text size')).toBeNull();
  });

  it('changing the text size updates textSizeSetting', async () => {
    await render(<SettingsSheet visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Larger text' }));
    expect(textSizeSetting.get()).toBe(110);
    expect(screen.getByText('110%')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Smaller text' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Smaller text' }));
    expect(textSizeSetting.get()).toBe(90);
  });

  it('respects the 80 and 150 limits and disables the button at each end', async () => {
    await act(async () => textSizeSetting.set(80));
    await render(<SettingsSheet visible onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Smaller text' }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Smaller text' }));
    expect(textSizeSetting.get()).toBe(80);
    await act(async () => textSizeSetting.set(150));
    expect(screen.getByRole('button', { name: 'Larger text' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole('button', { name: 'Smaller text' }).props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Larger text' }));
    expect(textSizeSetting.get()).toBe(150);
  });

  it('every control is at least 48 dp and has role, name and state', async () => {
    await render(<SettingsSheet visible onClose={() => {}} />);
    // The sheet's own Close button is named by its visible text and covered in Sheet.test.
    for (const role of ['button', 'switch', 'radio'] as const) {
      const els = screen.getAllByRole(role);
      expect(els.length).toBeGreaterThan(0);
      for (const el of els.filter((e) => e.props.testID !== 'settings-sheet-close')) {
        expect(minHeight(el)).toBeGreaterThanOrEqual(48);
        expect(el.props.accessibilityLabel).toBeTruthy();
        expect(el.props.accessibilityState).toBeDefined();
      }
    }
    expect(screen.getByRole('switch', { name: 'Hide system bars' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('switch', { name: 'Reduce motion' }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it('the immersive switch toggles the setting', async () => {
    await render(<SettingsSheet visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Hide system bars' }));
    expect(immersiveSetting.get()).toBe(false);
    expect(screen.getByRole('switch', { name: 'Hide system bars' }).props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(screen.getByRole('switch', { name: 'Hide system bars' }));
    expect(immersiveSetting.get()).toBe(true);
  });

  it('hides the immersive row on iOS, where it does nothing', async () => {
    setOS('ios');
    await render(<SettingsSheet visible onClose={() => {}} />);
    expect(screen.queryByRole('switch', { name: 'Hide system bars' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeTruthy();
  });

  it('announces the new size explicitly on iOS only', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await render(<SettingsSheet visible onClose={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Larger text' }));
    expect(say).not.toHaveBeenCalled();
    expect(screen.getByText('110%').props.accessibilityLiveRegion).toBe('polite');
    setOS('ios');
    await fireEvent.press(screen.getByRole('button', { name: 'Larger text' }));
    expect(say).toHaveBeenCalledWith('Text size 120%');
  });

  it('writes the title and labels in Spanish too', async () => {
    setLang('es');
    await render(<SettingsSheet visible onClose={() => {}} />);
    expect(screen.getByText('Ajustes')).toBeTruthy();
    expect(screen.getByText('Tamaño del texto')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Texto más grande' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Texto más pequeño' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Ocultar barras del sistema' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Reducir movimiento' })).toBeTruthy();
  });

  it('Close calls onClose', async () => {
    const onClose = jest.fn();
    await render(<SettingsSheet visible onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
