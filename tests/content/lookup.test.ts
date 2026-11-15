import { describe, expect, it } from 'vitest';
import { CONTENT, type Content } from '../../src/content';
import { lookup } from '../../src/content/lookup';
import { chooseEnemyMove } from '../../src/sim/ai';
import { createBattle } from '../../src/sim/battle';

describe('lookup', () => {
  it('returns the same objects as a linear find', () => {
    const l = lookup(CONTENT);
    for (const sp of CONTENT.species) expect(l.species(sp.id)).toBe(sp);
    for (const m of CONTENT.moves) expect(l.move(m.id)).toBe(m);
  });

  it('throws the exact unknown-id messages', () => {
    const l = lookup(CONTENT);
    expect(() => l.species('nope')).toThrow('unknown species: nope');
    expect(() => l.move('nope')).toThrow('unknown move: nope');
  });

  it('is memoised per content object', () => {
    expect(lookup(CONTENT)).toBe(lookup(CONTENT));
    expect(lookup(structuredClone(CONTENT))).not.toBe(lookup(CONTENT));
  });

  it('reports known and unknown species', () => {
    const l = lookup(CONTENT);
    expect(l.hasSpecies(CONTENT.species[0]!.id)).toBe(true);
    expect(l.hasSpecies('nope')).toBe(false);
  });

  it('works on a two-species fixture', () => {
    const c: Content = { species: CONTENT.species.slice(0, 2), moves: CONTENT.moves };
    const l = lookup(c);
    expect(l.species(c.species[1]!.id)).toBe(c.species[1]);
    expect(l.hasSpecies(CONTENT.species[2]!.id)).toBe(false);
    expect(() => l.species(CONTENT.species[2]!.id)).toThrow('unknown species');
  });

  it('makes the AI throw on an unknown move id instead of skipping it', () => {
    const id0 = CONTENT.species[0]!.id;
    const state = createBattle('s', { speciesIds: [id0] }, { speciesIds: [id0] }, CONTENT);
    const broken: Content = {
      species: CONTENT.species.map((s) => ({ ...s, moves: ['ghost-move', ...s.moves.slice(1)] })),
      moves: CONTENT.moves,
    };
    expect(() => chooseEnemyMove(state, broken)).toThrow('unknown move: ghost-move');
  });
});
