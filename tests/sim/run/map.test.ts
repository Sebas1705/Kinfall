import { describe, expect, it } from 'vitest';
import { generateZoneMap } from '../../../src/sim/run/map';
import type { NodeType, ZoneMap } from '../../../src/sim/run/types';

const SEEDS = Array.from({ length: 500 }, (_, i) => `seed-${i}`);
const ZONES = [0, 1, 2];
const ID_RE = /^z(\d+)-l(\d+)-c(\d+)$/;

const maps: ZoneMap[] = [];
for (const seed of SEEDS) for (const zone of ZONES) maps.push(generateZoneMap(seed, zone));

describe('generateZoneMap structure', () => {
  it('has 7 layers: 2-3 nodes in layers 0-5 and one boss in layer 6', () => {
    for (const m of maps) {
      expect(m.layers).toHaveLength(7);
      for (let l = 0; l < 6; l++) {
        expect(m.layers[l]!.length).toBeGreaterThanOrEqual(2);
        expect(m.layers[l]!.length).toBeLessThanOrEqual(3);
      }
      expect(m.layers[6]).toHaveLength(1);
      expect(m.layers[6]![0]!.type).toBe('boss');
    }
  });

  it('uses unique ids in the z<zone>-l<layer>-c<col> format', () => {
    for (const m of maps) {
      const seen = new Set<string>();
      m.layers.forEach((layer, l) =>
        layer.forEach((n, c) => {
          expect(n.id).toBe(`z${m.zone}-l${l}-c${c}`);
          expect(ID_RE.test(n.id)).toBe(true);
          expect(n.zone).toBe(m.zone);
          expect(n.layer).toBe(l);
          expect(seen.has(n.id)).toBe(false);
          seen.add(n.id);
        }),
      );
    }
  });

  it('wires 1-2 sorted, unique successors in the next layer', () => {
    for (const m of maps) {
      for (let l = 0; l < 6; l++) {
        const nextIds = m.layers[l + 1]!.map((n) => n.id);
        for (const n of m.layers[l]!) {
          expect(n.next.length).toBeGreaterThanOrEqual(1);
          expect(n.next.length).toBeLessThanOrEqual(2);
          expect(new Set(n.next).size).toBe(n.next.length);
          for (const id of n.next) expect(nextIds).toContain(id);
          const cols = n.next.map((id) => Number(ID_RE.exec(id)![3]));
          expect(cols).toEqual([...cols].sort((a, b) => a - b));
          if (l === 5) expect(n.next).toEqual([m.layers[6]![0]!.id]);
        }
      }
      expect(m.layers[6]![0]!.next).toEqual([]);
    }
  });

  it('gives every node in layers 1-6 an incoming edge', () => {
    for (const m of maps) {
      for (let l = 1; l < 7; l++) {
        const incoming = new Set(m.layers[l - 1]!.flatMap((n) => n.next));
        for (const n of m.layers[l]!) expect(incoming.has(n.id)).toBe(true);
      }
    }
  });

  it('respects the node type rules', () => {
    for (const m of maps) {
      expect(m.layers[0]!.every((n) => n.type === 'wild')).toBe(true);
      for (let l = 0; l < 7; l++) {
        const elites = m.layers[l]!.filter((n) => n.type === 'elite').length;
        if (l <= 1) expect(elites).toBe(0);
        expect(elites).toBeLessThanOrEqual(1);
        if (l < 6) expect(m.layers[l]!.some((n) => n.type === 'boss')).toBe(false);
      }
      expect(m.layers[5]!.some((n) => n.type === 'shrine')).toBe(true);
    }
  });
});

describe('generateZoneMap determinism', () => {
  it('is deep-equal for the same seed and zone', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      for (const zone of ZONES) {
        expect(generateZoneMap(seed, zone)).toEqual(generateZoneMap(seed, zone));
      }
    }
  });

  it('does not depend on other zones having been generated', () => {
    const a = generateZoneMap('indep', 2);
    generateZoneMap('indep', 0);
    generateZoneMap('indep', 1);
    expect(generateZoneMap('indep', 2)).toEqual(a);
  });

  it('differs across seeds in at least 90% of pairs', () => {
    let differing = 0;
    let pairs = 0;
    for (let i = 0; i + 1 < SEEDS.length; i++) {
      for (const zone of ZONES) {
        pairs++;
        if (JSON.stringify(generateZoneMap(SEEDS[i]!, zone)) !== JSON.stringify(generateZoneMap(SEEDS[i + 1]!, zone))) differing++;
      }
    }
    expect(differing / pairs).toBeGreaterThanOrEqual(0.9);
  });

  it('differs across zones for the same seed', () => {
    expect(JSON.stringify(generateZoneMap('s', 0))).not.toBe(JSON.stringify(generateZoneMap('s', 1)));
  });
});

describe('generateZoneMap robustness', () => {
  it('never throws for odd seeds', () => {
    const seeds = ['', ' ', 'x'.repeat(100_000), '日本語🎲', '\u0000\u0001', '0', '-1'];
    for (const s of seeds) for (const z of ZONES) expect(() => generateZoneMap(s, z)).not.toThrow();
  });

  it('throws RangeError for invalid zones', () => {
    for (const z of [-1, 3, 1.5, NaN, Infinity]) {
      expect(() => generateZoneMap('s', z)).toThrow(RangeError);
    }
  });
});

describe('generateZoneMap type distribution (layers 2-4)', () => {
  it('is within +-5 percentage points of 50/15/15/10/10', () => {
    const counts: Record<NodeType, number> = { wild: 0, elite: 0, shrine: 0, cache: 0, mystery: 0, boss: 0 };
    let total = 0;
    for (const m of maps) {
      for (let l = 2; l <= 4; l++) {
        for (const n of m.layers[l]!) {
          counts[n.type]++;
          total++;
        }
      }
    }
    const target: Partial<Record<NodeType, number>> = { wild: 50, elite: 15, shrine: 15, cache: 10, mystery: 10 };
    for (const [type, pct] of Object.entries(target)) {
      const actual = (counts[type as NodeType] * 100) / total;
      expect(Math.abs(actual - pct!), `${type}: ${actual.toFixed(2)}%`).toBeLessThanOrEqual(5);
    }
    expect(counts.boss).toBe(0);
  });
});
