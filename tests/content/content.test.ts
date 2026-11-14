import { describe, expect, it } from 'vitest';
import {
  CONTENT,
  ELEMENTS,
  effectiveness,
  validateContent,
  type Content,
  type ElementId,
} from '../../src/content';

function clone(): Content {
  return structuredClone(CONTENT);
}

describe('effectiveness', () => {
  it('follows the element cycle', () => {
    expect(effectiveness('ember', ['thorn'])).toBe(200);
    expect(effectiveness('ember', ['tide'])).toBe(50);
    expect(effectiveness('ember', ['gale'])).toBe(200);
    expect(effectiveness('ember', ['umbra'])).toBe(50);
    expect(effectiveness('ember', ['ember'])).toBe(100);
  });

  it('multiplies for dual types', () => {
    expect(effectiveness('ember', ['thorn', 'gale'])).toBe(400);
    expect(effectiveness('ember', ['thorn', 'tide'])).toBe(100);
  });

  it('each element beats exactly 2 others and is resisted by exactly 2', () => {
    for (const a of ELEMENTS) {
      const others: ElementId[] = ELEMENTS.filter((e) => e !== a);
      expect(others.filter((d) => effectiveness(a, [d]) === 200)).toHaveLength(2);
      expect(others.filter((d) => effectiveness(a, [d]) === 50)).toHaveLength(2);
    }
  });
});

describe('content', () => {
  it('CONTENT is valid', () => {
    expect(validateContent(CONTENT)).toEqual([]);
  });

  it('has the slice sizes and 4 moves per species', () => {
    expect(CONTENT.species.length).toBe(6);
    expect(CONTENT.moves.length).toBe(12);
    for (const s of CONTENT.species) expect(s.moves).toHaveLength(4);
  });

  it('has an ember damage move with power 40', () => {
    expect(
      CONTENT.moves.some((m) => m.element === 'ember' && m.kind === 'damage' && m.power === 40),
    ).toBe(true);
  });
});

describe('validator catches errors', () => {
  it('duplicate species id', () => {
    const c = clone();
    const dup = structuredClone(c.species[0]!);
    c.species.push(dup);
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain(dup.id);
  });

  it('unknown move id in a species', () => {
    const c = clone();
    c.species[1]!.moves[0] = 'no_such_move';
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('no_such_move');
  });

  it('move accuracy outside 1..100', () => {
    const c = clone();
    c.moves[0]!.accuracy = 101;
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain(c.moves[0]!.id);
  });

  it('damage move with power <= 0', () => {
    const c = clone();
    const m = c.moves.find((x) => x.kind === 'damage')!;
    m.power = 0;
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain(m.id);
  });

  it('missing es or en name', () => {
    const c = clone();
    c.moves[2]!.names.es = '';
    let errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain(c.moves[2]!.id);

    const d = clone();
    d.species[3]!.names.en = '';
    errs = validateContent(d);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain(d.species[3]!.id);
  });

  it('species with base.health <= 0', () => {
    const c = clone();
    c.species[2]!.base.health = 0;
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain(c.species[2]!.id);
  });
});
