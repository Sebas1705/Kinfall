// Scene data caches: a zone scene is generated once per (zone, run seed) and its ambient life
// prepared once, so re-renders and screen changes never regenerate the ~81k-cell backdrop.
import { generateCreature } from '@kinfall/core/art/creatureGen';
import { elementIcon } from '@kinfall/core/art/elementIcon';
import type { PixelGrid } from '@kinfall/core/art/palette';
import {
  iconForNodeType,
  nodeIcon,
  prepareAmbient,
  sceneForZone,
  type NodeIconKind,
  type PreparedAmbient,
  type ZoneScene,
} from '@kinfall/core/art/scene';
import type { ElementId } from '@kinfall/core/content';
import type { NodeType } from '@kinfall/core/sim/run/types';

import { resolveSpecies } from './spriteData';

export interface CachedScene {
  scene: ZoneScene;
  ambient: PreparedAmbient;
}

const scenes = new Map<string, CachedScene>();
/** Most scenes kept at once (a run visits three zones; the title adds one). */
export const SCENE_CACHE_SIZE = 4;

export function cachedScene(zone: number, seed: string): CachedScene {
  const key = `${zone}|${seed}`;
  let hit = scenes.get(key);
  if (hit) {
    // Most recently used last.
    scenes.delete(key);
    scenes.set(key, hit);
    return hit;
  }
  const scene = sceneForZone(zone, seed);
  hit = { scene, ambient: prepareAmbient(scene.ambient, scene.seed) };
  if (scenes.size >= SCENE_CACHE_SIZE) scenes.delete(scenes.keys().next().value!);
  scenes.set(key, hit);
  return hit;
}

/** Number of cached scenes (tests). */
export function cachedSceneCount(): number {
  return scenes.size;
}

const elements = new Map<ElementId, PixelGrid>();
/** The 8x8 element icon grid, generated once. */
export function elementGrid(element: ElementId): PixelGrid {
  let g = elements.get(element);
  if (!g) {
    g = elementIcon(element);
    elements.set(element, g);
  }
  return g;
}

const icons = new Map<NodeIconKind, PixelGrid>();
/** The 16x16 map icon of a node type, generated once. */
export function nodeIconGrid(type: NodeType): PixelGrid {
  const kind = iconForNodeType(type);
  let g = icons.get(kind);
  if (!g) {
    g = nodeIcon(kind);
    icons.set(kind, g);
  }
  return g;
}

const creatures = new Map<string, PixelGrid>();
/** The 24x24 grid of a species, generated once. */
export function creatureGrid(speciesId: string): PixelGrid {
  let g = creatures.get(speciesId);
  if (!g) {
    g = generateCreature(resolveSpecies(speciesId));
    creatures.set(speciesId, g);
  }
  return g;
}
