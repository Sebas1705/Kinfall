import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../src/content';
import { createRng } from '../../../src/sim/rng';
import { buildEncounter } from '../../../src/sim/run/encounters';
import { startRun } from '../../../src/sim/run/run';
import type { MapNode, NodeType, RunState } from '../../../src/sim/run/types';

function fakeNode(zone: number, layer: number, type: NodeType, col = 0): MapNode {
  return { id: `z${zone}-l${layer}-c${col}`, zone, layer, type, next: [] };
}

function allNodes(run: RunState): MapNode[] {
  return run.maps.flatMap((m) => m.layers.flat());
}

describe('buildEncounter: wild', () => {
  it('draws one species from the zone wild pool with node-forked rng, no telegraph', () => {
    const run = startRun('enc-wild', 'cindermite', CONTENT);
    for (const node of allNodes(run).filter((n) => n.type === 'wild')) {
      const e = buildEncounter(run, node, CONTENT);
      const pool = CONTENT.zones[node.zone]!.wild;
      const expected = pool[createRng(run.seed).fork('node:' + node.id).nextInt(pool.length)]!;
      expect(e.enemy.speciesIds).toEqual([expected]);
      expect(e.telegraph).toBe(false);
      expect(e.script).toBeUndefined();
      expect(e.seed).toBe(`enc-wild:${node.id}`);
    }
  });

  it('scales hpPercent as 100 + 8 * (zone * 7 + layer)', () => {
    const run = startRun('enc-scale', 'cindermite', CONTENT);
    expect(buildEncounter(run, fakeNode(0, 2, 'wild'), CONTENT).enemy.hpPercent).toBe(116);
    expect(buildEncounter(run, fakeNode(2, 5, 'wild'), CONTENT).enemy.hpPercent).toBe(252);
    expect(buildEncounter(run, fakeNode(0, 0, 'wild'), CONTENT).enemy.hpPercent).toBe(100);
  });
});

describe('buildEncounter: elite', () => {
  it('draws two distinct species from the elite pool, telegraphed', () => {
    for (let i = 0; i < 50; i++) {
      const run = startRun(`enc-elite-${i}`, 'tidewisp', CONTENT);
      for (const node of allNodes(run).filter((n) => n.type === 'elite')) {
        const e = buildEncounter(run, node, CONTENT);
        const pool = CONTENT.zones[node.zone]!.elite;
        expect(e.enemy.speciesIds).toHaveLength(2);
        for (const id of e.enemy.speciesIds) expect(pool).toContain(id);
        expect(e.enemy.speciesIds[0]).not.toBe(e.enemy.speciesIds[1]);
        expect(e.telegraph).toBe(true);
        expect(e.script).toBeUndefined();
      }
    }
  });

  it('uses floor(130 * (100 + 8g) / 100)', () => {
    const run = startRun('enc-elite-hp', 'tidewisp', CONTENT);
    // g = 10: floor(130 * 180 / 100) = 234
    expect(buildEncounter(run, fakeNode(1, 3, 'elite'), CONTENT).enemy.hpPercent).toBe(234);
    // g = 2: floor(130 * 116 / 100) = 150
    expect(buildEncounter(run, fakeNode(0, 2, 'elite'), CONTENT).enemy.hpPercent).toBe(150);
    // g = 19: floor(130 * 252 / 100) = 327
    expect(buildEncounter(run, fakeNode(2, 5, 'elite'), CONTENT).enemy.hpPercent).toBe(327);
  });

  it('repeats the species when the pool has a single distinct entry', () => {
    const content = { ...CONTENT, zones: [{ wild: ['cindermite'], elite: ['cindermaw', 'cindermaw'] }] };
    const run = startRun('enc-single', 'cindermite', CONTENT);
    expect(buildEncounter(run, fakeNode(0, 3, 'elite'), content).enemy.speciesIds).toEqual(['cindermaw', 'cindermaw']);
  });
});

describe('buildEncounter: boss', () => {
  it('uses the zone boss species, hpPercent, script copy and telegraph', () => {
    const run = startRun('enc-boss', 'brambleback', CONTENT);
    for (const boss of CONTENT.bosses) {
      const e = buildEncounter(run, fakeNode(boss.zone, 6, 'boss'), CONTENT);
      expect(e.enemy.speciesIds).toEqual([boss.speciesId]);
      expect(e.enemy.hpPercent).toBe(boss.hpPercent);
      expect(e.telegraph).toBe(true);
      expect(e.script).toEqual(boss.script);
      expect(e.script).not.toBe(boss.script);
    }
    const z2 = buildEncounter(run, fakeNode(2, 6, 'boss'), CONTENT);
    expect(z2.enemy.speciesIds).toEqual(['emberveil']);
    expect(z2.enemy.hpPercent).toBe(320);
    expect(z2.script).toEqual([0, 2, 3, 1]);
  });
});

describe('buildEncounter: path independence and range', () => {
  it('depends only on seed and node, not on rng, at, party or phase', () => {
    const base = startRun('enc-path', 'cindermite', CONTENT);
    const other: RunState = structuredClone(base);
    other.rng = createRng('something-else').getState();
    other.at = other.maps[0]!.layers[0]![1]!.id;
    other.party = [{ speciesId: 'tidewisp', hp: 10 }];
    other.souls = 7;
    for (const node of allNodes(base).filter((n) => n.type === 'wild' || n.type === 'elite' || n.type === 'boss')) {
      expect(buildEncounter(other, node, CONTENT)).toEqual(buildEncounter(base, node, CONTENT));
    }
  });

  it('keeps hpPercent within 50..500 for every combat node of 200 seeds', () => {
    const seenWild = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const run = startRun(`range-${i}`, 'cindermite', CONTENT);
      for (const node of allNodes(run)) {
        if (node.type !== 'wild' && node.type !== 'elite' && node.type !== 'boss') continue;
        const e = buildEncounter(run, node, CONTENT);
        const pct = e.enemy.hpPercent!;
        expect(Number.isInteger(pct)).toBe(true);
        expect(pct).toBeGreaterThanOrEqual(50);
        expect(pct).toBeLessThanOrEqual(500);
        if (node.type === 'wild') seenWild.add(e.enemy.speciesIds[0]!);
      }
    }
    expect(seenWild.size).toBeGreaterThan(1);
  });
});
