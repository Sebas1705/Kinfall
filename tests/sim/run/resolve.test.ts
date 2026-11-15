import { describe, expect, it } from 'vitest';
import type { Content, MoveDef, SpeciesDef, Stats } from '../../../src/content';
import { applyAction, createBattle } from '../../../src/sim/battle';
import { resolveBattle } from '../../../src/sim/run/resolve';
import { applyRunAction, legalRunActions, maxHpOf, startRun } from '../../../src/sim/run/run';
import type { MapNode, NodeType, RunEvent, RunState } from '../../../src/sim/run/types';
import type { Action, BattleState } from '../../../src/sim/state';

function move(m: Partial<MoveDef> & Pick<MoveDef, 'id' | 'element' | 'kind'>): MoveDef {
  return { names: { en: m.id, es: m.id }, power: 0, focusCost: 0, accuracy: 100, target: 'enemy', ...m };
}
function species(id: string, elements: SpeciesDef['elements'], base: Stats, moves: string[]): SpeciesDef {
  return {
    id,
    names: { en: id, es: id },
    elements,
    base,
    moves,
    art: { body: 'blob', limbs: 0, pattern: 'plain', eyes: 1, key: id },
  };
}

/** Small content: `striker` one-shots anything and always moves first; `plain` and `odd` only heal. */
const FX: Content = {
  zones: [],
  bosses: [],
  starters: ['striker', 'plain'],
  moves: [
    move({ id: 'poke', element: 'umbra', kind: 'damage', power: 200 }),
    move({ id: 'mend', element: 'thorn', kind: 'heal', power: 50, target: 'self' }),
  ],
  species: [
    // max hp 200
    species('striker', ['umbra'], { health: 50, power: 200, guard: 40, speed: 99, focus: 20 }, ['poke']),
    // max hp 200
    species('plain', ['thorn'], { health: 50, power: 40, guard: 40, speed: 30, focus: 20 }, ['mend']),
    // max hp 132: a recruit offer is floor(132 / 2) = 66
    species('odd', ['thorn'], { health: 33, power: 40, guard: 40, speed: 30, focus: 20 }, ['mend']),
  ],
};

const MOVE0: Action = { type: 'move', moveIndex: 0 };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** A zone and node of `type` from the run's maps (layer 0 is all wild, layer 6 is the boss). */
function nodeOfType(run: RunState, type: NodeType, zone: number): MapNode {
  const node = run.maps[zone]!.layers.flat().find((n) => n.type === type);
  if (!node) throw new Error(`no ${type} node in zone ${zone}`);
  return node;
}

/** First seed whose zone 0 has an elite node. */
function eliteSeed(): string {
  for (let i = 0; i < 500; i++) {
    const seed = `elite-${i}`;
    const run = startRun(seed, 'striker', FX);
    if (run.maps[0]!.layers.flat().some((n) => n.type === 'elite')) return seed;
  }
  throw new Error('no elite seed');
}

interface Setup {
  seed?: string;
  type: NodeType;
  zone?: number;
  /** Player team in order; `fainted` members are pre-knocked out, `active` is the acting member. */
  party: Array<{ speciesId: string; hp: number; fainted?: boolean }>;
  active?: number;
  enemy?: string[];
  enemyHp?: number[];
}

/**
 * A run in the battle phase at a node of `type`, one action away from the end:
 * the player's `striker` kills the 1-hp enemy, or the enemy `striker` kills the last
 * living player creature.
 */
function battleRun(s: Setup): RunState {
  const zone = s.zone ?? 0;
  const run = startRun(s.seed ?? 'resolve', 'striker', FX);
  const node = nodeOfType(run, s.type, zone);
  run.zone = zone;
  const layer = node.layer;
  run.at = layer === 0 ? null : run.maps[zone]!.layers[layer - 1]!.find((p) => p.next.includes(node.id))!.id;
  run.party = s.party.map((m) => ({ speciesId: m.speciesId, hp: m.hp }));
  const enemy = s.enemy ?? ['odd'];
  const battle = createBattle(
    `${run.seed}:${node.id}`,
    { speciesIds: s.party.map((m) => m.speciesId), hp: s.party.map((m) => m.hp) },
    { speciesIds: enemy, hp: s.enemyHp ?? enemy.map(() => 1) },
    FX,
  );
  s.party.forEach((m, i) => {
    if (!m.fainted) return;
    const c = battle.teams.player[i]!;
    c.hp = 0;
    c.fainted = true;
  });
  battle.active.player = s.active ?? 0;
  run.phase = { kind: 'battle', nodeId: node.id, battle };
  return run;
}

function battleOf(run: RunState): BattleState {
  if (run.phase.kind !== 'battle') throw new Error('expected battle');
  return run.phase.battle;
}

function finish(run: RunState) {
  return applyRunAction(run, { type: 'battle', action: MOVE0 }, FX);
}

