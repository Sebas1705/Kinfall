import type { Content, MoveDef, SpeciesDef } from './schema';

/** Id-indexed access to a `Content`; unknown ids throw. */
export interface Lookup {
  species(id: string): SpeciesDef;
  move(id: string): MoveDef;
  hasSpecies(id: string): boolean;
}

const cache = new WeakMap<Content, Lookup>();

/** Builds (once per `content` object) the id indexes for species and moves. */
export function lookup(content: Content): Lookup {
  const hit = cache.get(content);
  if (hit) return hit;
  const species = new Map<string, SpeciesDef>();
  for (const s of content.species) if (!species.has(s.id)) species.set(s.id, s);
  const moves = new Map<string, MoveDef>();
  for (const m of content.moves) if (!moves.has(m.id)) moves.set(m.id, m);
  const made: Lookup = {
    species(id) {
      const sp = species.get(id);
      if (!sp) throw new Error(`unknown species: ${id}`);
      return sp;
    },
    move(id) {
      const m = moves.get(id);
      if (!m) throw new Error(`unknown move: ${id}`);
      return m;
    },
    hasSpecies: (id) => species.has(id),
  };
  cache.set(content, made);
  return made;
}
