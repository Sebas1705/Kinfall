import type { ElementId } from '../content/schema';
import { BODY, elementPalette, type PixelGrid } from './palette';

const SIZE = 8;

/** One distinct silhouette per element, so colour is never the only cue. '#' = filled. */
const SHAPES: Record<ElementId, string[]> = {
  // flame
  ember: ['....#...', '...##...', '..###.#.', '.######.', '.######.', '.######.', '..####..', '...##...'],
  // spike
  thorn: ['...##...', '...##...', '..####..', '..####..', '.######.', '.######.', '########', '........'],
  // droplet
  tide: ['...##...', '...##...', '..####..', '.######.', '########', '########', '.######.', '..####..'],
  // wind curls
  gale: ['..####..', '.#....#.', '......#.', '########', '........', '#######.', '.......#', '..####..'],
  // crescent
  umbra: ['..####..', '.##.....', '##......', '##......', '##......', '##......', '.##.....', '..####..'],
};

/** 8x8 icon for an element; filled cells use the palette's body colour. */
export function elementIcon(element: ElementId): PixelGrid {
  const pixels = new Uint8Array(SIZE * SIZE);
  SHAPES[element].forEach((row, y) => {
    for (let x = 0; x < SIZE; x++) if (row[x] === '#') pixels[y * SIZE + x] = BODY;
  });
  return { width: SIZE, height: SIZE, pixels, palette: elementPalette(element) };
}
