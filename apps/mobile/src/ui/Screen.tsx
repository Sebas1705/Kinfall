import { createContext, useCallback, useContext, useMemo, useRef, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { useLayout } from './windowSize';

/** Space kept around a revealed element (dp). */
const REVEAL_MARGIN = 16;
/** Top padding of the scrolling content (dp); measured positions are relative to the body below it. */
const PAD_TOP = 16;
/** How long after a reveal a content size change still repeats it (ms). */
const PENDING_MS = 1000;
/** Delay of the second reveal attempt (ms). */
const REVEAL_RETRY_MS = 150;
/** Largest share of the window height the pinned footer may take; it scrolls inside beyond that. */
export const FOOTER_MAX_SHARE = 0.55;

type Measurable = { measureLayout?: (relativeTo: unknown, onSuccess: (x: number, y: number, w: number, h: number) => void, onFail?: () => void) => void };

/** Scrolls the nearest scroll area so that an element is fully on screen (or its top, if taller). */
export type Reveal = (target: unknown) => void;

export const RevealContext = createContext<Reveal>(() => {});

/**
 * Where to scroll so that an element at content position `y` (height `h`) is fully visible in a
 * viewport of `viewport` dp currently scrolled to `offset`, with a margin around it; null when it
 * already is. An element taller than the viewport is aligned by its top.
 */
export function revealScrollY(y: number, h: number, offset: number, viewport: number, margin = REVEAL_MARGIN): number | null {
  if (viewport <= 0) return null;
  const top = y - margin;
  const bottom = y + h + margin;
  if (top < offset || bottom - top > viewport) return Math.max(0, top);
  if (bottom > offset + viewport) return bottom - viewport;
  return null;
}

/** The reveal function of the scroll area an element sits in (a no-op outside any). */
export function useReveal(): Reveal {
  return useContext(RevealContext);
}

interface RevealScrollProps {
  children: ReactNode;
  testID?: string;
  scrollRef?: Ref<ScrollViewInstance>;
  contentPadding: { top: number; bottom: number; left: number; right: number };
  maxWidth: number;
  style?: object;
  onContentSizeChange?: (width: number, height: number) => void;
}

/** A vertical scroll area whose descendants can ask to be scrolled into view (useReveal). */
function RevealScroll({ children, testID, scrollRef, contentPadding, maxWidth, style, onContentSizeChange }: RevealScrollProps) {
  const scroll = useRef<ScrollViewInstance | null>(null);
  const body = useRef<ComponentRef<typeof View>>(null);
  const offset = useRef(0);
  const viewport = useRef(0);

  const setScroll = useCallback(
    (node: ScrollViewInstance | null) => {
      scroll.current = node;
      if (typeof scrollRef === 'function') scrollRef(node);
      else if (scrollRef) (scrollRef as { current: ScrollViewInstance | null }).current = node;
    },
    [scrollRef],
  );

  /** The element of the last reveal: revealed again once the content size has caught up. */
  const pending = useRef<unknown>(null);

  const revealNow = useCallback(
    (target: unknown) => {
      const t = target as Measurable | null;
      const sv = scroll.current;
      if (!t || !sv || !body.current || typeof t.measureLayout !== 'function') return;
      t.measureLayout(
        body.current,
        (_x, y, _w, h) => {
          // The offset is only learnt from scroll events: a scroll past the end is clamped, so
          // assuming it landed would hide that the element is still cut.
          const to = revealScrollY(y + contentPadding.top, h, offset.current, viewport.current);
          if (to !== null) sv.scrollTo({ y: to, animated: false });
        },
        () => {},
      );
    },
    [contentPadding.top],
  );

  const reveal = useCallback<Reveal>(
    (target) => {
      pending.current = { target, at: Date.now() };
      revealNow(target);
      // Once more after the frame, whatever order the layout and content size events came in.
      setTimeout(() => revealNow(target), REVEAL_RETRY_MS);
    },
    [revealNow],
  );

  // A panel that just appeared near the end can lay out before the scroll view knows the new
  // content height, and a scroll past the old end is clamped: reveal it again on the size change.
  const contentSizeChanged = useCallback(
    (w: number, h: number) => {
      const p = pending.current as { target: unknown; at: number } | null;
      pending.current = null;
      if (p && Date.now() - p.at < PENDING_MS) revealNow(p.target);
      onContentSizeChange?.(w, h);
    },
    [revealNow, onContentSizeChange],
  );

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={setScroll}
        style={style}
        contentContainerStyle={{
          paddingTop: contentPadding.top,
          paddingBottom: contentPadding.bottom,
          paddingLeft: contentPadding.left,
          paddingRight: contentPadding.right,
        }}
        keyboardShouldPersistTaps="handled"
        onLayout={(e: LayoutChangeEvent) => {
          viewport.current = e.nativeEvent.layout.height;
        }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
        onContentSizeChange={contentSizeChanged}
        testID={testID}
      >
        <View ref={body} style={[styles.body, { maxWidth }]}>
          {children}
        </View>
      </ScrollView>
    </RevealContext.Provider>
  );
}

/**
 * A scrolling screen inside the safe area (edge to edge: the app draws under the system bars and
 * keeps its content clear of them and of display cutouts in any orientation). Content grows
 * downwards only: rows wrap instead of scrolling sideways, so nothing is clipped at 360dp wide or
 * at 200% font scale. Content is centred and capped at the layout's width (720dp in one column,
 * wider for two panes). An optional footer stays pinned at the bottom (the compact battle's
 * choices); it scrolls by itself when it is taller than its share of the window.
 */
export interface ScreenProps {
  children: ReactNode;
  testID?: string;
  ref?: Ref<ScrollViewInstance>;
  /** Called after the content changed size. */
  onContentSizeChange?: (width: number, height: number) => void;
  /** Pinned below the scrolling content, above the navigation bar. */
  footer?: ReactNode;
  footerTestID?: string;
}

export function Screen({ children, testID, ref, onContentSizeChange, footer, footerTestID }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { maxContentWidth } = useLayout();
  const side = useMemo(() => ({ left: insets.left + 16, right: insets.right + 16 }), [insets.left, insets.right]);
  const mainPadding = useMemo(
    () => ({ top: PAD_TOP, bottom: footer ? 16 : insets.bottom + 32, ...side }),
    [footer, insets.bottom, side],
  );
  const footerPadding = useMemo(() => ({ top: 12, bottom: insets.bottom + 12, ...side }), [insets.bottom, side]);
  return (
    // The status bar area stays clear (content scrolls below it, never under the clock).
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <RevealScroll
        scrollRef={ref}
        style={styles.screen}
        contentPadding={mainPadding}
        maxWidth={maxContentWidth}
        onContentSizeChange={onContentSizeChange}
        testID={testID}
      >
        {children}
      </RevealScroll>
      {footer ? (
        <View
          style={[styles.footer, { maxHeight: Math.round(height * FOOTER_MAX_SHARE), borderColor: theme.border, backgroundColor: theme.surface }]}
          testID={footerTestID}
        >
          <RevealScroll contentPadding={footerPadding} maxWidth={maxContentWidth} style={styles.footerScroll}>
            {footer}
          </RevealScroll>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { gap: 16, width: '100%', alignSelf: 'center' },
  footer: { borderTopWidth: 2, flexShrink: 0 },
  footerScroll: { flexGrow: 0 },
});
