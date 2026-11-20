// React Native surfaces dressed in the pixel nine-slice frames: `FrameBackground` draws a frame
// (Skia picture, whole device pixels per cell, nearest-neighbour) behind its parent's content,
// `Plate` is a framed panel, `FramePressable` a framed touch target with pressed, focused and
// disabled states. All text stays real React Native text on top; the frames are hidden from
// screen readers and never take touches. Each surface also gets the frame's body colour as its
// background, so the text has its contrast pair even before the picture is drawn.
import type { PixelGrid } from '@kinfall/core/art/palette';
import type { ButtonState, NineSlice } from '@kinfall/core/art/scene';
import { SkiaPictureView } from '@shopify/react-native-skia';
import { memo, useMemo, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { UI_PALETTES } from '@kinfall/core/art/scene';
import { alphaPaint, artAvailable, drawImage, drawNineSlice, gridImage, recordPicture } from '../art/skia';
import { TOUCH } from '../theme';
import { buttonOf, frameCell, plateOf, useFrameStyle } from './frames';

export interface FrameIcon {
  grid: PixelGrid;
  /** Target size of one icon cell in dp (rounded to whole device pixels). */
  cellDp: number;
  /** Icon opacity (dimmed on locked map nodes). */
  alpha?: number;
}

interface BackgroundProps {
  frame: NineSlice;
  /** Frame cells drawn outside the box (the focus ring), so focus never moves the layout. */
  outset?: number;
  /** A pixel icon drawn in the same picture, at the content's left edge, vertically centred. */
  icon?: FrameIcon | null;
  /** Left padding of the content in dp (where the icon goes). */
  iconLeft?: number;
  testID?: string;
}

/** The frame picture behind a surface. */
export const FrameBackground = memo(function FrameBackground({ frame, outset = 0, icon, iconLeft = 0, testID }: BackgroundProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const ratio = PixelRatio.get();
  const cell = frameCell(ratio);
  const out = outset * cell.dp;
  const picture = useMemo(() => {
    if (!size) return null;
    return recordPicture(size.w, size.h, (canvas, pw, ph) => {
      drawNineSlice(canvas, frame, pw, ph, cell.px);
      if (icon) {
        const img = gridImage(icon.grid);
        if (img) {
          const s = Math.max(1, Math.round(icon.cellDp * ratio));
          const x = Math.round((iconLeft + out) * ratio);
          const y = Math.round((ph - icon.grid.height * s) / 2);
          drawImage(canvas, img, x, y, s, icon.alpha !== undefined && icon.alpha < 1 ? alphaPaint(icon.alpha) : null);
        }
      }
    });
  }, [size, frame, cell.px, icon, iconLeft, out, ratio]);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) >= 0.5 || Math.abs(size.h - height) >= 0.5) setSize({ w: width, h: height });
  };
  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID={testID}
      style={[StyleSheet.absoluteFill, out ?{ top: -out, left: -out, right: -out, bottom: -out } : null]}
    >
      {artAvailable() && picture && size ? (
        <SkiaPictureView picture={picture} androidWarmup pointerEvents="none" style={{ width: size.w, height: size.h }} />
      ) : null}
    </View>
  );
});

/** Width in dp of a frame icon (whole device pixels per cell). */
export function iconBox(icon: FrameIcon, ratio = PixelRatio.get()): number {
  return (icon.grid.width * Math.max(1, Math.round(icon.cellDp * ratio))) / ratio;
}

/** Body colour of a frame (its centre cell), used as the surface background. */
export function frameBody(frame: NineSlice): string {
  const g = frame.grid;
  const idx = g.pixels[Math.floor(g.height / 2) * g.width + Math.floor(g.width / 2)] ?? 0;
  return (g.palette[idx] ?? '#00000000').slice(0, 7);
}

/** Content padding of a frame in dp, plus extra breathing room. */
export function framePadding(frame: NineSlice, extraX = 0, extraY = 0): ViewStyle {
  const { dp } = frameCell();
  return {
    paddingLeft: frame.content.left * dp + extraX,
    paddingRight: frame.content.right * dp + extraX,
    paddingTop: frame.content.top * dp + extraY,
    paddingBottom: frame.content.bottom * dp + extraY,
  };
}

export interface PlateProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  /** Extra inner padding in dp (default 4). */
  pad?: number;
  ref?: Ref<ComponentRef<typeof View>>;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/** A framed panel (the HUD plate). Its text colour is `usePlateText()`. */
