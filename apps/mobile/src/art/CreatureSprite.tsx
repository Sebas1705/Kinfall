import type { SpeciesDef } from '@webgames/core/content';
import { memo, useMemo } from 'react';

import { PixelSprite } from './PixelSprite';
import { creatureSprite, resolveSpecies } from './spriteData';

export interface CreatureSpriteProps {
  species: SpeciesDef | string;
  /** Integer pixel multiplier of the 24x24 sprite (canvas is 24 * scale). */
  scale: number;
  flip?: boolean;
  /** Omit for the usual decorative sprite; the species name is shown as text beside it. */
  accessibilityLabel?: string;
}

/** The generated creature art of a species, drawn with Skia. Hidden from screen readers by default. */
export const CreatureSprite = memo(function CreatureSprite({ species, scale, flip, accessibilityLabel }: CreatureSpriteProps) {
  const id = typeof species === 'string' ? species : species.id;
  const data = useMemo(() => creatureSprite(resolveSpecies(species)), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PixelSprite data={data} scale={scale} flip={flip} accessibilityLabel={accessibilityLabel} testID={`sprite-${id}-${scale}`} />
  );
});
