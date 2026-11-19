import type { ElementId } from '@kinfall/core/content';
import { memo } from 'react';

import { PixelSprite } from './PixelSprite';
import { elementSprite } from './spriteData';

export interface ElementIconProps {
  element: ElementId;
  /** Integer pixel multiplier of the 8x8 icon (canvas is 8 * scale). */
  scale: number;
  accessibilityLabel?: string;
}

/** The 8x8 element icon in the element's palette. Decorative by default; the element name is text. */
export const ElementIcon = memo(function ElementIcon({ element, scale, accessibilityLabel }: ElementIconProps) {
  return <PixelSprite data={elementSprite(element)} scale={scale} accessibilityLabel={accessibilityLabel} testID={`element-${element}-${scale}`} />;
});