export function Plate({ children, style, testID, accessible, accessibilityLabel, pad = 4, ref, onLayout }: PlateProps) {
  const { theme, zone } = useFrameStyle();
  const frame = plateOf(theme, zone);
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      style={[styles.surface, { backgroundColor: frameBody(frame), borderRadius: frameCell().dp }, framePadding(frame, pad, pad), style]}
      testID={testID}
      {...(accessible ? { accessible: true, accessibilityLabel } : {})}
    >
      <FrameBackground frame={frame} />
      {children}
    </View>
  );
}

/** Text colours on plates for the current theme. */
export function usePlateText(): { text: string; muted: string } {
  const { theme } = useFrameStyle();
  const ui = UI_PALETTES[theme];
  return { text: ui.text, muted: ui.textMuted };
}

export type FrameKind = 'button' | 'plate';

export interface FramePressableProps {
  children: ReactNode | ((state: { pressed: boolean; disabled: boolean; textColor: string }) => ReactNode);
  onPress?: () => void;
  disabled?: boolean;
  /** 'plate' dresses the main action (or the selected / current item) in the ornate plate. */
  kind?: FrameKind;
  style?: StyleProp<ViewStyle>;
  icon?: FrameIcon | null;
  /** testID of the frame picture that carries the icon (tests find the icon by it). */
  iconTestID?: string;
  testID?: string;
  ref?: Ref<ComponentRef<typeof View>>;
  accessibilityRole?: 'button' | 'radio' | 'link' | 'switch' | 'checkbox';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { disabled?: boolean; checked?: boolean; selected?: boolean; busy?: boolean };
  /** Extra padding in dp inside the frame's content inset. */
  padX?: number;
  padY?: number;
}

/**
 * A framed touch target, at least 48dp each way. Normal = raised button (or the plate), pressed
 * sinks (shade on top, content one cell lower), disabled is flat, and keyboard / D-pad focus adds
 * the focus ring outside the box. The press feedback follows the frame's shape.
 */
export function FramePressable({
  children,
  onPress,
  disabled = false,
  kind = 'button',
  style,
  icon,
  iconTestID,
  testID,
  ref,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  padX = 6,
  padY = 4,
}: FramePressableProps) {
  const { theme, zone } = useFrameStyle();
  const [focused, setFocused] = useState(false);
  const cell = frameCell();
  const frameFor = (pressed: boolean): { frame: NineSlice; state: ButtonState | 'plate' } => {
    if (disabled) return { frame: buttonOf('disabled', theme, zone), state: 'disabled' };
    if (pressed) return { frame: buttonOf('pressed', theme, zone), state: 'pressed' };
    if (kind === 'plate') return { frame: plateOf(theme, zone), state: 'plate' };
    return { frame: buttonOf('normal', theme, zone), state: 'normal' };
  };
  // Layout uses the normal button's insets in every state, so pressing never resizes anything.
  const base = buttonOf('normal', theme, zone);
  const iconWidth = icon ? iconBox(icon) : 0;
  const padLeft = base.content.left * cell.dp + padX;
  return (
    <Pressable
      ref={ref}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      testID={testID}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.surface,
        styles.pressable,
        {
          backgroundColor: frameBody(frameFor(pressed).frame),
          borderRadius: cell.dp,
          paddingLeft: padLeft + (icon ? iconWidth + 10 : 0),
          paddingRight: base.content.right * cell.dp + padX,
          paddingTop: base.content.top * cell.dp + padY,
          paddingBottom: base.content.bottom * cell.dp + padY,
        },
        style,
      ]}
    >
      {({ pressed }: PressableStateCallbackType) => {
        const { frame } = frameFor(pressed);
        const textColor = frame.textColor;
        // Focused (keyboard, D-pad): the focus frame is the raised button plus its ring, drawn
        // 3 cells outside the box.
        const ring = focused && !disabled && !pressed;
        return (
          <>
            <FrameBackground frame={ring ? buttonOf('focused', theme, zone) : frame} outset={ring ? 3 : 0} icon={icon ?? null} iconLeft={padLeft} testID={icon ? iconTestID : undefined} />
            <View style={pressed && !disabled ? { transform: [{ translateY: cell.dp }] } : null}>
              {typeof children === 'function' ? children({ pressed, disabled, textColor }) : children}
            </View>
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: { position: 'relative' },
  pressable: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center' },
});
