// The mobile sheet: bottom sheet in portrait, side drawer in landscape, Close at 48 dp, hardware back,
// modal for screen readers, focus in and back out, and no slide with reduce motion.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setLang } from '@kinfall/core/platform/i18n';
import { createRef, type ComponentProps, type ComponentRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Dimensions, StyleSheet, Text, View } from 'react-native';

import * as SafeArea from 'react-native-safe-area-context';

import { resetMotionSettingForTests, setAppReduceMotion } from '../../src/platform/motionSetting';
import { Sheet, useSheetBackdropProps } from '../../src/ui/Sheet';
import { flush } from '../../test-support/battleFixtures';

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];
type Win = { width: number; height: number; fontScale: number };
const PORTRAIT: Win = { width: 411, height: 914, fontScale: 1 };
const LANDSCAPE: Win = { width: 891, height: 411, fontScale: 1 };

let backHandlers: BackFn[];
let focus: jest.SpiedFunction<typeof AccessibilityInfo.sendAccessibilityEvent>;
let timing: jest.SpiedFunction<typeof Animated.timing>;

function windowIs(w: Win) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ ...w, scale: 2.625 });
}

beforeEach(() => {
  setLang('en');
  resetMotionSettingForTests();
  windowIs(PORTRAIT);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  timing = jest.spyOn(Animated, 'timing');
  focus.mockClear();
  timing.mockClear();
  backHandlers = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
    backHandlers.push(handler);
    return { remove: () => void (backHandlers = backHandlers.filter((h) => h !== handler)) };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  resetMotionSettingForTests();
  setLang('en');
});

