import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../src/content';
import { applyAction, legalActions } from '../../../src/sim/battle';
import { createRng } from '../../../src/sim/rng';
import { buildEncounter } from '../../../src/sim/run/encounters';
import { generateZoneMap } from '../../../src/sim/run/map';
import { applyRunAction, availableNodes, legalRunActions, maxHpOf, startRun } from '../../../src/sim/run/run';
import type { MapNode, NodeType, RunAction, RunEvent, RunState } from '../../../src/sim/run/types';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

function nodeById(run: RunState, id: string): MapNode {
  const n = run.maps.flatMap((m) => m.layers.flat()).find((x) => x.id === id);
  if (!n) throw new Error('no node ' + id);
  return n;
}

/** First run (seed scan) whose zone-0 nodes at layer >= 1 include `type`, positioned so that node is available. */
function runAtType(type: NodeType): { run: RunState; node: MapNode } {
  for (let i = 0; i < 500; i++) {
    const run = startRun(`find-${type}-${i}`, 'cindermite', CONTENT);
    const layers = run.maps[0]!.layers;
    for (let l = 1; l < layers.length; l++) {
      for (const node of layers[l]!) {
        if (node.type !== type) continue;
        const pred = layers[l - 1]!.find((p) => p.next.includes(node.id))!;
        run.at = pred.id;
        return { run, node };
      }
    }
  }
  throw new Error('no node of type ' + type);
}

function enter(run: RunState, nodeId: string) {
  return applyRunAction(run, { type: 'node', nodeId }, CONTENT);
}

function rejected(reason: 'illegal' | 'phase' | 'ended') {
  return [{ type: 'rejected', reason }];
}

function wildBattleRun(): RunState {
  const run = startRun('battle-run', 'cindermite', CONTENT);
  return enter(run, run.maps[0]!.layers[0]![0]!.id).run;
}

describe('startRun', () => {
  it('builds the initial state', () => {
    const run = startRun('start-1', 'cindermite', CONTENT);
    expect(run.version).toBe(1);
    expect(run.seed).toBe('start-1');
    expect(run.rng).toEqual(createRng('start-1').fork('run').getState());
    expect(run.maps).toHaveLength(3);
    expect(run.maps).toEqual([0, 1, 2].map((z) => generateZoneMap('start-1', z)));
    expect(run.zone).toBe(0);
    expect(run.at).toBeNull();
    expect(run.party).toEqual([{ speciesId: 'cindermite', hp: 192 }]);
    expect(run.souls).toBe(0);
    expect(run.stats).toEqual({ nodesCleared: 0, elitesBeaten: 0, bossesBeaten: 0, creaturesLost: 0 });
    expect(run.phase).toEqual({ kind: 'map' });
  });

  it('starts every starter at full player-side HP', () => {
    for (const id of CONTENT.starters) {
      const run = startRun('s', id, CONTENT);
      expect(run.party[0]!.hp).toBe(maxHpOf(id, CONTENT));
    }
    expect(maxHpOf('cindermite', CONTENT)).toBe(192);
  });

  it('throws on a starter not in content.starters', () => {
    expect(() => startRun('s', 'emberveil', CONTENT)).toThrow(/starter/);
    expect(() => startRun('s', 'nope', CONTENT)).toThrow(/starter/);
  });
});

describe('availableNodes', () => {
  it('is layer 0 at a zone start, then the next list of the node at', () => {
    const run = startRun('avail', 'cindermite', CONTENT);
    expect(availableNodes(run)).toEqual(run.maps[0]!.layers[0]);
    for (const node of run.maps[0]!.layers[2]!) {
      const r = structuredClone(run);
      r.at = node.id;
      expect(availableNodes(r).map((n) => n.id)).toEqual(node.next);
    }
  });

  it('uses the current zone map', () => {
    const run = startRun('avail-z', 'cindermite', CONTENT);
    run.zone = 1;
    expect(availableNodes(run)).toEqual(run.maps[1]!.layers[0]);
  });

  it('is empty outside the map phase', () => {
    const run = wildBattleRun();
    expect(availableNodes(run)).toEqual([]);
    run.phase = { kind: 'ended', result: 'won' };
    expect(availableNodes(run)).toEqual([]);
  });
});