function resolution(events: RunEvent[]): RunEvent[] {
  return events.filter((e) => e.type !== 'battle');
}

function soulTotal(events: RunEvent[]): number {
  return events.reduce((sum, e) => sum + (e.type === 'soul' ? e.amount : 0), 0);
}

describe('resolveBattle through applyRunAction: wild', () => {
  it('drops a fallen member, pays its soul and offers the defeated species at half hp', () => {
    const run = battleRun({
      type: 'wild',
      party: [
        { speciesId: 'plain', hp: 40, fainted: true },
        { speciesId: 'striker', hp: 150 },
      ],
      active: 1,
    });
    run.souls = 3;
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const direct = applyAction(battleOf(run), MOVE0, FX);
    expect(direct.state.winner).toBe('player');

    const { run: after, events } = finish(run);
    // Battle events first, then the resolution events.
    expect(events.slice(0, direct.events.length)).toEqual(direct.events.map((event) => ({ type: 'battle', event })));
    expect(events.slice(direct.events.length)).toEqual([
      { type: 'lost', speciesId: 'plain' },
      { type: 'soul', amount: 1, reason: 'fallen' },
    ]);
    expect(after.party).toEqual([{ speciesId: 'striker', hp: 150 }]);
    expect(after.souls).toBe(4);
    expect(after.stats).toEqual({ nodesCleared: 1, elitesBeaten: 0, bossesBeaten: 0, creaturesLost: 1 });
    expect(after.phase).toEqual({ kind: 'recruit', speciesId: 'odd', hp: 66 });
    expect(after.at).toBe(nodeId);
    expect(after.zone).toBe(0);
  });

  it('keeps survivors in order with their exact hp', () => {
    const run = battleRun({
      type: 'wild',
      party: [
        { speciesId: 'striker', hp: 77 },
        { speciesId: 'plain', hp: 10, fainted: true },
        { speciesId: 'odd', hp: 123 },
      ],
    });
    const { run: after, events } = finish(run);
    expect(after.party).toEqual([
      { speciesId: 'striker', hp: 77 },
      { speciesId: 'odd', hp: 123 },
    ]);
    expect(resolution(events)).toEqual([
      { type: 'lost', speciesId: 'plain' },
      { type: 'soul', amount: 1, reason: 'fallen' },
    ]);
    expect(after.stats.creaturesLost).toBe(1);
  });

  it('a clean wild win emits no resolution events and offers the recruit', () => {
    const run = battleRun({ type: 'wild', party: [{ speciesId: 'striker', hp: 200 }], enemy: ['plain'] });
    const { run: after, events } = finish(run);
    expect(resolution(events)).toEqual([]);
    expect(after.souls).toBe(0);
    expect(after.party).toEqual([{ speciesId: 'striker', hp: 200 }]);
    // Player-side max hp (200), not a scaled enemy max hp.
    expect(after.phase).toEqual({ kind: 'recruit', speciesId: 'plain', hp: 100 });
    expect(after.stats).toEqual({ nodesCleared: 1, elitesBeaten: 0, bossesBeaten: 0, creaturesLost: 0 });
  });

  it('offers the recruit at half the player-side max hp even when the enemy was scaled', () => {
    const run = startRun('scaled', 'striker', FX);
    const node = run.maps[0]!.layers[0]![0]!;
    const battle = createBattle('scaled', { speciesIds: ['striker'] }, { speciesIds: ['odd'], hp: [1], hpPercent: 300 }, FX);
    expect(battle.teams.enemy[0]!.maxHp).toBe(396);
    run.phase = { kind: 'battle', nodeId: node.id, battle };
    expect(finish(run).run.phase).toEqual({ kind: 'recruit', speciesId: 'odd', hp: 66 });
    expect(maxHpOf('odd', FX)).toBe(132);
  });
});

