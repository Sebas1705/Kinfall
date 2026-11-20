// Builds the art golden snapshot (packages/core/tests/golden/art.golden.json): a hash of every
// generated scene asset for fixed seeds. Shared by the art golden test and the update script
// (npm run golden:art). It is separate from the battle and run goldens: art never moves those.
import type { PixelGrid } from '../../src/art/palette';
import {
  BUTTON_STATES,
  EFFECT_IDS,
  FLOATING_NUMBER_KINDS,
  NODE_ICON_KINDS,
  VIGNETTE_KINDS,
  ZONE_IDS,
  ambientFor,
  barStyle,
  buttonFrame,
  effectFor,
  eventVignette,
  floatingNumberStyle,
  nodeIcon,
  particleSprites,
  plateFrame,
  prepareAmbient,
  prepareEffect,
  sampleAmbient,
  sampleEffect,
  sceneForZone,
  stageAnchors,
  wordmark,
} from '../../src/art/scene';
import { fnv1a64 } from '../../src/sim/codec';

export const ART_GOLDEN_SEEDS = ['golden-art', 'kinfall-1'] as const;

export interface ArtGolden {
  version: 1;
  seeds: readonly string[];
  hashes: Record<string, string>;
}

export function gridKey(g: PixelGrid): string {
  return `${g.width}x${g.height}|${g.palette.join(',')}|${Array.from(g.pixels).join('')}`;
}

const hash = (text: string): string => fnv1a64(text);

export function artSnapshot(): ArtGolden {
  const hashes: Record<string, string> = {};
  for (const seed of ART_GOLDEN_SEEDS) {
    for (const zone of ZONE_IDS) {
      const sc = sceneForZone(zone, seed);
      for (const layer of sc.backdrop.layers) {
        hashes[`backdrop.${zone}.${seed}.${layer.id}`] = hash(`${layer.x},${layer.y},${layer.parallax},${layer.tileX},${layer.depth},${layer.driftPxPerSec}|${gridKey(layer.grid)}`);
      }
      for (const side of ['player', 'enemy'] as const) {
        const p = sc.platforms[side];
        hashes[`platform.${zone}.${seed}.${side}`] = hash(`${p.anchor.x},${p.anchor.y}|${gridKey(p.grid)}|${gridKey(p.shadow)}`);
      }
      const amb = prepareAmbient(ambientFor(zone), seed);
      hashes[`ambient.${zone}.${seed}`] = hash(JSON.stringify([0, 1234, 5678].map((t) => sampleAmbient(amb, t, false))));
      for (const kind of VIGNETTE_KINDS) hashes[`vignette.${kind}.${zone}.${seed}`] = hash(gridKey(eventVignette(kind, zone, seed)));
    }
    const a = stageAnchors('enemy');
    const s = stageAnchors('player');
    for (const id of EFFECT_IDS) {
      const prepared = prepareEffect(effectFor(id), seed);
      const frames = [0, 150, 300, 600, 1000].map((tMs) =>
        sampleEffect(prepared, { tMs, target: a.centre, ground: a.feet, source: s.centre, facing: s.facing, reducedMotion: false }),
      );
      hashes[`effect.${id}.${seed}`] = hash(JSON.stringify(frames));
    }
  }
  for (const id of EFFECT_IDS) hashes[`effect.${id}.descriptor`] = hash(JSON.stringify(effectFor(id)));
  for (const kind of NODE_ICON_KINDS) hashes[`icon.${kind}`] = hash(gridKey(nodeIcon(kind)));
  for (const [id, grid] of Object.entries(particleSprites())) hashes[`sprite.${id}`] = hash(gridKey(grid));
  hashes.logo = hash(gridKey(wordmark().grid));
  for (const theme of ['dusk', 'parchment'] as const) {
    for (const zone of ZONE_IDS) {
      hashes[`frame.plate.${theme}.${zone}`] = hash(JSON.stringify({ ...plateFrame({ theme, zone }), grid: gridKey(plateFrame({ theme, zone }).grid) }));
      for (const state of BUTTON_STATES) {
        const b = buttonFrame(state, { theme, zone });
        hashes[`frame.button.${state}.${theme}.${zone}`] = hash(JSON.stringify({ ...b, grid: gridKey(b.grid) }));
      }
    }
    for (const kind of ['hp', 'focus'] as const) {
      const b = barStyle(kind, { theme });
      hashes[`frame.bar.${kind}.${theme}`] = hash(JSON.stringify({ ...b, frame: { ...b.frame, grid: gridKey(b.frame.grid) } }));
    }
  }
  for (const kind of FLOATING_NUMBER_KINDS) hashes[`number.${kind}`] = hash(JSON.stringify(floatingNumberStyle(kind)));
  return { version: 1, seeds: ART_GOLDEN_SEEDS, hashes };
}
