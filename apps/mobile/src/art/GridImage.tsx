// A still pixel grid (node icon, event vignette, the wordmark) drawn once into a Skia picture at a
// whole number of device pixels per cell, nearest-neighbour. Decorative unless `accessibilityLabel`
// is given (the logo is the only labelled art: an image named "Kinfall").
import type { PixelGrid } from '@kinfall/core/art/palette';
import { SkiaPictureView } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { PixelRatio, View, type StyleProp, type ViewStyle } from 'react-native';

import { artAvailable, drawImage, gridImage, recordPicture } from './skia';

export interface GridImageProps {
  grid: PixelGrid;
  /** Target size of one cell in dp; rounded to whole device pixels. */
  cellDp: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Device px per cell and the resulting box in dp. */
export function gridBox(grid: PixelGrid, cellDp: number, ratio = PixelRatio.get()): { cell: number; width: number; height: number } {
  const cell = Math.max(1, Math.round(cellDp * ratio));
  return { cell, width: (grid.width * cell) / ratio, height: (grid.height * cell) / ratio };
}

function GridImageImpl({ grid, cellDp, accessibilityLabel, style, testID }: GridImageProps) {
  const ratio = PixelRatio.get();
  const box = gridBox(grid, cellDp, ratio);
  const picture = useMemo(
    () =>
      recordPicture(box.width, box.height, (canvas) => {
        const img = gridImage(grid);
        if (img) drawImage(canvas, img, 0, 0, box.cell);
      }),
    [grid, box.width, box.height, box.cell],
  );
  const labelled = accessibilityLabel !== undefined && accessibilityLabel !== '';
  return (
    <View
      style={[{ width: box.width, height: box.height }, style]}
      pointerEvents="none"
      testID={testID}
      {...(labelled
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
        : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true })}
    >
      {artAvailable() && picture ? (
        <SkiaPictureView picture={picture} androidWarmup pointerEvents="none" style={{ width: box.width, height: box.height }} />
      ) : null}
    </View>
  );
}

export const GridImage = memo(GridImageImpl);
