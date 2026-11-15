import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../src/content';
import { restoreRng } from '../../../src/sim/rng';
import { applyRunAction, legalRunActions, startRun } from '../../../src/sim/run/run';
import type { PartyMember, RunAction, RunEvent, RunPhase, RunState } from '../../../src/sim/run/types';

// Player-side max HP is health * 4: cindermite 192, cindermaw 240, brambleback 224,
// bramblewarden 280, tidewisp 176, skirrow 144, dusklurk 168, emberveil 200.

function runIn(phase: RunPhase, party: PartyMember[], over: Partial<RunState> = {}): RunState {
  return { ...startRun('events', 'cindermite', CONTENT), party, phase, ...over };
}

function act(run: RunState, action: RunAction) {
  return applyRunAction(run, action, CONTENT);
}

function rejected(reason: 'illegal' | 'phase' | 'ended') {
  return [{ type: 'rejected', reason }];
}

function expectRejected(run: RunState, action: RunAction, reason: 'illegal' | 'phase' | 'ended' = 'illegal') {
  const before = structuredClone(run);
  const step = act(run, action);
  expect(step.events).toEqual(rejected(reason));
  expect(step.run).toEqual(before);
  expect(run).toEqual(before);
}

const offer: RunPhase = { kind: 'recruit', speciesId: 'skirrow', hp: 70 };
const three: PartyMember[] = [
  { speciesId: 'cindermite', hp: 100 },
  { speciesId: 'brambleback', hp: 200 },
  { speciesId: 'tidewisp', hp: 50 },
];

describe('recruit', () => {
  it('declines the offer', () => {
    const run = runIn(offer, [{ speciesId: 'cindermite', hp: 100 }], { at: 'z0-l0-c0' });
    const step = act(run, { type: 'recruit', take: false });
    expect(step.events).toEqual([{ type: 'declined', speciesId: 'skirrow' }]);
    expect(step.run.party).toEqual(run.party);
    expect(step.run.phase).toEqual({ kind: 'map' });
    expect(step.run.at).toBe('z0-l0-c0');
    expect(step.run.stats).toEqual(run.stats);
  });

  it('appends the member at the offered HP when a slot is free', () => {
    const run = runIn(offer, [{ speciesId: 'cindermite', hp: 100 }]);
    const step = act(run, { type: 'recruit', take: true });
    expect(step.events).toEqual([{ type: 'recruited', speciesId: 'skirrow' }]);
    expect(step.run.party).toEqual([
      { speciesId: 'cindermite', hp: 100 },
      { speciesId: 'skirrow', hp: 70 },
    ]);
    expect(step.run.phase).toEqual({ kind: 'map' });
  });

  it('replaces the chosen member when the party is full', () => {
    const run = runIn(offer, three);
    const step = act(run, { type: 'recruit', take: true, replaceIndex: 1 });
    expect(step.events).toEqual([{ type: 'recruited', speciesId: 'skirrow', replaced: 'brambleback' }]);
    expect(step.run.party.map((m) => m.speciesId)).toEqual(['cindermite', 'skirrow', 'tidewisp']);
    expect(step.run.party[1]).toEqual({ speciesId: 'skirrow', hp: 70 });
    expect(step.run.souls).toBe(run.souls);
  });

  it('rejects a full party without replaceIndex or with a bad one', () => {
    const run = runIn(offer, three);
    expectRejected(run, { type: 'recruit', take: true });
    for (const replaceIndex of [-1, 3, 1.5, Number.NaN, 99]) {
      expectRejected(run, { type: 'recruit', take: true, replaceIndex });
    }
  });

  it('rejects recruit actions outside the recruit phase', () => {
    expectRejected(runIn({ kind: 'map' }, three), { type: 'recruit', take: false }, 'phase');
    expectRejected(runIn({ kind: 'cache', nodeId: 'z0-l1-c0' }, three), { type: 'recruit', take: true }, 'phase');
  });
});

