// Ground platforms: the little floating-earth disc each creature stands on, with a soft pixel
// shadow, plus the stage layout (where each side stands in the 256x144 scene).
import type { PixelGrid } from '../palette';
import { cosmeticRng } from './cosmeticRng';
import { cos, PI, round, sin, sqrt } from './fixedMath';
import { Grid } from './grid';
import { ZONE_PALETTES, type ZoneId } from './palettes';

export type PlatformSize = 'near' | 'far';

export interface GroundPlatform {
  grid: PixelGrid;
  /** Where the creature's feet go, in grid cells from the platform's top-left. */
  anchor: { x: number; y: number };
  /** Soft shadow drawn on the platform, centred on `anchor`, before the creature. */
  shadow: PixelGrid;
}

/**
 * Stage layout in scene pixels: the feet point of each side and the sprite scale. Creatures
 * (24x24 grids) are drawn at `spriteScale` art pixels per sprite cell, bottom-centred on the
 * feet point; the player's side faces right (mirror the sprite), the enemy faces left.
 */
export const STAGE = {
  player: { x: 70, y: 122, platform: 'near' as PlatformSize },
  enemy: { x: 188, y: 100, platform: 'far' as PlatformSize },
  spriteScale: 2,
} as const;

const WIDTH: Record<PlatformSize, number> = { near: 76, far: 60 };

export interface StageAnchors {
  /** Feet point (bottom-centre of the sprite) in scene px. */
  feet: { x: number; y: number };
  /** Visual centre of a 24x24 creature drawn at `STAGE.spriteScale`. */
  centre: { x: number; y: number };
  /** +1 when this side attacks towards the right. */
  facing: 1 | -1;
}

/** Feet, centre and facing of a side, for placing sprites and feeding the effect sampler. */
export function stageAnchors(side: 'player' | 'enemy'): StageAnchors {
  const s = STAGE[side];
  const half = (24 * STAGE.spriteScale) / 2;
  return { feet: { x: s.x, y: s.y }, centre: { x: s.x, y: s.y - half }, facing: side === 'player' ? 1 : -1 };
}

/** Ground platform for a zone; `size` near (player, bigger) or far (enemy). Pure per seed. */
export function groundPlatform(zone: ZoneId, seed: string | number, size: PlatformSize): GroundPlatform {
  const p = ZONE_PALETTES[zone];
  const rng = cosmeticRng(`platform|${zone}|${size}|${seed}`);
  const w = WIDTH[size];
  const rx = w / 2 - 1;
  const ry = round(w / 7);
  const side = size === 'near' ? 6 : 5;
  const h = ry * 2 + side + 6;
  const [top, topLight, sideC, sideDark, tuft] = p.platform;
  // 1 top, 2 top light, 3 side, 4 side dark, 5 tuft, 6 outline
  const g = new Grid(w, h, ['#00000000', top, topLight, sideC, sideDark, tuft, p.floor[1]]);
  const cx = w / 2;
  const cy = ry + 2;
  // Earth body: the lower half of the ellipse pushed down by `side`, with a ragged bottom.
  for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - cx) / rx;
    if (Math.abs(nx) > 1) continue;
    const yTop = cy + sqrt(1 - nx * nx) * ry;
    const depth = side * sqrt(1 - nx * nx) + (rng.chance(0.35) ? 1 : 0);
    for (let y = Math.floor(cy); y < yTop + depth; y++) g.set(x, y, y > yTop + depth - 3 ? 4 : 3);
  }
  // Dangling roots and pebbles under the rim.
  for (let i = 0; i < 4; i++) {
    const x = round(cx + rng.range(-rx * 0.6, rx * 0.6));
    let y = 0;
    while (y < h - 1 && g.get(x, y + 1) !== 0) y++;
    for (let k = 0; k < rng.between(1, 3); k++) g.set(x + (k === 2 ? 1 : 0), y + 1 + k, 4);
  }
  // Top surface.
  g.ellipse(cx, cy, rx, ry, 1);
  // Lit far edge (top arc), stronger towards the light.
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && g.get(x, y) !== 1) y++;
    if (y >= h) continue;
    const towardLight = ((x - cx) / rx) * p.light.side > -0.3;
    g.set(x, y, 2);
    if (towardLight) g.set(x, y + 1, 2);
  }
  // Texture: a few lit specks on the surface, and grass tufts on the rim.
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, PI * 2);
    const d = rng.range(0.2, 0.85);
    const x = round(cx + cos(a) * rx * d);
    const y = round(cy + sin(a) * ry * d);
    if (g.get(x, y) === 1) g.set(x, y, 2);
  }
  for (let i = 0; i < 7; i++) {
    const nx = rng.range(-0.95, 0.95);
    const x = round(cx + nx * rx);
    const y = round(cy - sqrt(1 - nx * nx) * ry * (rng.chance(0.5) ? 1 : -0.98));
    g.set(x, y, 5);
    g.set(x, y - 1, 5);
    if (rng.chance(0.5)) g.set(x + (nx > 0 ? 1 : -1), y - 1, 5);
  }
  g.outline(6);

  // Shadow: a solid core with a checkerboard rim, so it reads as soft without blending.
  const sw = round(w * 0.5);
  const sh = 7;
  const s = new Grid(sw, sh, ['#00000000', p.shadow]);
  const scx = sw / 2;
  const scy = sh / 2;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const nx = (x + 0.5 - scx) / (sw / 2);
      const ny = (y + 0.5 - scy) / (sh / 2);
      const d = nx * nx + ny * ny;
      if (d <= 0.55 || (d <= 1 && (x + y) % 2 === 0)) s.set(x, y, 1);
    }
  }
  return { grid: g.toPixelGrid(), anchor: { x: round(cx), y: round(cy) }, shadow: s.toPixelGrid() };
}
