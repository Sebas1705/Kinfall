// The scroll-into-view machinery of Screen (useReveal), in the fallback layout where the primary
// region scrolls: where it scrolls, its retry after a frame, the repeat on a late content size
// change, and the pinned actions' own scroll area. This is the
// code behind the abandon confirmation that opened cut off on the emulator in Task 8.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { createRef } from 'react';
import { Dimensions, StyleSheet, Text, type ScrollViewInstance } from 'react-native';

import * as SafeArea from 'react-native-safe-area-context';
import { FOOTER_MAX_SHARE, HUD_MAX_SHARE, revealScrollY, Screen, useReveal, type Reveal } from '../../src/ui/Screen';

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
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 640, fontScale: 2, scale: 2 });
  const ref = createRef<ScrollViewInstance>();
  let main: Reveal = () => {};
  let foot: Reveal = () => {};
  await render(
    <Screen
      ref={ref}
      screen="battle"
      testID="scr"
      onContentSizeChange={props.onContentSizeChange}
      hud={<Text>hud</Text>}
      actions={
        <>
          <Probe onReveal={(r) => (foot = r)} />
          <Text>foot-body</Text>
        </>
      }
    >
      <Probe onReveal={(r) => (main = r)} />
      <Text>body</Text>
    </Screen>,
  );
  // A phone at 200% text does not fit the console layout: the primary region scrolls.
  const scroll = screen.getByTestId('scr-scroll');
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

describe('Screen pinned actions', () => {
  it('pins the actions below the content, capped at their share of the window, with their own reveal', async () => {
    const s = await renderScreen();
    let n = screen.getByText('foot-body').parent;
    let cap = NaN;
    for (; n && Number.isNaN(cap); n = n.parent) {
      const m = StyleSheet.flatten(n.props.style)?.maxHeight;
      if (typeof m === 'number') cap = m;
    }
    expect(cap).toBe(Math.round(Dimensions.get('window').height * FOOTER_MAX_SHARE));
    // The actions are outside the main scroll area, and their children reveal inside their own.
    expect(within(s.scroll).queryByText('foot-body')).toBeNull();
    expect(s.footReveal()).not.toBe(s.mainReveal());
  });
});

type Json = { type: string; children?: (Json | string)[] | null };
/** Host nodes of a rendered tree whose type is RCTScrollView. */
function scrollViews(node: Json | Json[] | null): Json[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(scrollViews);
  const kids = (node.children ?? []).filter((c): c is Json => typeof c !== 'string');
  return [...(node.type === 'RCTScrollView' ? [node] : []), ...kids.flatMap(scrollViews)];
}
function textsIn(node: Json | string): string[] {
  if (typeof node === 'string') return [node];
  return (node.children ?? []).flatMap(textsIn);
}

