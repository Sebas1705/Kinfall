import { Canvas, Rect } from '@shopify/react-native-skia';
import { memo } from 'react';
import { View } from 'react-native';

import type { SpriteData } from './spriteData';

export interface PixelSpriteProps {
  data: SpriteData;
  /** Integer pixel multiplier: one grid cell is `scale` x `scale` device-independent pixels. */
  scale: number;
  flip?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Draws sprite rects with Skia. Rect edges fall on whole multiples of `scale` and anti-aliasing is
 * off, so cells stay crisp. Decorative by default (the name is always in text next to the sprite);
 * pass `accessibilityLabel` to expose it as an image instead.
 */
function PixelSpriteImpl({ data, scale, flip, accessibilityLabel, testID }: PixelSpriteProps) {
  const s = Math.max(1, Math.round(scale));
  const px = data.size * s;
  const labelled = accessibilityLabel !== undefined && accessibilityLabel !== '';
  return (
    <View
      testID={testID}
      style={{ width: px, height: px, transform: flip ? [{ scaleX: -1 }] : undefined }}
      {...(labelled
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
        : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true })}
    >
      <Canvas style={{ width: px, height: px }} pointerEvents="none" androidWarmup>
        {data.rects.map((r, i) => (
          <Rect key={i} x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s} color={r.color} antiAlias={false} />
        ))}
      </Canvas>
    </View>
  );
}

export const PixelSprite = memo(PixelSpriteImpl);
