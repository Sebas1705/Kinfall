// HP and Focus bars in the scene art's pixel style (barStyle: an outlined track with a lit inner
// rim, the fill with a bright top row, HP ticks every 25%), built from plain views at whole frame
// cells. The value is always written next to the bar in text; the bar is hidden from screen readers.
import { barFill } from '@kinfall/core/art/scene';
import { Animated, StyleSheet, View } from 'react-native';

import { barOf, frameCell, useFrameStyle } from './frames';

export interface PixelBarProps {
  kind: 'hp' | 'focus';
  value: number;
  max: number;
  /** Animated fill ratio 0..1 (the battle tweens it); defaults to value / max. */
  progress?: Animated.Value;
  testID?: string;
}

export function PixelBar({ kind, value, max, progress, testID }: PixelBarProps) {
  const { theme, zone } = useFrameStyle();
  const style = barOf(kind, theme, zone);
  const cell = frameCell().dp;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const pal = style.frame.grid.palette;
  const outline = pal[1] ?? '#000000';
  const rim = pal[3] ?? '#ffffff';
  const fill = barFill(style, Math.round(ratio * 100));
  const ticks = style.tickEvery > 0 ? Array.from({ length: Math.floor(100 / style.tickEvery) - 1 }, (_, i) => (i + 1) * style.tickEvery) : [];
  return (
    <View
      style={[styles.outer, { backgroundColor: outline, padding: cell, borderRadius: cell }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID={testID}
    >
      <View style={{ backgroundColor: rim, padding: cell }}>
        <View style={[styles.track, { backgroundColor: style.track, height: cell * 3 }]}>
          <Animated.View style={[styles.fill, { backgroundColor: fill, transform: [{ scaleX: progress ?? ratio }] }]}>
            <View style={{ height: cell, backgroundColor: style.shine }} />
          </Animated.View>
          {ticks.map((p) => (
            <View key={p} style={[styles.tick, { left: `${p}%`, width: cell, backgroundColor: outline }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { alignSelf: 'stretch' },
  track: { overflow: 'hidden', position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transformOrigin: 'left' },
  tick: { position: 'absolute', top: 0, bottom: 0 },
});