describe('resolveBattle through applyRunAction: defeat', () => {
  it('a lost battle ends the run, losing every member with a soul each', () => {
    const run = battleRun({
      type: 'wild',
      party: [
        { speciesId: 'odd', hp: 20, fainted: true },
        { speciesId: 'plain', hp: 1 },
        { speciesId: 'striker', hp: 9, fainted: true },
      ],
      active: 1,
      enemy: ['striker'],
      enemyHp: [200],
    });
    run.souls = 2;
    run.stats = { nodesCleared: 4, elitesBeaten: 1, bossesBeaten: 0, creaturesLost: 1 };
    run.at = 'z0-l3-c0';
    const { run: after, events } = finish(run);
    expect(battleOf(run).winner).toBeNull();
    expect(resolution(events)).toEqual([
      { type: 'lost', speciesId: 'odd' },
      { type: 'soul', amount: 1, reason: 'fallen' },
      { type: 'lost', speciesId: 'plain' },
      { type: 'soul', amount: 1, reason: 'fallen' },
      { type: 'lost', speciesId: 'striker' },
      { type: 'soul', amount: 1, reason: 'fallen' },
      { type: 'ended', result: 'lost' },
    ]);
    expect(after.party).toEqual([]);
    expect(after.souls).toBe(5);
    expect(after.stats).toEqual({ nodesCleared: 4, elitesBeaten: 1, bossesBeaten: 0, creaturesLost: 4 });
    expect(after.phase).toEqual({ kind: 'ended', result: 'lost' });
    expect(after.at).toBe('z0-l3-c0');
    expect(after.zone).toBe(0);
  });

  it('a lost boss battle ends the run without boss rewards', () => {
    const run = battleRun({
      type: 'boss',
      zone: 1,
      party: [{ speciesId: 'plain', hp: 1 }],
      enemy: ['striker'],
      enemyHp: [200],
    });
    const at = run.at;
    const { run: after, events } = finish(run);
    expect(resolution(events)).toEqual([
      { type: 'lost', speciesId: 'plain' },
      { type: 'soul', amount: 1, reason: 'fallen' },
      { type: 'ended', result: 'lost' },
    ]);
    expect(after.zone).toBe(1);
    expect(after.at).toBe(at);
    expect(after.souls).toBe(1);
    expect(after.stats).toEqual({ nodesCleared: 0, elitesBeaten: 0, bossesBeaten: 0, creaturesLost: 1 });
  });
});

describe('resolveBattle through applyRunAction: elite and boss', () => {
  it('an elite win pays 1 soul, counts the elite and returns to the map', () => {
    const run = battleRun({
      seed: eliteSeed(),
      type: 'elite',
      party: [
        { speciesId: 'striker', hp: 100 },
        { speciesId: 'plain', hp: 5, fainted: true },
      ],
      enemy: ['odd', 'odd'],
    });
    battleOf(run).teams.enemy[0]!.hp = 0;
    battleOf(run).teams.enemy[0]!.fainted = true;
    battleOf(run).active.enemy = 1;
    run.souls = 1;
    run.stats.elitesBeaten = 2;
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const { run: after, events } = finish(run);
    expect(resolution(events)).toEqual([
      { type: 'lost', speciesId: 'plain' },
      { type: 'soul', amount: 1, reason: 'fallen' },
      { type: 'soul', amount: 1, reason: 'elite' },
    ]);
    expect(after.souls).toBe(3);
    expect(after.stats).toEqual({ nodesCleared: 1, elitesBeaten: 3, bossesBeaten: 0, creaturesLost: 1 });
    expect(after.phase).toEqual({ kind: 'map' });
    expect(after.at).toBe(nodeId);
    expect(after.party).toEqual([{ speciesId: 'striker', hp: 100 }]);
  });

  it('the zone 0 boss pays 2 souls, clears the zone and moves to zone 1', () => {
    const run = battleRun({ type: 'boss', zone: 0, party: [{ speciesId: 'striker', hp: 180 }] });
    run.stats.nodesCleared = 6;
    const { run: after, events } = finish(run);
    expect(resolution(events)).toEqual([
      { type: 'soul', amount: 2, reason: 'boss' },
      { type: 'zoneCleared', zone: 0 },
    ]);
    expect(after.souls).toBe(2);
    expect(after.zone).toBe(1);
    expect(after.at).toBeNull();
    expect(after.phase).toEqual({ kind: 'map' });
    expect(after.stats).toEqual({ nodesCleared: 7, elitesBeaten: 0, bossesBeaten: 1, creaturesLost: 0 });
    expect(after.party).toEqual([{ speciesId: 'striker', hp: 180 }]);
    // The next zone starts at its layer 0.
    expect(legalRunActions(after, FX)).toEqual(after.maps[1]!.layers[0]!.map((n) => ({ type: 'node', nodeId: n.id })));
  });

  it('the zone 1 boss moves to zone 2', () => {
    const run = battleRun({ type: 'boss', zone: 1, party: [{ speciesId: 'striker', hp: 50 }] });
    const { run: after, events } = finish(run);
    expect(resolution(events)).toEqual([
      { type: 'soul', amount: 2, reason: 'boss' },
      { type: 'zoneCleared', zone: 1 },
    ]);
    expect(after.zone).toBe(2);
    expect(after.at).toBeNull();
    expect(after.phase).toEqual({ kind: 'map' });
  });

  it('the zone 2 boss wins the run', () => {
    const run = battleRun({
      type: 'boss',
      zone: 2,
      party: [
        { speciesId: 'plain', hp: 3, fainted: true },
        { speciesId: 'striker', hp: 60 },
      ],
      active: 1,
    });
    run.souls = 7;
    run.stats = { nodesCleared: 20, elitesBeaten: 2, bossesBeaten: 2, creaturesLost: 1 };
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const { run: after, events } = finish(run);
    expect(resolution(events)).toEqual([
      { type: 'lost', speciesId: 'plain' },
      { type: 'soul', amount: 1, reason: 'fallen' },
      { type: 'soul', amount: 2, reason: 'boss' },
      { type: 'zoneCleared', zone: 2 },
      { type: 'ended', result: 'won' },
    ]);
    expect(after.souls).toBe(10);
    expect(after.stats).toEqual({ nodesCleared: 21, elitesBeaten: 2, bossesBeaten: 3, creaturesLost: 2 });
    expect(after.phase).toEqual({ kind: 'ended', result: 'won' });
    expect(after.zone).toBe(2);
    expect(after.at).toBe(nodeId);
    expect(after.party).toEqual([{ speciesId: 'striker', hp: 60 }]);
  });
});

