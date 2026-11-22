// useSettingsSheet: open() shows the sheet, closing hides it, and the focus returns to the opener.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setLang } from '@kinfall/core/platform/i18n';
import { AccessibilityInfo, Pressable, Text } from 'react-native';

import { resetMotionSettingForTests, setAppReduceMotion } from '../../src/platform/motionSetting';
import { useSettingsSheet } from '../../src/ui/useSettingsSheet';

function Host() {
  const { open, sheet, openerRef } = useSettingsSheet();
  return (
    <>
      <Pressable ref={openerRef as never} onPress={open} testID="opener">
        <Text>open</Text>
      </Pressable>
      {sheet}
    </>
  );
}

beforeEach(() => {
  setLang('en');
  resetMotionSettingForTests();
  setAppReduceMotion(true);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  resetMotionSettingForTests();
});

describe('useSettingsSheet', () => {
  it('starts closed, opens with open() and closes with Close', async () => {
    await render(<Host />);
    expect(screen.queryByText('Text size')).toBeNull();
    await fireEvent.press(screen.getByTestId('opener'));
    expect(screen.getByText('Text size')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Text size')).toBeNull();
  });

  it('returns the focus to the opener on close', async () => {
    const focus = AccessibilityInfo.sendAccessibilityEvent as jest.Mock;
    await render(<Host />);
    await fireEvent.press(screen.getByTestId('opener'));
    focus.mockClear();
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0]![1]).toBe('focus');
  });

  it('keeps open stable across renders', async () => {
    const seen: Array<() => void> = [];
    function Probe() {
      seen.push(useSettingsSheet().open);
      return null;
    }
    const r = await render(<Probe />);
    await r.rerender(<Probe />);
    expect(seen[0]).toBe(seen[seen.length - 1]);
  });
});
