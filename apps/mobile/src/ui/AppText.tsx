// React Native `Text` that follows the app's own text size (the setting multiplies the system font
// scale, see effectiveTextScale in core): numeric fontSize and lineHeight are multiplied by the
// setting in JS, then React Native applies the system font scale on top. To keep system x app within
// 2.0 (the cap the layout contract assumes), the default maxFontSizeMultiplier is 2 / (setting / 100),
// so the system part is capped at 2 at 100%, about 1.33 at 150% and 2.5 at 80%. A caller can pass its
// own. Everything else, including the ref, goes through to `Text` unchanged.
import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { MAX_FONT_SIZE_MULTIPLIER, useTextSize } from '../platform/textSizeSetting';

/** `style` with its numeric fontSize and lineHeight multiplied by the app's text size (percent); other text components (a TextInput) use it too. */
export function scaleTextStyle(style: StyleProp<TextStyle>, percent: number): StyleProp<TextStyle> {
  if (percent === 100) return style;
  const flat = StyleSheet.flatten(style) ?? {};
  const next = { ...flat };
  if (typeof flat.fontSize === 'number') next.fontSize = flat.fontSize * (percent / 100);
  if (typeof flat.lineHeight === 'number') next.lineHeight = flat.lineHeight * (percent / 100);
  return next;
}

export const AppText = forwardRef<ComponentRef<typeof Text>, TextProps>(function AppText(
  { style, maxFontSizeMultiplier, ...rest },
  ref,
) {
  const percent = useTextSize();
  const scaled = scaleTextStyle(style, percent);
  return <Text ref={ref} style={scaled} maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SIZE_MULTIPLIER / (percent / 100)} {...rest} />;
});
