import { generateCreature } from '@kinfall/core/art/creatureGen';
import { elementIcon } from '@kinfall/core/art/elementIcon';
import { gridToRects, type PixelRect } from '@kinfall/core/art/gridToRects';
import { CONTENT, type ElementId, type SpeciesDef } from '@kinfall/core/content';

/** Sprite as draw rectangles, in grid cells, plus the grid size. */
export interface SpriteData {
  size: number;
  rects: PixelRect[];
}

// Generation is pure and fixed per species (or element), so each result is computed once per app
// run and shared by every sprite on screen (the gallery draws the same species at three scales).
const creatureCache = new Map<string, SpriteData>();
const elementCache = new Map<ElementId, SpriteData>();

/** Resolves a species given as a definition or an id; throws on an unknown id. */
export function resolveSpecies(species: SpeciesDef | string): SpeciesDef {
  if (typeof species !== 'string') return species;
  const found = CONTENT.species.find((s) => s.id === species);
  if (!found) throw new Error(`Unknown species: ${species}`);
  return found;
}

export function creatureSprite(species: SpeciesDef): SpriteData {
  let data = creatureCache.get(species.id);
  if (!data) {
    const grid = generateCreature(species);
    data = { size: grid.width, rects: gridToRects(grid) };
    creatureCache.set(species.id, data);
  }
  return data;
}

export function elementSprite(element: ElementId): SpriteData {
  let data = elementCache.get(element);
  if (!data) {
    const grid = elementIcon(element);
    data = { size: grid.width, rects: gridToRects(grid) };
    elementCache.set(element, data);
  }
  return data;
}