describe('resolveBattle: invariants', () => {
  const CASES: Array<[string, () => RunState]> = [
    ['wild with losses', () => battleRun({ type: 'wild', party: [{ speciesId: 'plain', hp: 1, fainted: true }, { speciesId: 'striker', hp: 9 }], active: 1 })],
    ['defeat', () => battleRun({ type: 'wild', party: [{ speciesId: 'plain', hp: 1 }, { speciesId: 'odd', hp: 1, fainted: true }], enemy: ['striker'], enemyHp: [200] })],
    ['elite', () => battleRun({ seed: eliteSeed(), type: 'elite', party: [{ speciesId: 'odd', hp: 1, fainted: true }, { speciesId: 'striker', hp: 9 }], active: 1 })],
    ['boss zone 0', () => battleRun({ type: 'boss', party: [{ speciesId: 'striker', hp: 9 }, { speciesId: 'plain', hp: 1, fainted: true }] })],
    ['boss zone 2', () => battleRun({ type: 'boss', zone: 2, party: [{ speciesId: 'striker', hp: 9 }] })],
  ];

  it.each(CASES)('%s: souls grow by exactly the sum of soul events', (_, make) => {
    const run = make();
    run.souls = 11;
    const { run: after, events } = finish(run);
    expect(after.souls - 11).toBe(soulTotal(events));
    expect(soulTotal(events)).toBeGreaterThan(0);
    const lost = events.filter((e) => e.type === 'lost').length;
    expect(after.stats.creaturesLost - run.stats.creaturesLost).toBe(lost);
  });

  it.each(CASES)('%s: rejects battle actions afterwards as phase', (_, make) => {
    const after = finish(make()).run;
    expect(after.phase.kind).not.toBe('battle');
    for (const action of [MOVE0, { type: 'swap', toIndex: 1 } as Action]) {
      const step = applyRunAction(after, { type: 'battle', action }, FX);
      const expected = after.phase.kind === 'ended' ? 'ended' : 'phase';
      expect(step.events).toEqual([{ type: 'rejected', reason: expected }]);
      expect(step.run).toEqual(after);
    }
  });

  it.each(CASES)('%s: never mutates a deeply frozen input', (_, make) => {
    const run = deepFreeze(make());
    const copy = structuredClone(run);
    const step = finish(run);
    expect(run).toEqual(copy);
    expect(step.run.phase.kind).not.toBe('battle');
  });

  it.each(CASES)('%s: is deterministic', (_, make) => {
    const run = make();
    expect(finish(run)).toEqual(finish(run));
  });

  it('resolveBattle itself is pure: frozen run and battle stay untouched, fresh state returned', () => {
    const run = battleRun({ type: 'boss', zone: 2, party: [{ speciesId: 'striker', hp: 9 }] });
    const nodeId = (run.phase as { nodeId: string }).nodeId;
    const done = deepFreeze(applyAction(battleOf(run), MOVE0, FX).state);
    const frozen = deepFreeze(run);
    const copy = structuredClone(frozen);
    const out = resolveBattle(frozen, nodeId, done, FX);
    expect(frozen).toEqual(copy);
    expect(out.run).not.toBe(frozen);
    expect(out.run.phase).toEqual({ kind: 'ended', result: 'won' });
    expect(out.events).toEqual([
      { type: 'soul', amount: 2, reason: 'boss' },
      { type: 'zoneCleared', zone: 2 },
      { type: 'ended', result: 'won' },
    ]);
  });

  it('a battle action that does not end the battle leaves the run in the battle phase', () => {
    const run = battleRun({ type: 'wild', party: [{ speciesId: 'plain', hp: 100 }], enemy: ['odd'], enemyHp: [100] });
    const step = finish(run);
    expect(step.run.phase.kind).toBe('battle');
    expect(resolution(step.events)).toEqual([]);
    expect(step.run.party).toEqual(run.party);
    expect(step.run.stats).toEqual(run.stats);
  });
});