describe('shrine', () => {
  const shrine: RunPhase = { kind: 'shrine', nodeId: 'z0-l2-c0' };

  it('rest heals half of max HP per member, capped, one healed event each', () => {
    // cindermite 192: +96 -> 196 capped to 192 (gain 92); brambleback 224: +112 -> 200+24 capped (gain 24); tidewisp 176: +88.
    const run = runIn(shrine, [
      { speciesId: 'cindermite', hp: 100 },
      { speciesId: 'brambleback', hp: 200 },
      { speciesId: 'tidewisp', hp: 50 },
    ]);
    const step = act(run, { type: 'shrine', choice: 'rest' });
    expect(step.events).toEqual([
      { type: 'healed', memberIndex: 0, amount: 92 },
      { type: 'healed', memberIndex: 1, amount: 24 },
      { type: 'healed', memberIndex: 2, amount: 88 },
    ]);
    expect(step.run.party.map((m) => m.hp)).toEqual([192, 224, 138]);
    expect(step.run.phase).toEqual({ kind: 'map' });
    expect(step.run.at).toBe('z0-l2-c0');
    expect(step.run.stats.nodesCleared).toBe(run.stats.nodesCleared + 1);
  });

  it('emits no healed event for a member already at full HP', () => {
    const run = runIn(shrine, [
      { speciesId: 'cindermite', hp: 192 },
      { speciesId: 'tidewisp', hp: 1 },
    ]);
    const step = act(run, { type: 'shrine', choice: 'rest' });
    expect(step.events).toEqual([{ type: 'healed', memberIndex: 1, amount: 88 }]);
    expect(step.run.party.map((m) => m.hp)).toEqual([192, 89]);
  });

  it('leave changes nothing but clears the node', () => {
    const run = runIn(shrine, three);
    const step = act(run, { type: 'shrine', choice: 'leave' });
    expect(step.events).toEqual([]);
    expect(step.run.party).toEqual(three);
    expect(step.run.souls).toBe(run.souls);
    expect(step.run.phase).toEqual({ kind: 'map' });
    expect(step.run.at).toBe('z0-l2-c0');
    expect(step.run.stats.nodesCleared).toBe(run.stats.nodesCleared + 1);
  });

  it('rejects shrine actions outside the shrine phase and malformed choices', () => {
    expectRejected(runIn({ kind: 'map' }, three), { type: 'shrine', choice: 'rest' }, 'phase');
    expectRejected(runIn({ kind: 'cache', nodeId: 'z0-l1-c0' }, three), { type: 'shrine', choice: 'leave' }, 'phase');
    expectRejected(runIn({ kind: 'map' }, three), { type: 'evolve', memberIndex: 0 }, 'phase');
    expectRejected(runIn(shrine, three), { type: 'shrine', choice: 'bogus' } as unknown as RunAction);
  });
});

describe('evolve', () => {
  const shrine: RunPhase = { kind: 'shrine', nodeId: 'z0-l2-c0' };

  it('spends the cost, swaps the species, grows HP by the max HP gain and clears the node', () => {
    const run = runIn(shrine, [{ speciesId: 'cindermite', hp: 150 }], { souls: 5 });
    const step = act(run, { type: 'evolve', memberIndex: 0 });
    expect(step.events).toEqual([{ type: 'evolved', from: 'cindermite', to: 'cindermaw' }]);
    // 192 -> 240: hp 150 + 48 = 198.
    expect(step.run.party).toEqual([{ speciesId: 'cindermaw', hp: 198 }]);
    expect(step.run.souls).toBe(2);
    expect(step.run.phase).toEqual({ kind: 'map' });
    expect(step.run.at).toBe('z0-l2-c0');
    expect(step.run.stats.nodesCleared).toBe(run.stats.nodesCleared + 1);
  });

  it('works with exactly the cost and caps HP at the new max', () => {
    const run = runIn(shrine, [{ speciesId: 'brambleback', hp: 224 }], { souls: 3 });
    const step = act(run, { type: 'evolve', memberIndex: 0 });
    expect(step.run.party).toEqual([{ speciesId: 'bramblewarden', hp: 280 }]);
    expect(step.run.souls).toBe(0);
  });

  it('rejects with too few souls (2 of 3)', () => {
    expectRejected(runIn(shrine, [{ speciesId: 'cindermite', hp: 150 }], { souls: 2 }), { type: 'evolve', memberIndex: 0 });
  });

  it('rejects a species without evolvesTo and a bad member index', () => {
    const run = runIn(shrine, [{ speciesId: 'skirrow', hp: 100 }, { speciesId: 'cindermaw', hp: 100 }], { souls: 9 });
    expectRejected(run, { type: 'evolve', memberIndex: 0 });
    expectRejected(run, { type: 'evolve', memberIndex: 1 });
    for (const memberIndex of [-1, 2, 0.5, Number.NaN]) expectRejected(run, { type: 'evolve', memberIndex });
  });

  it('is listed only for members that can evolve and are affordable', () => {
    const party: PartyMember[] = [
      { speciesId: 'skirrow', hp: 100 },
      { speciesId: 'cindermite', hp: 100 },
      { speciesId: 'tidewisp', hp: 100 },
    ];
    const evolves = (souls: number) =>
      legalRunActions(runIn(shrine, party, { souls }), CONTENT).filter((a) => a.type === 'evolve');
    expect(evolves(2)).toEqual([]);
    expect(evolves(3)).toEqual([
      { type: 'evolve', memberIndex: 1 },
      { type: 'evolve', memberIndex: 2 },
    ]);
  });
});

