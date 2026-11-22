// React Native `Text` that follows the app's own text size (the setting multiplies the system font
// scale, see effectiveTextScale in core): numeric fontSize and lineHeight are multiplied by the
// setting, and the system scaling is capped so that system x app never passes 2.0. Everything else,
// including the ref, goes through to `Text` unchanged.
import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { MAX_FONT_SIZE_MULTIPLIER, useTextSize } from '../platform/textSizeSetting';

export const AppText = forwardRef<ComponentRef<typeof Text>, TextProps>(function AppText(
  { style, maxFontSizeMultiplier, ...rest },
  ref,
) {
  const percent = useTextSize();
  let scaled = style;
  if (percent !== 100) {
    const flat = StyleSheet.flatten(style) ?? {};
    const next = { ...flat };
    if (typeof flat.fontSize === 'number') next.fontSize = flat.fontSize * (percent / 100);
    if (typeof flat.lineHeight === 'number') next.lineHeight = flat.lineHeight * (percent / 100);
    scaled = next;
  }
  return <Text ref={ref} style={scaled} maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SIZE_MULTIPLIER} {...rest} />;
});
