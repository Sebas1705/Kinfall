// Creature portrait for the DOM screens: the same generated pixel art as the battle scene.
import { generateCreature } from '@kinfall/core/art/creatureGen';
import type { SpeciesDef } from '@kinfall/core/content';
import { paintGrid } from '../pixelCanvas';
import { el } from './dom';

/** A decorative canvas (`aria-hidden`): the species name is always given as text next to it. */
export function creatureCanvas(species: SpeciesDef, className: string): HTMLCanvasElement {
  const canvas = el('canvas', { class: className, 'aria-hidden': 'true' });
  paintGrid(canvas, generateCreature(species));
  return canvas;
}