describe('cache', () => {
  const cache: RunPhase = { kind: 'cache', nodeId: 'z0-l3-c1' };

  it('gives 2 souls and heals 25% of max HP per member', () => {
    // 25%: cindermite floor(192*25/100)=48; brambleback 56 capped at the 24 missing.
    const run = runIn(cache, [
      { speciesId: 'cindermite', hp: 100 },
      { speciesId: 'brambleback', hp: 200 },
    ], { souls: 1 });
    const step = act(run, { type: 'cache' });
    expect(step.events).toEqual([
      { type: 'soul', amount: 2, reason: 'cache' },
      { type: 'healed', memberIndex: 0, amount: 48 },
      { type: 'healed', memberIndex: 1, amount: 24 },
    ]);
    expect(step.run.souls).toBe(3);
    expect(step.run.party.map((m) => m.hp)).toEqual([148, 224]);
    expect(step.run.phase).toEqual({ kind: 'map' });
    expect(step.run.at).toBe('z0-l3-c1');
    expect(step.run.stats.nodesCleared).toBe(run.stats.nodesCleared + 1);
  });

  it('floors the heal and emits no healed event at full HP', () => {
    // tidewisp 176 * 25 / 100 = 44 exactly; emberveil 200 -> 50; skirrow 144 -> 36.
    const run = runIn(cache, [
      { speciesId: 'tidewisp', hp: 1 },
      { speciesId: 'skirrow', hp: 144 },
    ]);
    const step = act(run, { type: 'cache' });
    expect(step.events).toEqual([
      { type: 'soul', amount: 2, reason: 'cache' },
      { type: 'healed', memberIndex: 0, amount: 44 },
    ]);
  });

  it('rejects outside the cache phase', () => {
    expectRejected(runIn({ kind: 'shrine', nodeId: 'z0-l2-c0' }, three), { type: 'cache' }, 'phase');
  });
});

describe('mystery', () => {
  const mystery: RunPhase = { kind: 'mystery', nodeId: 'z0-l4-c0' };
  const party: PartyMember[] = [
    { speciesId: 'cindermite', hp: 100 },
    { speciesId: 'tidewisp', hp: 100 },
  ];

  /** First seed whose run rng rolls `want` on `nextInt(2)`. */
  function seedFor(want: 0 | 1): RunState {
    for (let i = 0; i < 200; i++) {
      const base = startRun(`mystery-${i}`, 'cindermite', CONTENT);
      if (restoreRng(base.rng).nextInt(2) === want) return runIn(mystery, party, { rng: base.rng, souls: 1 });
    }
    throw new Error('no seed');
  }

  it('roll 0 gives 3 souls and advances only the rng', () => {
    const run = seedFor(0);
    const step = act(run, { type: 'mystery', choice: 'open' });
    expect(step.events).toEqual([{ type: 'soul', amount: 3, reason: 'mystery' }]);
    expect(step.run.souls).toBe(4);
    expect(step.run.party).toEqual(party);
    const rng = restoreRng(run.rng);
    rng.nextInt(2);
    expect(step.run.rng).toEqual(rng.getState());
    expect(step.run.rng).not.toEqual(run.rng);
    expect(step.run.phase).toEqual({ kind: 'map' });
    expect(step.run.at).toBe('z0-l4-c0');
    expect(step.run.stats.nodesCleared).toBe(run.stats.nodesCleared + 1);
  });

  it('roll 1 hurts the first member by 20% of max HP (floor 192/5 = 38)', () => {
    const run = seedFor(1);
    const step = act(run, { type: 'mystery', choice: 'open' });
    expect(step.events).toEqual([{ type: 'hurt', memberIndex: 0, amount: 38 }]);
    expect(step.run.party.map((m) => m.hp)).toEqual([62, 100]);
    expect(step.run.souls).toBe(1);
    expect(step.run.phase).toEqual({ kind: 'map' });
  });

  it('never drops the hurt member below 1 HP', () => {
    const base = seedFor(1);
    const low = { ...base, party: [{ speciesId: 'cindermite', hp: 10 }] };
    const step = act(low, { type: 'mystery', choice: 'open' });
    expect(step.events).toEqual([{ type: 'hurt', memberIndex: 0, amount: 9 }]);
    expect(step.run.party[0]!.hp).toBe(1);
  });

  it('emits no hurt event for a member at 1 HP', () => {
    const base = seedFor(1);
    const one = { ...base, party: [{ speciesId: 'cindermite', hp: 1 }] };
    const step = act(one, { type: 'mystery', choice: 'open' });
    expect(step.events).toEqual([]);
    expect(step.run.party[0]!.hp).toBe(1);
    expect(step.run.phase).toEqual({ kind: 'map' });
  });

  it('leave does nothing and keeps the rng', () => {
    const run = seedFor(0);
    const step = act(run, { type: 'mystery', choice: 'leave' });
    expect(step.events).toEqual([]);
    expect(step.run.rng).toEqual(run.rng);
    expect(step.run.souls).toBe(run.souls);
    expect(step.run.party).toEqual(run.party);
    expect(step.run.phase).toEqual({ kind: 'map' });
    expect(step.run.at).toBe('z0-l4-c0');
  });

  it('rejects outside the mystery phase and malformed choices', () => {
    expectRejected(runIn({ kind: 'map' }, party), { type: 'mystery', choice: 'open' }, 'phase');
    expectRejected(runIn(mystery, party), { type: 'mystery', choice: 'x' } as unknown as RunAction);
  });
});

