// The scroll-into-view machinery of Screen (useReveal): where it scrolls, its retry after a frame,
// the repeat on a late content size change, and the pinned footer's own scroll area. This is the
// code behind the abandon confirmation that opened cut off on the emulator in Task 8.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { createRef } from 'react';
import { Dimensions, StyleSheet, Text, type ScrollViewInstance } from 'react-native';

import { FOOTER_MAX_SHARE, revealScrollY, Screen, useReveal, type Reveal } from '../../src/ui/Screen';

/** Top padding of the scrolling content (Screen's PAD_TOP): measured positions are below it. */
const PAD_TOP = 16;

/** Hands the reveal function of the scroll area it sits in to the test. */
function Probe({ onReveal }: { onReveal: (r: Reveal) => void }) {
  onReveal(useReveal());
  return null;
}

/** A target whose measureLayout reports `y`/`h` relative to the scroll body, like a host view. */
function target(y: number, h: number) {
  return { measureLayout: jest.fn((_rel: unknown, ok: (x: number, y: number, w: number, h: number) => void) => ok(0, y, 300, h)) };
}

async function renderScreen(props: { onContentSizeChange?: (w: number, h: number) => void } = {}) {
  const ref = createRef<ScrollViewInstance>();
  let main: Reveal = () => {};
  let foot: Reveal = () => {};
  await render(
    <Screen
      ref={ref}
      testID="scr"
      onContentSizeChange={props.onContentSizeChange}
      footer={<Probe onReveal={(r) => (foot = r)} />}
      footerTestID="foot"
    >
      <Probe onReveal={(r) => (main = r)} />
      <Text>body</Text>
    </Screen>,
  );
  const scroll = screen.getByTestId('scr');
  const scrollTo = jest.mocked(ref.current!.scrollTo);
  scrollTo.mockClear();
  return {
    scroll,
    scrollTo,
    reveal: (t: unknown) => act(() => main(t)),
    footReveal: () => foot,
    mainReveal: () => main,
    /** The viewport height, learnt from the scroll view's layout. */
    viewport: (height: number) => fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } }),
    /** A scroll event: the only way the screen learns where it really is. */
    scrolledTo: (y: number) => fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y } } }),
    sizeChanged: (h: number) => fireEvent(scroll, 'contentSizeChange', 360, h),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Screen reveal', () => {
  it('scrolls an element below the viewport just into view, without animation', async () => {
    const s = await renderScreen();
    await s.viewport(600);
    await s.scrolledTo(1000);
    await s.reveal(target(1500, 200));
    const expected = revealScrollY(1500 + PAD_TOP, 200, 1000, 600)!;
    expect(expected).toBe(1500 + PAD_TOP + 200 + 16 - 600);
    expect(s.scrollTo).toHaveBeenCalledTimes(1);
    expect(s.scrollTo).toHaveBeenLastCalledWith({ y: expected, animated: false });
  });

  it('leaves an element that is already fully visible alone', async () => {
    const s = await renderScreen();
    await s.viewport(600);
    await s.scrolledTo(1000);
    await s.reveal(target(1100, 100));
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(s.scrollTo).not.toHaveBeenCalled();
  });

  it('tries again after a frame while no scroll event says the first scroll landed (a clamped scroll)', async () => {
    const s = await renderScreen();
    await s.viewport(600);
    await s.reveal(target(900, 120));
    expect(s.scrollTo).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(149);
    });
    expect(s.scrollTo).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(s.scrollTo).toHaveBeenCalledTimes(2);
    expect(s.scrollTo.mock.calls[1]).toEqual(s.scrollTo.mock.calls[0]);
  });

  it('does not repeat the scroll once a scroll event reports it landed', async () => {
    const s = await renderScreen();
    await s.viewport(600);
    await s.reveal(target(900, 120));
    const { y } = s.scrollTo.mock.calls[0]![0] as { y: number };
    await s.scrolledTo(y);
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(s.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('reveals the last element again when the content grows soon after, once, and forwards every size change', async () => {
    const onSize = jest.fn();
    const s = await renderScreen({ onContentSizeChange: onSize });
    await s.viewport(600);
    await s.reveal(target(900, 120));
    await s.sizeChanged(1200);
    expect(s.scrollTo).toHaveBeenCalledTimes(2);
    expect(onSize).toHaveBeenLastCalledWith(360, 1200);
    // The pending reveal is used up: a second size change does not scroll again.
    await s.sizeChanged(1300);
    expect(s.scrollTo).toHaveBeenCalledTimes(2);
    expect(onSize).toHaveBeenCalledTimes(2);
  });

  it('ignores a content size change that comes more than a second after the reveal', async () => {
    const s = await renderScreen();
    await s.viewport(600);
    await s.reveal(target(900, 120));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    const before = s.scrollTo.mock.calls.length;
    await s.sizeChanged(1400);
    expect(s.scrollTo).toHaveBeenCalledTimes(before);
  });

  it('does nothing for a target that cannot be measured, or before the viewport is known', async () => {
    const s = await renderScreen();
    await s.reveal(null);
    await s.reveal({});
    await s.reveal(target(5000, 100));
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(s.scrollTo).not.toHaveBeenCalled();
  });
});

describe('Screen footer', () => {
  it('pins the footer below the content, capped at its share of the window, with its own reveal', async () => {
    const s = await renderScreen();
    const footer = screen.getByTestId('foot');
    const style = StyleSheet.flatten(footer.props.style) as { maxHeight: number };
    expect(style.maxHeight).toBe(Math.round(Dimensions.get('window').height * FOOTER_MAX_SHARE));
    // The footer is outside the main scroll area, and its children reveal inside the footer.
    expect(within(s.scroll).queryByTestId('foot')).toBeNull();
    expect(s.footReveal()).not.toBe(s.mainReveal());
  });

  it('renders no footer area without a footer', async () => {
    await render(
      <Screen testID="plain">
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByTestId('plain')).toBeTruthy();
    expect(screen.queryByTestId('foot')).toBeNull();
  });
});
