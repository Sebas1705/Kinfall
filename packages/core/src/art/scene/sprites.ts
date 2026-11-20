// Particle sprites: tiny one-colour masks (palette index 1 = white). Renderers bake each mask once
// and tint it with the particle's colour, so one texture serves every element.
import type { PixelGrid } from '../palette';

export type ParticleSpriteId =
  | 'dot'
  | 'mote'
  | 'spark'
  | 'ember'
  | 'star'
  | 'plus'
  | 'leaf'
  | 'thorn'
  | 'droplet'
  | 'ring'
  | 'streak'
  | 'beam'
  | 'swirl'
  | 'wisp'
  | 'flake'
  | 'shard';

/** '#' = filled. Kept small: the largest is 7x7. */
const MASKS: Record<ParticleSpriteId, string[]> = {
  dot: ['#'],
  mote: ['##', '##'],
  spark: ['.#.', '###', '.#.'],
  ember: ['.#', '##', '#.'],
  star: ['..#..', '..#..', '##.##', '..#..', '..#..'],
  plus: ['.#.', '###', '.#.'],
  leaf: ['.##.', '####', '.#..'],
  thorn: ['.#.', '.#.', '###', '###', '###'],
  droplet: ['.#.', '###', '###', '.#.'],
  ring: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
  streak: ['#######'],
  beam: ['#', '#', '#', '#', '#', '#'],
  swirl: ['.##.', '#..#', '...#', '..#.'],
  wisp: ['.##.', '####', '####', '.##.'],
  flake: ['##'],
  shard: ['#.', '##', '.#'],
};

function mask(rows: string[]): PixelGrid {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const pixels = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) if (row[x] === '#') pixels[y * width + x] = 1;
  });
  return { width, height, pixels, palette: ['#00000000', '#ffffff'] };
}

export const PARTICLE_SPRITE_IDS = Object.keys(MASKS) as ParticleSpriteId[];

/** White mask of each particle sprite (bake once, tint per particle). */
export function particleSprites(): Record<ParticleSpriteId, PixelGrid> {
  const out = {} as Record<ParticleSpriteId, PixelGrid>;
  for (const id of PARTICLE_SPRITE_IDS) out[id] = mask(MASKS[id]);
  return out;
}