describe('Screen shell', () => {
  function windowIs(width: number, height: number, fontScale: number) {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, fontScale, scale: 2 });
  }
  const shell = (
    <Screen screen="battle" testID="scr" hud={<Text>hud-slot</Text>} actions={<Text>actions-slot</Text>} info={<Text>info-slot</Text>}>
      <Text>primary-slot</Text>
    </Screen>
  );

  it.each([
    [640, 360, 1],
    [640, 360, 1.3],
    [360, 640, 1],
    [360, 640, 1.3],
  ])('has no ScrollView in console mode at %ix%i, font scale %s', async (w, h, fs) => {
    windowIs(w, h, fs);
    await render(shell);
    expect(scrollViews(screen.toJSON() as Json | Json[] | null)).toHaveLength(0);
    expect(screen.getByText('hud-slot')).toBeTruthy();
    expect(screen.getByText('primary-slot')).toBeTruthy();
    expect(screen.getByText('actions-slot')).toBeTruthy();
    // The info line only exists in portrait.
    expect(screen.queryByText('info-slot') !== null).toBe(h > w);
  });

  it('in the fallback scrolls only the primary region: one ScrollView, HUD and actions outside it', async () => {
    windowIs(640, 360, 2);
    await render(shell);
    const scrolls = scrollViews(screen.toJSON() as Json | Json[] | null);
    // The primary has its own scroll area; the capped HUD and actions may have one each.
    const primary = scrolls.find((sv) => textsIn(sv).includes('primary-slot'))!;
    expect(primary).toBeTruthy();
    expect(textsIn(primary)).not.toContain('hud-slot');
    expect(textsIn(primary)).not.toContain('actions-slot');
    const actionsScroll = scrolls.find((sv) => textsIn(sv).includes('actions-slot'))!;
    expect(textsIn(actionsScroll)).not.toContain('primary-slot');
    expect(textsIn(actionsScroll)).not.toContain('hud-slot');
    expect(scrolls.length).toBeLessThanOrEqual(3);
    expect(screen.getByText('hud-slot')).toBeTruthy();
    expect(screen.getByText('actions-slot')).toBeTruthy();
  });

  it('caps the pinned HUD and tall actions so the primary keeps at least a quarter of the window', async () => {
    windowIs(640, 360, 2);
    await render(
      <Screen screen="battle" hud={<Text>hud-slot</Text>} actions={<Text>tall-actions</Text>}>
        <Text>primary-slot</Text>
      </Screen>,
    );
    const caps = (text: string) => {
      let n = screen.getByText(text).parent;
      while (n) {
        const m = StyleSheet.flatten(n.props.style)?.maxHeight;
        if (typeof m === 'number') return m;
        n = n.parent;
      }
      return NaN;
    };
    expect(caps('hud-slot')).toBe(Math.round(360 * HUD_MAX_SHARE));
    expect(caps('tall-actions')).toBe(Math.round(360 * FOOTER_MAX_SHARE));
    expect(360 - caps('hud-slot') - caps('tall-actions')).toBeGreaterThanOrEqual(360 * 0.25);
  });

  it('pads the console root by the safe-area insets', async () => {
    windowIs(640, 360, 1);
    jest.spyOn(SafeArea, 'useSafeAreaInsets').mockReturnValue({ top: 0, bottom: 20, left: 44, right: 44 });
    await render(shell);
    const root = StyleSheet.flatten(screen.getByTestId('scr').props.style);
    expect(root).toMatchObject({ paddingTop: 0, paddingBottom: 20, paddingLeft: 44, paddingRight: 44 });
  });

  describe('backdrop and overlay (a sheet over the screen)', () => {
    const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;
    const withSheet = (
      <Screen screen="battle" testID="scr" hud={<Text>hud-slot</Text>} actions={<Text>actions-slot</Text>} backdrop={hidden} overlay={<Text>live-slot</Text>}>
        <Text>primary-slot</Text>
      </Screen>
    );
    const hiddenAbove = (id: string) => {
      for (let n = screen.getByText(id, { includeHiddenElements: true }).parent; n; n = n.parent) {
        if (n.props.importantForAccessibility === 'no-hide-descendants') return true;
      }
      return false;
    };

    it.each([
      [640, 360, 1],
      [360, 640, 1],
      [360, 640, 2],
    ])('hides the regions but not the overlay at %ix%i, font scale %s', async (w, h, fs) => {
      windowIs(w, h, fs);
      await render(withSheet);
      for (const id of ['hud-slot', 'primary-slot', 'actions-slot']) expect([id, hiddenAbove(id)]).toEqual([id, true]);
      expect(hiddenAbove('live-slot')).toBe(false);
    });

    it('floats the overlay over the primary region and, in portrait, reserves the info line for it', async () => {
      windowIs(360, 640, 1);
      await render(withSheet);
      const overlay = StyleSheet.flatten(screen.getByTestId('scr-overlay').props.style);
      expect(overlay).toMatchObject({ position: 'absolute', bottom: 0, left: 0, right: 0 });
      expect(overlay.height).toBeGreaterThan(0);
    });

    it('floats the overlay at its own height in landscape, where there is no info line', async () => {
      windowIs(640, 360, 1);
      await render(withSheet);
      const overlay = StyleSheet.flatten(screen.getByTestId('scr-overlay').props.style);
      expect(overlay).toMatchObject({ position: 'absolute', bottom: 0 });
      expect(overlay.height).toBeUndefined();
    });

    it('is a strip between the scrolling primary region and the actions in the fallback', async () => {
      windowIs(360, 640, 2);
      await render(withSheet);
      const strip = screen.getByTestId('scr-overlay');
      expect(StyleSheet.flatten(strip.props.style).position).toBeUndefined();
      expect(within(screen.getByTestId('scr-scroll', { includeHiddenElements: true })).queryByText('live-slot', { includeHiddenElements: true })).toBeNull();
    });
  });
});
