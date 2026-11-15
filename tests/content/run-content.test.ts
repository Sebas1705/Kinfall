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
        expect(evo.base[k]).toBe(Math.floor((src.base[k] * 125) / 100));
      }
      expect(
        evo.art.body !== src.art.body || evo.art.limbs !== src.art.limbs || evo.art.pattern !== src.art.pattern,
      ).toBe(true);
      expect(CONTENT.starters).not.toContain(src.evolvesTo);
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

  it('the last script entry is the strongest damage move of the species', () => {
    for (const b of CONTENT.bosses) {
      const sp = byId(CONTENT, b.speciesId);
      const power = (mid: string) => CONTENT.moves.find((m) => m.id === mid)!;
      const best = Math.max(
        ...sp.moves.map(power).filter((m) => m.kind === 'damage').map((m) => m.power),
      );
      const last = power(sp.moves[b.script[b.script.length - 1]!]!);
      expect(last.kind).toBe('damage');
      expect(last.power).toBe(best);
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

  it('last script entry not the strongest damage move', () => {
    const c = clone();
    const b = c.bosses[0]!;
    b.script = [3, 0, 1, 2]; // ends on smoulder_hex (status)
    const m = only(c, b.id);
    expect(m).toContain('strongest');
    const d = clone();
    d.bosses[0]!.script = [0, 1, 2, 0]; // ends on a weak damage move
    only(d, d.bosses[0]!.id);
  });

  it('boss duplicate zone names the boss id', () => {
    const c = clone();
    c.bosses[1]!.zone = 0;
    const errs = validateContent(c);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain(c.bosses[1]!.id);
  });

  it('non-array bosses mentions bosses', () => {
    const c = clone();
    (c as unknown as Obj).bosses = 'nope';
    const errs = validateContent(c);
    expect(errs.some((e) => e.includes('bosses'))).toBe(true);
  });

  it('float, NaN or non-number script entries name the boss', () => {
    for (const bad of [1.5, Number.NaN, '2' as unknown as number]) {
      const c = clone();
      c.bosses[0]!.script = [0, 1, bad, 3];
      only(c, c.bosses[0]!.id);
    }
  });

  it('NaN hpPercent names the boss', () => {
    const c = clone();
    c.bosses[2]!.hpPercent = Number.NaN;
    only(c, c.bosses[2]!.id);
  });

  it('evolveCost without evolvesTo names the species', () => {
    const c = clone();
    byId(c, 'skirrow').evolveCost = 3;
    only(c, 'skirrow');
  });

  it('lists cycle members in chain order', () => {
    const c = clone();
    const evo = byId(c, byId(c, 'cindermite').evolvesTo!);
    evo.evolvesTo = 'cindermite';
    evo.evolveCost = 3;
    expect(validateContent(c)[0]).toContain('cindermaw -> cindermite -> cindermaw');
  });

  it('missing optional fields still produce messages without throwing', () => {
    for (const key of ['zones', 'bosses', 'starters']) {
      const c = clone();
      (c as unknown as Obj)[key] = undefined;
      let errs: string[] = [];
      expect(() => (errs = validateContent(c))).not.toThrow();
      expect(errs.length).toBeGreaterThanOrEqual(1);
    }
    const e = clone();
    (e.zones[0] as unknown as Obj).wild = undefined;
    (e.bosses[0] as unknown as Obj).script = undefined;
    let errs: string[] = [];
    expect(() => (errs = validateContent(e))).not.toThrow();
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });
});

type Obj = Record<string, unknown>;

describe('validateContent is total', () => {
  const BAD: unknown[] = [undefined, null, 7, 'x', [], {}];
  // Each path is walked on a fresh clone and the leaf replaced by every bad value.
  const PATHS: (string | number)[][] = [
    ['species'], ['moves'], ['zones'], ['bosses'], ['starters'],
    ['species', 0], ['species', 0, 'moves'], ['species', 0, 'names'], ['species', 0, 'base'],
    ['species', 0, 'art'], ['species', 0, 'art', 'key'], ['species', 0, 'elements'],
    ['species', 0, 'evolvesTo'], ['species', 0, 'evolveCost'],
    ['moves', 0], ['moves', 0, 'names'], ['moves', 0, 'names', 'es'], ['moves', 0, 'accuracy'],
    ['moves', 0, 'power'], ['moves', 0, 'kind'],
    ['zones', 0], ['zones', 0, 'wild'], ['zones', 1, 'elite'],
    ['bosses', 0], ['bosses', 0, 'script'], ['bosses', 1, 'speciesId'], ['bosses', 2, 'hpPercent'],
    ['bosses', 0, 'names'], ['bosses', 1, 'zone'], ['starters', 0],
  ];

  it('never throws and always returns an array for malformed content', () => {
    let runs = 0;
    for (const path of PATHS) {
      for (const bad of BAD) {
        const c = clone();
        let node = c as unknown as Obj;
        for (const p of path.slice(0, -1)) node = node[p as string] as Obj;
        node[path[path.length - 1] as string] = bad;
        let errs: unknown;
        expect(() => (errs = validateContent(c))).not.toThrow();
        expect(Array.isArray(errs)).toBe(true);
        runs++;
      }
    }
    expect(runs).toBeGreaterThanOrEqual(150);
  });

  it('survives a non-object root and null entries', () => {
    expect(() => validateContent(null as unknown as Content)).not.toThrow();
    expect(validateContent(undefined as unknown as Content).length).toBeGreaterThanOrEqual(1);
    const c = clone();
    c.species.push(null as never);
    c.moves.push(undefined as never);
    c.bosses[0] = null as never;
    const errs = validateContent(c);
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });

  it('a species with moves undefined yields a message naming it', () => {
    const c = clone();
    (c.species[1] as unknown as Obj).moves = undefined;
    const errs = validateContent(c);
    expect(errs.some((e) => e.includes(c.species[1]!.id))).toBe(true);
  });
});