describe('legalRunActions', () => {
  it('lists one node action per available node in the map phase', () => {
    const run = startRun('legal', 'cindermite', CONTENT);
    expect(legalRunActions(run, CONTENT)).toEqual(run.maps[0]!.layers[0]!.map((n) => ({ type: 'node', nodeId: n.id })));
  });

  it('wraps the battle legal actions in the battle phase', () => {
    const run = wildBattleRun();
    if (run.phase.kind !== 'battle') throw new Error('expected battle');
    expect(legalRunActions(run, CONTENT)).toEqual(
      legalActions(run.phase.battle, CONTENT).map((action) => ({ type: 'battle', action })),
    );
  });

  it('is empty after the run ended', () => {
    const run = startRun('legal-x', 'cindermite', CONTENT);
    for (const result of ['won', 'lost'] as const) {
      expect(legalRunActions({ ...run, phase: { kind: 'ended', result } }, CONTENT)).toEqual([]);
    }
  });
});

describe('applyRunAction: entering nodes', () => {
  it('enters a wild node: battle with the party HP and the encounter enemy', () => {
    const start = startRun('enter-wild', 'cindermite', CONTENT);
    start.party[0]!.hp = 50;
    const node = start.maps[0]!.layers[0]![0]!;
    const { run, events } = enter(start, node.id);
    expect(events).toEqual([{ type: 'enter', nodeId: node.id, nodeType: 'wild' }]);
    if (run.phase.kind !== 'battle') throw new Error('expected battle');
    expect(run.phase.nodeId).toBe(node.id);
    const b = run.phase.battle;
    const enc = buildEncounter(start, node, CONTENT);
    expect(b.seed).toBe(`enter-wild:${node.id}`);
    expect(b.telegraph).toBe(false);
    expect(b.script).toBeUndefined();
    expect(b.teams.player.map((c) => [c.speciesId, c.hp, c.maxHp])).toEqual([['cindermite', 50, 192]]);
    expect(b.teams.enemy.map((c) => c.speciesId)).toEqual(enc.enemy.speciesIds);
    const health = CONTENT.species.find((s) => s.id === enc.enemy.speciesIds[0])!.base.health;
    expect(b.teams.enemy[0]!.maxHp).toBe(Math.floor((health * 4 * enc.enemy.hpPercent!) / 100));
    expect(run.at).toBeNull();
    expect(run.stats).toEqual(start.stats);
  });

  it('passes a multi-member party in order', () => {
    const start = startRun('enter-party', 'cindermite', CONTENT);
    start.party = [
      { speciesId: 'cindermite', hp: 30 },
      { speciesId: 'tidewisp', hp: 40 },
      { speciesId: 'brambleback', hp: 50 },
    ];
    const { run } = enter(start, start.maps[0]!.layers[0]![0]!.id);
    if (run.phase.kind !== 'battle') throw new Error('expected battle');
    expect(run.phase.battle.teams.player.map((c) => [c.speciesId, c.hp])).toEqual([
      ['cindermite', 30],
      ['tidewisp', 40],
      ['brambleback', 50],
    ]);
  });

  it('enters an elite node: telegraphed two-creature battle', () => {
    const { run: start, node } = runAtType('elite');
    const { run, events } = enter(start, node.id);
    expect(events).toEqual([{ type: 'enter', nodeId: node.id, nodeType: 'elite' }]);
    if (run.phase.kind !== 'battle') throw new Error('expected battle');
    expect(run.phase.battle.telegraph).toBe(true);
    expect(run.phase.battle.teams.enemy).toHaveLength(2);
  });

  it('enters the boss node with its script', () => {
    const start = startRun('enter-boss', 'cindermite', CONTENT);
    start.zone = 2;
    start.at = start.maps[2]!.layers[5]![0]!.id;
    const boss = start.maps[2]!.layers[6]![0]!;
    const { run, events } = enter(start, boss.id);
    expect(events).toEqual([{ type: 'enter', nodeId: boss.id, nodeType: 'boss' }]);
    if (run.phase.kind !== 'battle') throw new Error('expected battle');
    expect(run.phase.battle.script).toEqual([0, 2, 3, 1]);
    expect(run.phase.battle.telegraph).toBe(true);
    expect(run.phase.battle.teams.enemy.map((c) => c.speciesId)).toEqual(['emberveil']);
  });

  it.each(['shrine', 'cache', 'mystery'] as const)('entering a %s node sets that phase', (type) => {
    const { run: start, node } = runAtType(type);
    const { run, events } = enter(start, node.id);
    expect(events).toEqual([{ type: 'enter', nodeId: node.id, nodeType: type }]);
    expect(run.phase).toEqual({ kind: type, nodeId: node.id });
    expect(run.at).toBe(start.at);
    expect(run.stats).toEqual(start.stats);
    expect(run.souls).toBe(start.souls);
    expect(run.party).toEqual(start.party);
  });

  it('gives the same battle when a node is reached through different paths', () => {
    let checked = 0;
    for (let i = 0; i < 200 && checked < 20; i++) {
      const base = startRun(`paths-${i}`, 'cindermite', CONTENT);
      const layers = base.maps[0]!.layers;
      for (let l = 1; l < 6; l++) {
        for (const node of layers[l]!) {
          if (node.type !== 'wild' && node.type !== 'elite') continue;
          const preds = layers[l - 1]!.filter((p) => p.next.includes(node.id));
          if (preds.length < 2) continue;
          const a = structuredClone(base);
          a.at = preds[0]!.id;
          const b = structuredClone(base);
          b.at = preds[1]!.id;
          b.rng = createRng('other').getState();
          const ra = enter(a, node.id).run;
          const rb = enter(b, node.id).run;
          if (ra.phase.kind !== 'battle' || rb.phase.kind !== 'battle') throw new Error('expected battles');
          expect(ra.phase.battle).toEqual(rb.phase.battle);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('applyRunAction: battle steps', () => {
  it('applies a battle action and wraps every event', () => {
    // First seed whose opening battle action leaves the battle live.
    let run: RunState | undefined;
    for (let i = 0; i < 100 && !run; i++) {
      const r = startRun(`battle-step-${i}`, 'brambleback', CONTENT);
      const b = enter(r, r.maps[0]!.layers[0]![0]!.id).run;
      if (b.phase.kind !== 'battle') throw new Error('expected battle');
      const a = legalActions(b.phase.battle, CONTENT)[0]!;
      if (applyAction(b.phase.battle, a, CONTENT).state.winner === null) run = b;
    }
    if (!run || run.phase.kind !== 'battle') throw new Error('expected a live battle');
    const action = legalActions(run.phase.battle, CONTENT)[0]!;
    const direct = applyAction(run.phase.battle, action, CONTENT);
    expect(direct.state.winner).toBeNull();
    const step = applyRunAction(run, { type: 'battle', action }, CONTENT);
    expect(step.events).toEqual(direct.events.map((event) => ({ type: 'battle', event })));
    expect(step.run.phase).toEqual({ kind: 'battle', nodeId: run.phase.nodeId, battle: direct.state });
    expect(step.run.party).toEqual(run.party);
  });

  it('rejects as illegal a battle action the engine rejects', () => {
    const run = wildBattleRun();
    for (const action of [
      { type: 'move', moveIndex: 99 },
      { type: 'move', moveIndex: -1 },
      { type: 'swap', toIndex: 0 },
      { type: 'swap', toIndex: 1 },
    ]) {
      const step = applyRunAction(run, { type: 'battle', action } as RunAction, CONTENT);
      expect(step.events).toEqual(rejected('illegal'));
      expect(step.run).toEqual(run);
    }
  });

  it('resolves the battle as soon as it ends; battle actions are then rejected as phase', () => {
    let run = wildBattleRun();
    let last: RunEvent[] = [];
    for (let i = 0; i < 500 && run.phase.kind === 'battle'; i++) {
      const step = applyRunAction(run, legalRunActions(run, CONTENT)[0]!, CONTENT);
      run = step.run;
      last = step.events;
    }
    expect(['recruit', 'ended']).toContain(run.phase.kind);
    expect(last.some((e) => e.type === 'battle' && e.event.type === 'end')).toBe(true);
    if (run.phase.kind === 'ended') return;
    const step = applyRunAction(run, { type: 'battle', action: { type: 'move', moveIndex: 0 } }, CONTENT);
    expect(step.events).toEqual(rejected('phase'));
    expect(step.run).toEqual(run);
  });
});

describe('applyRunAction: rejections (review focus 2)', () => {
  it('rejects a node that is not available', () => {
    const run = startRun('rej-1', 'cindermite', CONTENT);
    for (const nodeId of [run.maps[0]!.layers[1]![0]!.id, run.maps[1]!.layers[0]![0]!.id, 'z0-l9-c0', '']) {
      const step = enter(run, nodeId);
      expect(step.events).toEqual(rejected('illegal'));
      expect(step.run).toEqual(run);
    }
  });

  it('rejects a node action during a battle', () => {
    const run = wildBattleRun();
    const step = enter(run, run.maps[0]!.layers[0]![1]!.id);
    expect(step.events).toEqual(rejected('phase'));
    expect(step.run).toEqual(run);
  });

  it('rejects a battle action during the map phase', () => {
    const run = startRun('rej-3', 'cindermite', CONTENT);
    const step = applyRunAction(run, { type: 'battle', action: { type: 'move', moveIndex: 0 } }, CONTENT);
    expect(step.events).toEqual(rejected('phase'));
    expect(step.run).toEqual(run);
  });

  it('rejects other phases actions in the map phase as phase', () => {
    const run = startRun('rej-4', 'cindermite', CONTENT);
    for (const action of [
      { type: 'recruit', take: true },
      { type: 'shrine', choice: 'rest' },
      { type: 'evolve', memberIndex: 0 },
      { type: 'cache' },
      { type: 'mystery', choice: 'open' },
    ] as RunAction[]) {
      const step = applyRunAction(run, action, CONTENT);
      expect(step.events).toEqual(rejected('phase'));
      expect(step.run).toEqual(run);
    }
  });

  it('rejects a node action in a shrine phase as phase', () => {
    const { run: start, node } = runAtType('shrine');
    const run = enter(start, node.id).run;
    const step = enter(run, node.id);
    expect(step.events).toEqual(rejected('phase'));
    expect(step.run).toEqual(run);
  });

  it('rejects any action after the run ended', () => {
    const run = startRun('rej-5', 'cindermite', CONTENT);
    run.phase = { kind: 'ended', result: 'lost' };
    const actions: unknown[] = [
      { type: 'node', nodeId: run.maps[0]!.layers[0]![0]!.id },
      { type: 'battle', action: { type: 'move', moveIndex: 0 } },
      { type: 'shrine', choice: 'leave' },
      { type: 'cache' },
      null,
      { type: 'bogus' },
    ];
    for (const action of actions) {
      const step = applyRunAction(run, action as RunAction, CONTENT);
      expect(step.events).toEqual(rejected('ended'));
      expect(step.run).toEqual(run);
    }
  });
});

describe('applyRunAction: purity, determinism, malformed input', () => {
  it('never mutates a deeply frozen input', () => {
    const map = deepFreeze(startRun('pure', 'cindermite', CONTENT));
    const a = enter(map, map.maps[0]!.layers[0]![0]!.id);
    expect(a.run.phase.kind).toBe('battle');
    const battle = deepFreeze(a.run);
    const action = legalRunActions(battle, CONTENT)[0]!;
    expect(() => applyRunAction(battle, action, CONTENT)).not.toThrow();
    expect(() => enter(battle, 'nope')).not.toThrow();
  });

  it('returns a fresh state, not the input object', () => {
    const run = startRun('fresh', 'cindermite', CONTENT);
    const step = enter(run, 'nope');
    expect(step.run).not.toBe(run);
    expect(step.run).toEqual(run);
  });

  it('is deterministic: same run and action twice give deep-equal results', () => {
    const run = startRun('det', 'cindermite', CONTENT);
    const action: RunAction = { type: 'node', nodeId: run.maps[0]!.layers[0]![1]!.id };
    expect(applyRunAction(run, action, CONTENT)).toEqual(applyRunAction(run, action, CONTENT));
    const b = applyRunAction(run, action, CONTENT).run;
    const ba = legalRunActions(b, CONTENT)[0]!;
    expect(applyRunAction(b, ba, CONTENT)).toEqual(applyRunAction(b, ba, CONTENT));
  });

  const MALFORMED: unknown[] = [
    null,
    undefined,
    0,
    1,
    NaN,
    '',
    'node',
    true,
    [],
    [{ type: 'node' }],
    {},
    { type: 'node' },
    { type: 'node', nodeId: 5 },
    { type: 'node', nodeId: null },
    { type: 'node', nodeId: {} },
    { type: 'node', nodeId: ['z0-l0-c0'] },
    { type: 'node', nodeId: 'unknown' },
    { type: 'battle' },
    { type: 'battle', action: null },
    { type: 'battle', action: 'move' },
    { type: 'battle', action: {} },
    { type: 'battle', action: { type: 'move' } },
    { type: 'battle', action: { type: 'move', moveIndex: '0' } },
    { type: 'battle', action: { type: 'move', moveIndex: 1.5 } },
    { type: 'battle', action: { type: 'move', moveIndex: NaN } },
    { type: 'battle', action: { type: 'move', moveIndex: Infinity } },
    { type: 'battle', action: { type: 'swap' } },
    { type: 'battle', action: { type: 'swap', toIndex: 99 } },
    { type: 'battle', action: { type: 'fly', moveIndex: 0 } },
    { type: 'bogus' },
    { type: 42 },
    { type: null },
    { type: undefined, nodeId: 'z0-l0-c0' },
    { nodeId: 'z0-l0-c0' },
    { type: 'NODE', nodeId: 'z0-l0-c0' },
    { type: 'recruit' },
    { type: 'shrine', choice: 'dance' },
    // Prototype keys must not be mistaken for action types or node ids.
    { type: 'toString' },
    { type: 'constructor' },
    { type: '__proto__' },
    { type: 'hasOwnProperty' },
    { type: 'valueOf', nodeId: 'z0-l0-c0' },
    { type: 'node', nodeId: '__proto__' },
    { type: 'node', nodeId: 'toString' },
    { type: 'battle', action: { type: 'constructor' } },
    { type: 'battle', action: { type: '__proto__', moveIndex: 0 } },
    JSON.parse('{"__proto__": {"type": "node", "nodeId": "z0-l0-c0"}}'),
  ];

  it(`never throws on ${MALFORMED.length} malformed actions in the map and battle phases`, () => {
    expect(MALFORMED.length).toBeGreaterThanOrEqual(30);
    const runs = [startRun('fuzz', 'cindermite', CONTENT), wildBattleRun()];
    for (const run of runs) {
      for (const action of MALFORMED) {
        let step: ReturnType<typeof applyRunAction> | undefined;
        expect(() => {
          step = applyRunAction(run, action as RunAction, CONTENT);
        }).not.toThrow();
        expect(step!.events).toHaveLength(1);
        expect(step!.events[0]!.type).toBe('rejected');
        expect(['illegal', 'phase']).toContain((step!.events[0] as { reason: string }).reason);
        expect(step!.run).toEqual(run);
      }
    }
  });

  it('classifies malformed actions: wrong-phase type is phase, everything else illegal', () => {
    const map = startRun('fuzz-c', 'cindermite', CONTENT);
    const reason = (run: RunState, a: unknown) =>
      (applyRunAction(run, a as RunAction, CONTENT).events[0] as { reason: string }).reason;
    expect(reason(map, null)).toBe('illegal');
    expect(reason(map, { type: 'bogus' })).toBe('illegal');
    expect(reason(map, { type: 'node', nodeId: 5 })).toBe('illegal');
    expect(reason(map, { type: 'battle' })).toBe('phase');
    const battle = wildBattleRun();
    expect(reason(battle, { type: 'battle' })).toBe('illegal');
    expect(reason(battle, { type: 'node' })).toBe('phase');
  });
});

describe('random walk over legal actions', () => {
  const PHASES = ['map', 'battle', 'recruit', 'shrine', 'cache', 'mystery', 'ended'];

  function checkSane(run: RunState): void {
    if (run.phase.kind === 'ended' && run.phase.result === 'lost') expect(run.party).toEqual([]);
    else expect(run.party.length).toBeGreaterThanOrEqual(1);
    expect(run.party.length).toBeLessThanOrEqual(3);
    for (const m of run.party) {
      expect(Number.isInteger(m.hp)).toBe(true);
      expect(m.hp).toBeGreaterThanOrEqual(1);
      expect(m.hp).toBeLessThanOrEqual(maxHpOf(m.speciesId, CONTENT));
    }
    expect(PHASES).toContain(run.phase.kind);
    expect(run.zone).toBeGreaterThanOrEqual(0);
    expect(run.zone).toBeLessThanOrEqual(2);
    expect(run.souls).toBeGreaterThanOrEqual(0);
  }

  it('never offers an action that applyRunAction rejects (50 seeds, walked to the end of the run)', () => {
    let totalSteps = 0;
    const stops: Record<string, number> = {};
    const visited = new Set<string>();
    for (let s = 0; s < 50; s++) {
      const pick = createRng(`walk-pick-${s}`);
      const starter = CONTENT.starters[s % CONTENT.starters.length]!;
      let run = startRun(`walk-${s}`, starter, CONTENT);
      let souls = 0;
      checkSane(run);
      for (let step = 0; ; step++) {
        expect(step).toBeLessThan(2000);
        if (run.phase.kind === 'ended') break;
        const actions = legalRunActions(run, CONTENT);
        // No dead ends in any phase.
        expect(actions.length).toBeGreaterThan(0);
        // Every legal action is plain data and is accepted.
        for (const a of actions) {
          expect(JSON.parse(JSON.stringify(a))).toEqual(a);
          const r = applyRunAction(run, a, CONTENT);
          expect(r.events.some((e) => e.type === 'rejected')).toBe(false);
        }
        const chosen = actions[pick.nextInt(actions.length)]!;
        const next = applyRunAction(run, chosen, CONTENT);
        expect(next.events.some((e) => e.type === 'rejected')).toBe(false);
        visited.add(run.phase.kind);
        for (const e of next.events) {
          if (e.type === 'soul') souls += e.amount;
          if (e.type === 'evolved') souls -= CONTENT.species.find((x) => x.id === e.from)!.evolveCost!;
        }
        run = next.run;
        totalSteps++;
        checkSane(run);
        expect(run.souls).toBe(souls);
      }
      const end = run.phase;
      const stop = end.kind === 'ended' ? `ended-${end.result}` : end.kind;
      stops[stop] = (stops[stop] ?? 0) + 1;
    }
    expect(totalSteps).toBeGreaterThan(50);
    // Every walk reaches the end of the run.
    expect(Object.keys(stops).every((k) => k === 'ended-won' || k === 'ended-lost')).toBe(true);
    expect([...visited].sort()).toEqual(['battle', 'cache', 'map', 'mystery', 'recruit', 'shrine']);
  });
});
