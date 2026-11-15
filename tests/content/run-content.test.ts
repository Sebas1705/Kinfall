import { describe, expect, it } from 'vitest';
import { CONTENT, validateContent, type Content } from '../../src/content';

function clone(): Content {
  return structuredClone(CONTENT);
}

function only(c: Content, id: string): string {
  const errs = validateContent(c);
  expect(errs).toHaveLength(1);
  expect(errs[0]).toContain(id);
  return errs[0]!;
}

const byId = (c: Content, id: string) => c.species.find((s) => s.id === id)!;

describe('run content', () => {
  it('CONTENT validates with no messages', () => {
    expect(validateContent(CONTENT)).toEqual([]);
  });

  it('has 9 species and the starters', () => {
    expect(CONTENT.species).toHaveLength(9);
    expect(CONTENT.starters).toEqual(['cindermite', 'brambleback', 'tidewisp']);
    expect(CONTENT.zones).toHaveLength(3);
    expect(CONTENT.bosses).toHaveLength(3);
  });

  it('each starter evolves into a stronger original species for 3', () => {
    for (const id of CONTENT.starters) {
      const src = byId(CONTENT, id);
      expect(src.evolveCost).toBe(3);
      const evo = byId(CONTENT, src.evolvesTo!);
      expect(evo.evolvesTo).toBeUndefined();
      expect(evo.elements).toEqual(src.elements);
      for (const k of ['health', 'power', 'guard', 'speed', 'focus'] as const) {
        expect(Number.isInteger(evo.base[k])).toBe(true);
        expect(evo.base[k] * 100).toBeGreaterThanOrEqual(src.base[k] * 120);
      }
      expect(evo.art.key).not.toBe(src.art.key);
      expect(evo.moves).toHaveLength(4);
      expect(evo.names.es.length).toBeLessThanOrEqual(24);
    }
  });

  it('bosses are one per zone with valid scripts', () => {
    expect(CONTENT.bosses.map((b) => b.zone)).toEqual([0, 1, 2]);
    expect(CONTENT.bosses.map((b) => b.hpPercent)).toEqual([220, 260, 320]);
    for (const b of CONTENT.bosses) {
      const sp = byId(CONTENT, b.speciesId);
      expect(b.script.length).toBeGreaterThanOrEqual(3);
      expect(b.script.length).toBeLessThanOrEqual(4);
      for (const i of b.script) expect(sp.moves[i]).toBeDefined();
      expect(b.names.es.length).toBeLessThanOrEqual(24);
    }
  });

  it('zone pools have at least 2 elite species', () => {
    for (const z of CONTENT.zones) expect(z.elite.length).toBeGreaterThanOrEqual(2);
  });
});

describe('zone pools', () => {
  it('the zone-2 boss species is in no wild pool', () => {
    const finalBoss = CONTENT.bosses.find((b) => b.zone === 2)!.speciesId;
    for (const z of CONTENT.zones) expect(z.wild).not.toContain(finalBoss);
  });

  it('zone 0 is starters plus gale; zone 1 adds umbra; zone 2 matches zone 1', () => {
    expect(CONTENT.zones[0]!.wild).toEqual([...CONTENT.starters, 'skirrow']);
    expect(CONTENT.zones[1]!.wild).toEqual([...CONTENT.starters, 'skirrow', 'dusklurk']);
    expect(CONTENT.zones[2]!.wild).toEqual(CONTENT.zones[1]!.wild);
  });
});

describe('run content validator', () => {
  it('evolution target missing', () => {
    const c = clone();
    byId(c, 'cindermite').evolvesTo = 'no_such_form';
    only(c, 'no_such_form');
  });

  it('evolution cycle', () => {
    const c = clone();
    const evo = byId(c, byId(c, 'cindermite').evolvesTo!);
    evo.evolvesTo = 'cindermite';
    evo.evolveCost = 3;
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('cycle');
    expect(errs[0]).toContain('cindermite');
  });

  it('evolveCost below 1', () => {
    const c = clone();
    byId(c, 'cindermite').evolveCost = 0;
    only(c, 'cindermite');
  });

  it('evolveCost missing when evolvesTo is set', () => {
    const c = clone();
    delete byId(c, 'brambleback').evolveCost;
    only(c, 'brambleback');
  });

  it('zone pool with an unknown species', () => {
    const c = clone();
    c.zones[1]!.wild.push('ghost_species');
    only(c, 'ghost_species');
  });

  it('empty zone pool', () => {
    const c = clone();
    c.zones[0]!.elite = [];
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('zone 0');
  });

  it('boss with an unknown species', () => {
    const c = clone();
    c.bosses[0]!.speciesId = 'ghost_boss';
    const errs = validateContent(c);
    expect(errs.some((e) => e.includes('ghost_boss'))).toBe(true);
    expect(errs).toHaveLength(1);
  });

  it('boss with an empty script', () => {
    const c = clone();
    c.bosses[1]!.script = [];
    only(c, c.bosses[1]!.id);
  });

  it('boss script index out of range', () => {
    const c = clone();
    c.bosses[2]!.script = [0, 1, 9];
    only(c, c.bosses[2]!.id);
  });

  it('boss hpPercent outside 100..500', () => {
    const c = clone();
    c.bosses[0]!.hpPercent = 501;
    only(c, c.bosses[0]!.id);
    const d = clone();
    d.bosses[0]!.hpPercent = 99;
    only(d, d.bosses[0]!.id);
  });

  it('unknown starter', () => {
    const c = clone();
    c.starters[2] = 'ghost_starter';
    only(c, 'ghost_starter');
  });

  it('zone count not 3', () => {
    const c = clone();
    c.zones.pop();
    const errs = validateContent(c);
    expect(errs.some((e) => e.includes('zones'))).toBe(true);
  });

  it('boss count not 3 and starter count not 3', () => {
    const c = clone();
    c.bosses.pop();
    expect(validateContent(c).some((e) => e.includes('bosses'))).toBe(true);
    const d = clone();
    d.starters.pop();
    expect(validateContent(d).some((e) => e.includes('starters'))).toBe(true);
  });

  it('does not throw on malformed optional data', () => {
    const c = clone();
    (c as unknown as Record<string, unknown>).zones = undefined;
    (c as unknown as Record<string, unknown>).bosses = undefined;
    (c as unknown as Record<string, unknown>).starters = undefined;
    expect(() => validateContent(c)).not.toThrow();
    const e = clone();
    (e.zones[0] as unknown as Record<string, unknown>).wild = undefined;
    (e.bosses[0] as unknown as Record<string, unknown>).script = undefined;
    expect(() => validateContent(e)).not.toThrow();
  });
});
