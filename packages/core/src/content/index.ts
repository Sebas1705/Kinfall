import type { Content } from './schema';
import { BOSSES } from './bosses';
import { MOVES } from './moves';
import { SPECIES } from './species';
import { ZONES } from './zones';

export * from './schema';
export { ELEMENTS, effectiveness } from './elements';
export { validateContent } from './validate';

export const CONTENT: Content = {
  species: SPECIES,
  moves: MOVES,
  zones: ZONES,
  bosses: BOSSES,
  starters: ['cindermite', 'brambleback', 'tidewisp'],
};