describe('determinism and rng use', () => {
  const phases: Array<[RunPhase, RunAction]> = [
    [offer, { type: 'recruit', take: false }],
    [{ kind: 'shrine', nodeId: 'z0-l2-c0' }, { type: 'shrine', choice: 'rest' }],
    [{ kind: 'shrine', nodeId: 'z0-l2-c0' }, { type: 'evolve', memberIndex: 0 }],
    [{ kind: 'cache', nodeId: 'z0-l3-c0' }, { type: 'cache' }],
    [{ kind: 'mystery', nodeId: 'z0-l3-c0' }, { type: 'mystery', choice: 'open' }],
  ];

  it('gives deep-equal results for the same run and action, and does not mutate the input', () => {
    for (const [phase, action] of phases) {
      const run = runIn(phase, [{ speciesId: 'cindermite', hp: 100 }], { souls: 4 });
      const frozen = structuredClone(run);
      const a = act(run, action);
      const b = act(run, action);
      expect(a).toEqual(b);
      expect(run).toEqual(frozen);
      expect(JSON.parse(JSON.stringify(a.events))).toEqual(a.events);
    }
  });

  it('advances the rng only for a mystery open', () => {
    for (const [phase, action] of phases) {
      const run = runIn(phase, [{ speciesId: 'cindermite', hp: 100 }], { souls: 4 });
      const step = act(run, action);
      if (action.type === 'mystery') expect(step.run.rng).not.toEqual(run.rng);
      else expect(step.run.rng).toEqual(run.rng);
    }
  });
});

describe('legalRunActions for the event phases', () => {
  it('recruit: decline, take with a free slot, one replace entry per member when full', () => {
    expect(legalRunActions(runIn(offer, [three[0]!]), CONTENT)).toEqual([
      { type: 'recruit', take: false },
      { type: 'recruit', take: true },
    ]);
    expect(legalRunActions(runIn(offer, three), CONTENT)).toEqual([
      { type: 'recruit', take: false },
      { type: 'recruit', take: true, replaceIndex: 0 },
      { type: 'recruit', take: true, replaceIndex: 1 },
      { type: 'recruit', take: true, replaceIndex: 2 },
    ]);
  });

  it('shrine, cache and mystery', () => {
    expect(legalRunActions(runIn({ kind: 'shrine', nodeId: 'a' }, three), CONTENT)).toEqual([
      { type: 'shrine', choice: 'rest' },
      { type: 'shrine', choice: 'leave' },
    ]);
    expect(legalRunActions(runIn({ kind: 'cache', nodeId: 'a' }, three), CONTENT)).toEqual([{ type: 'cache' }]);
    expect(legalRunActions(runIn({ kind: 'mystery', nodeId: 'a' }, three), CONTENT)).toEqual([
      { type: 'mystery', choice: 'open' },
      { type: 'mystery', choice: 'leave' },
    ]);
  });

  it('every legal action is accepted and round-trips through JSON', () => {
    const phases: RunPhase[] = [offer, { kind: 'shrine', nodeId: 'a' }, { kind: 'cache', nodeId: 'a' }, { kind: 'mystery', nodeId: 'a' }];
    for (const phase of phases) {
      const run = runIn(phase, three, { souls: 5 });
      for (const a of legalRunActions(run, CONTENT)) {
        expect(JSON.parse(JSON.stringify(a))).toEqual(a);
        const events: RunEvent[] = act(run, a).events;
        expect(events.some((e) => e.type === 'rejected')).toBe(false);
      }
    }
  });
});
