import type { ScreenId } from '@kinfall/core/layout/spec';
import { createContext, useCallback, useContext, useRef, type ComponentRef, type ReactNode, type Ref } from 'react';
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
import { useLayoutSpec } from './useLayoutSpec';

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
/** Largest share of the window height the pinned HUD may take in the fallback; it scrolls inside beyond that. */
export const HUD_MAX_SHARE = 0.2;

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
 * The screen shell of the console layout, inside the safe area (edge to edge: the app draws under the
 * system bars and keeps its content clear of them and of display cutouts in any orientation).
 * Console mode (the window fits the screen's budget in core's layout contract): fixed regions without
 * any page scroll, HUD on top, then the primary region with the actions rail beside it (landscape)
 * or below it (portrait, with a one or two line info band between). Fallback mode (200% text, tiny
 * windows): the HUD and the actions stay pinned, each capped, and only the primary region scrolls.
 *
 * Known limitation: the layout contract does not know the safe-area insets (its regions come from
 * the raw window size), and the root is padded by the insets, so on a notched landscape phone the
 * primary region can be smaller than the contract promises. To be checked on a device.
 */
export interface ScreenProps {
  /** The primary region's content (or give `primary`). */
  children?: ReactNode;
  testID?: string;
  ref?: Ref<ScrollViewInstance>;
  /** Called after the content changed size. */
  onContentSizeChange?: (width: number, height: number) => void;
  /** Which screen this is: its budget decides console or fallback (core's layoutSpec). */
  screen: ScreenId;
  /** The top bar (a Hud). */
  hud?: ReactNode;
  /** The primary region; the children when omitted. */
  primary?: ReactNode;
  /** The actions rail (landscape) or band (portrait). */
  actions?: ReactNode;
  /** The info line under the primary region (portrait only). */
  info?: ReactNode;
  /** Landscape: a rail wider than the contract's (the event's choices), in dp. */
  actionsWidth?: number;
  /**
   * Props for every pinned region and the primary content, hiding them from screen
   * readers while a sheet is open (`useSheetBackdropProps`). They go on the regions, not on the root,
   * so that the overlay stays outside the hidden part.
   */
  backdrop?: BackdropProps;
  /**
   * A live message line that must keep announcing while a sheet is open. It floats over
   * the bottom edge of the primary region (in portrait it takes the info line's place, which is
   * reserved for it); in the fallback it is a strip between the scrolling primary region and the
   * actions. Never hidden by `backdrop`.
   */
  overlay?: ReactNode;
}

/** The accessibility props `useSheetBackdropProps` returns. */
export interface BackdropProps {
  importantForAccessibility: 'auto' | 'no-hide-descendants';
  accessibilityElementsHidden: boolean;
}

export function Screen({ screen, children, testID, ref, hud, primary, actions, info, actionsWidth, backdrop, overlay, onContentSizeChange }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const spec = useLayoutSpec(screen);
  const { regions } = spec;
  const landscape = spec.orientation === 'landscape';
  const main = primary ?? children;
  const infoLine = landscape ? null : (info ?? (overlay ? <View /> : null));
  const hidden = backdrop ?? {};
  // The insets eat from the primary region (it is the flexible one); the rest keeps its planned size.
  const pad = { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right };
  const column = [styles.shellColumn, { width: regions.content.width }];

  if (spec.mode === 'console') {
    const actionsStyle = landscape ? { width: actionsWidth ?? regions.actions.width } : { height: regions.actions.height };
    return (
      <View style={[styles.screen, styles.shellRoot, pad, { backgroundColor: theme.bg }]} testID={testID}>
        <View style={column}>
          <View style={{ height: regions.hud.height }} {...hidden}>
            {hud}
          </View>
          <View style={landscape ? styles.shellRow : styles.shellColumnFill}>
            <View style={styles.shellFlex} testID={testID ? `${testID}-primary` : undefined}>
              <View style={styles.shellFlex} {...hidden}>
                {main}
              </View>
              {infoLine ? (
                <View style={{ height: regions.info?.height ?? 0 }} {...hidden}>
                  {infoLine}
                </View>
              ) : null}
              {overlay ? (
                <View
                  style={[styles.overlay, landscape ? null : { height: regions.info?.height ?? 0 }]}
                  pointerEvents="box-none"
                  testID={testID ? `${testID}-overlay` : undefined}
                >
                  {overlay}
                </View>
              ) : null}
            </View>
            <View style={[styles.shellActions, actionsStyle]} testID={testID ? `${testID}-actions` : undefined} {...hidden}>
              {actions}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Fallback: HUD and actions stay pinned outside the primary scroll area, each capped (HUD_MAX_SHARE
  // and FOOTER_MAX_SHARE of the window, scrolling inside beyond that) so the primary region keeps at
  // least a quarter of the window; the primary region and the info line scroll.
  const side = { left: 16, right: 16 };
  return (
    <View style={[styles.screen, styles.shellRoot, pad, { backgroundColor: theme.bg }]} testID={testID}>
      <View style={column}>
        {hud ? (
          <View style={{ maxHeight: Math.round(height * HUD_MAX_SHARE), flexShrink: 0 }} {...hidden}>
            <RevealScroll contentPadding={{ top: 0, bottom: 0, left: 0, right: 0 }} maxWidth={regions.content.width} style={styles.footerScroll}>
              {hud}
            </RevealScroll>
          </View>
        ) : null}
        <View style={styles.screen} {...hidden}>
          <RevealScroll
            scrollRef={ref}
            style={styles.screen}
            contentPadding={{ top: PAD_TOP, bottom: 16, ...side }}
            maxWidth={regions.content.width}
            onContentSizeChange={onContentSizeChange}
            testID={testID ? `${testID}-scroll` : undefined}
          >
            {main}
            {landscape ? null : info}
          </RevealScroll>
        </View>
        {overlay ? (
          <View style={styles.strip} testID={testID ? `${testID}-overlay` : undefined}>
            {overlay}
          </View>
        ) : null}
        {actions ? (
          <View
            style={[styles.footer, { maxHeight: Math.round(height * FOOTER_MAX_SHARE), borderColor: theme.border, backgroundColor: theme.surface }]}
            {...hidden}
          >
            <RevealScroll contentPadding={{ top: 12, bottom: 12, ...side }} maxWidth={regions.content.width} style={styles.footerScroll}>
              {actions}
            </RevealScroll>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  shellRoot: { alignItems: 'center' },
  shellColumn: { flex: 1, maxWidth: '100%' },
  shellColumnFill: { flex: 1, minHeight: 0 },
  shellRow: { flex: 1, flexDirection: 'row', minHeight: 0 },
  shellFlex: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' },
  shellActions: { flexShrink: 0, overflow: 'hidden' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  strip: { flexShrink: 0 },
  body: { gap: 16, width: '100%', alignSelf: 'center' },
  footer: { borderTopWidth: 2, flexShrink: 0 },
  footerScroll: { flexGrow: 0 },
});
