// Modal sheet of the console layout: a bottom sheet in portrait and a side drawer (right) in
// landscape, chosen by the orientation of `useLayoutSpec`. It is an absolutely positioned view above
// the screen, not a RN `Modal`: a Modal is its own window, which would cut the screen (and its polite
// live region) off from the announcements while the sheet is open. The caller hides what is behind
// it from screen readers with `useSheetBackdropProps` on the screen's root view (a sibling of the
// sheet, never its parent). Android back closes it, focus moves to the title on open and back to
// `openerRef` on close, and there is no slide when reduce motion is on.
import { t } from '@kinfall/core/platform/i18n';
import type { ScreenId } from '@kinfall/core/layout/spec';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useLang } from '../platform/LangContext';
import { useReducedMotion } from '../platform/motionSetting';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { useLayoutSpec } from './useLayoutSpec';

/** The tallest the bottom sheet gets, as a share of the window height. */
export const SHEET_MAX_SHARE = 0.8;
/** Width of the side drawer as a share of the window width, capped at DRAWER_MAX dp. */
export const DRAWER_SHARE = 0.5;
export const DRAWER_MAX = 480;
const SLIDE_MS = 200;

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Only used to read the orientation from the layout contract; 'battle' when omitted. */
  screen?: ScreenId;
  /** The control that opened the sheet; it gets the focus back on close. */
  openerRef?: RefObject<unknown>;
  testID?: string;
}

/** Props for the screen's root view: hides everything behind the sheet from screen readers while it is open. */
export function useSheetBackdropProps(visible: boolean): {
  importantForAccessibility: 'auto' | 'no-hide-descendants';
  accessibilityElementsHidden: boolean;
} {
  return {
    importantForAccessibility: visible ? 'no-hide-descendants' : 'auto',
    accessibilityElementsHidden: visible,
  };
}

function focusOn(target: unknown): void {
  if (target) AccessibilityInfo.sendAccessibilityEvent(target as never, 'focus');
}

export function Sheet({ visible, onClose, title, children, screen = 'battle', openerRef, testID = 'sheet' }: SheetProps) {
  useLang();
  const theme = useTheme();
  const { orientation } = useLayoutSpec(screen);
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const titleRef = useRef<ComponentRef<typeof AppText>>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const wasVisible = useRef(false);
  const [mounted, setMounted] = useState(visible);

  // Hardware back only while open.
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Open: mount, slide in (or appear at once), focus the title. Close: slide out, then unmount.
  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduceMotion) slide.setValue(1);
      else Animated.timing(slide, { toValue: 1, duration: SLIDE_MS, useNativeDriver: true }).start();
      focusOn(titleRef.current);
    } else if (wasVisible.current) {
      if (reduceMotion) {
        slide.setValue(0);
        setMounted(false);
      } else {
        Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }).start(() => setMounted(false));
      }
      focusOn(openerRef?.current);
    }
    wasVisible.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reduceMotion changing mid-open must not replay the slide
  }, [visible]);

  if (!visible && !mounted) return null;

  const landscape = orientation === 'landscape';
  const drawerWidth = Math.min(DRAWER_MAX, Math.round(width * DRAWER_SHARE));
  const offscreen = landscape ? drawerWidth : height;
  const translate = slide.interpolate({ inputRange: [0, 1], outputRange: [offscreen, 0] });
  const panelStyle = landscape
    ? [styles.drawer, { width: drawerWidth, transform: [{ translateX: translate }] }]
    : [styles.bottom, { maxHeight: Math.round(height * SHEET_MAX_SHARE), transform: [{ translateY: translate }] }];

  return (
    <View
      style={[StyleSheet.absoluteFill, landscape ? styles.rowEnd : styles.colEnd]}
      pointerEvents="box-none"
      testID={`${testID}-root`}
      {...(Platform.OS === 'ios' ? { accessibilityViewIsModal: true } : {})}
    >
      {/* Tap outside closes; the Close button is the accessible way, so the scrim is hidden from readers. */}
      <Pressable
        style={[StyleSheet.absoluteFill, styles.scrim]}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        testID={`${testID}-scrim`}
      />
      <Animated.View
        style={[panelStyle, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityViewIsModal
        testID={testID}
      >
        <AppText ref={titleRef} accessible accessibilityRole="header" style={[styles.title, { color: theme.text }]} testID={`${testID}-title`}>
          {title}
        </AppText>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} testID={`${testID}-body`}>
          {children}
        </ScrollView>
        <Button label={t('sheet.close')} onPress={onClose} testID={`${testID}-close`} style={styles.close} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.55)' },
  colEnd: { justifyContent: 'flex-end' },
  rowEnd: { flexDirection: 'row', justifyContent: 'flex-end' },
  bottom: { borderTopWidth: 2, padding: 16, gap: 12 },
  drawer: { borderLeftWidth: 2, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { flexShrink: 1 },
  bodyContent: { gap: 8 },
  close: { minHeight: 48, alignSelf: 'stretch' },
});
