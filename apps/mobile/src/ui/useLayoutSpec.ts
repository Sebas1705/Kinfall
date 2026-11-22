// The console layout contract for the current window: size, system font scale and the app's own
// text size go through core's pure layoutSpec. Re-renders on rotation, resize and either scale.
import { effectiveTextScale, layoutSpec, type LayoutSpec, type ScreenId } from '@kinfall/core/layout/spec';
import { useWindowDimensions } from 'react-native';

import { useTextSize } from '../platform/textSizeSetting';

export function useLayoutSpec(screen: ScreenId): LayoutSpec {
  const { width, height, fontScale } = useWindowDimensions();
  const appSize = useTextSize();
  return layoutSpec({ width, height, textScale: effectiveTextScale(fontScale, appSize / 100) }, screen);
}
