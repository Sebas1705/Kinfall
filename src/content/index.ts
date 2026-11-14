import type { Content } from './schema';
import { MOVES } from './moves';
import { SPECIES } from './species';

export * from './schema';
export { ELEMENTS, effectiveness } from './elements';
export { validateContent } from './validate';

export const CONTENT: Content = { species: SPECIES, moves: MOVES };