function sheet(props: Partial<ComponentProps<typeof Sheet>> = {}) {
  return (
    <Sheet visible onClose={() => {}} title="Party" {...props}>
      <Text>body text</Text>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('renders the title and a Close button of at least 48 dp', async () => {
    await render(sheet());
    expect(screen.getByText('Party')).toBeTruthy();
    expect(screen.getByText('body text')).toBeTruthy();
    const close = screen.getByRole('button', { name: 'Close' });
    const style = StyleSheet.flatten(close.props.style) as { minHeight?: number; height?: number };
    expect(Number(style.minHeight ?? style.height ?? 0)).toBeGreaterThanOrEqual(48);
  });

  it('names Close in Spanish too', async () => {
    setLang('es');
    await render(sheet());
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
  });

  it('renders nothing while not visible', async () => {
    await render(sheet({ visible: false }));
    expect(screen.queryByText('Party')).toBeNull();
    expect(backHandlers).toHaveLength(0);
  });

  it('Close, the scrim and the hardware back call onClose', async () => {
    const onClose = jest.fn();
    await render(sheet({ onClose }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('sheet-scrim', { hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(backHandlers).toHaveLength(1);
    expect(backHandlers[0]!({} as Parameters<BackFn>[0])).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('listens to the hardware back only while visible', async () => {
    const r = await render(sheet({ visible: false }));
    expect(backHandlers).toHaveLength(0);
    await r.rerender(sheet({ visible: true }));
    expect(backHandlers).toHaveLength(1);
    await r.rerender(sheet({ visible: false }));
    expect(backHandlers).toHaveLength(0);
  });

  it('marks itself modal', async () => {
    await render(sheet());
    expect(screen.getByTestId('sheet').props.accessibilityViewIsModal).toBe(true);
  });

  it('is a bottom sheet in portrait (at most 80% of the window) and a right drawer in landscape', async () => {
    const r = await render(sheet());
    const portrait = StyleSheet.flatten(screen.getByTestId('sheet').props.style) as Record<string, number>;
    expect(portrait.maxHeight).toBe(Math.round(PORTRAIT.height * 0.8));
    expect(portrait.width).toBeUndefined();
    await r.unmount();
    windowIs(LANDSCAPE);
    await render(sheet());
    const landscape = StyleSheet.flatten(screen.getByTestId('sheet').props.style) as Record<string, number>;
    expect(landscape.width).toBe(Math.min(480, Math.round(LANDSCAPE.width * 0.5)));
    expect(landscape.maxHeight).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByTestId('sheet-root').props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-end' });
  });

  it('scrolls its body inside the sheet', async () => {
    await render(sheet());
    expect(screen.getByTestId('sheet-body').type).toBe('RCTScrollView');
  });

  it('slides in, and does not animate when reduce motion is on', async () => {
    const r = await render(sheet());
    expect(timing).toHaveBeenCalled();
    await r.unmount();
    timing.mockClear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(true));
    const r2 = await render(sheet({ visible: false }));
    await flush();
    await r2.rerender(sheet({ visible: true }));
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByText('Party')).toBeTruthy();
  });

  it('does not animate either when the app reduce motion switch is on', async () => {
    setAppReduceMotion(true);
    await render(sheet());
    expect(timing).not.toHaveBeenCalled();
  });

  it('moves the focus to the title on open and back to the opener on close', async () => {
    setAppReduceMotion(true);
    const openerRef = createRef<ComponentRef<typeof View>>();
    const tree = (visible: boolean) => (
      <View>
        <View ref={openerRef} testID="opener" />
        {sheet({ visible, openerRef })}
      </View>
    );
    const r = await render(tree(false));
    expect(focus).not.toHaveBeenCalled();
    await r.rerender(tree(true));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenLastCalledWith(expect.anything(), 'focus');
    expect(focus.mock.calls[0]![0]).not.toBe(openerRef.current);
    focus.mockClear();
    await r.rerender(tree(false));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0]![0]).toBe(openerRef.current);
    expect(screen.queryByText('Party')).toBeNull();
  });

  it('keeps the Close button out of the accessibility tree while not visible', async () => {
    await render(sheet({ visible: false }));
    expect(screen.queryByRole('button', { name: 'Close', hidden: true })).toBeNull();
    expect(screen.queryByTestId('sheet-close', { hidden: true })).toBeNull();
  });

  it('stays mounted when it is reopened while the slide-out is still running', async () => {
    const r = await render(sheet());
    await r.rerender(sheet({ visible: false }));
    await r.rerender(sheet({ visible: true }));
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 350));
    });
    expect(screen.getByText('Party')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('does not touch state after an unmount in the middle of the slide', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await render(sheet());
    await r.rerender(sheet({ visible: false }));
    await r.unmount();
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 350));
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not re-add the back handler when only onClose changes', async () => {
    const add = BackHandler.addEventListener as jest.Mock;
    const first = jest.fn();
    const second = jest.fn();
    const r = await render(sheet({ onClose: first }));
    const calls = add.mock.calls.length;
    await r.rerender(sheet({ onClose: second }));
    expect(add.mock.calls.length).toBe(calls);
    expect(backHandlers).toHaveLength(1);
    backHandlers[0]!({} as Parameters<BackFn>[0]);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('keeps the Close button above the system bars (bottom inset in portrait, right and bottom in landscape)', async () => {
    jest.spyOn(SafeArea, 'useSafeAreaInsets').mockReturnValue({ top: 0, left: 0, right: 24, bottom: 34 });
    const r = await render(sheet());
    expect(StyleSheet.flatten(screen.getByTestId('sheet').props.style)).toMatchObject({ paddingBottom: 16 + 34 });
    await r.unmount();
    windowIs(LANDSCAPE);
    await render(sheet());
    expect(StyleSheet.flatten(screen.getByTestId('sheet').props.style)).toMatchObject({ paddingRight: 16 + 24, paddingBottom: 34 });
  });

  it('does nothing on close without an opener', async () => {
    setAppReduceMotion(true);
    const r = await render(sheet());
    focus.mockClear();
    await r.rerender(sheet({ visible: false }));
    expect(focus).not.toHaveBeenCalled();
  });
});

describe('useSheetBackdropProps', () => {
  function Root({ open }: { open: boolean }) {
    return <View testID="root" {...useSheetBackdropProps(open)} />;
  }
  it('hides what is behind the sheet only while it is open', async () => {
    const r = await render(<Root open={false} />);
    expect(screen.getByTestId('root', { hidden: true }).props.importantForAccessibility).toBe('auto');
    await r.rerender(<Root open />);
    expect(screen.getByTestId('root', { hidden: true }).props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByTestId('root', { hidden: true }).props.accessibilityElementsHidden).toBe(true);
  });
});
