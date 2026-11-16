import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../src/content';
import { lookup } from '../../../src/content/lookup';
import { createRng } from '../../../src/sim/rng';
import { chooseBotAction, replayRun, simulateRun } from '../../../src/sim/run/bot';
import { deserializeRun, hashRun, serializeRun } from '../../../src/sim/run/codec';
import { maxHpOf } from '../../../src/sim/run/party';
import { applyRunAction, legalRunActions, startRun } from '../../../src/sim/run/run';
import type { RunEvent, RunState } from '../../../src/sim/run/types';

const SEEDS = 200;
const STARTERS = CONTENT.starters;

function checkInvariants(run: RunState, where: string): void {
  const ended = run.phase.kind === 'ended';
  if (!ended) expect(run.party.length, `${where}: party size`).toBeGreaterThanOrEqual(1);
  expect(run.party.length, `${where}: party size`).toBeLessThanOrEqual(3);
  for (const m of run.party) {
    expect(m.hp, `${where}: hp`).toBeGreaterThan(0);
    expect(m.hp, `${where}: hp <= max`).toBeLessThanOrEqual(maxHpOf(m.speciesId, CONTENT));
  }
  expect(run.souls, `${where}: souls`).toBeGreaterThanOrEqual(0);
  if (run.at !== null) {
    expect(run.maps[run.zone]!.layers.flat().some((n) => n.id === run.at), `${where}: at in map`).toBe(true);
  }
  expect(['map', 'battle', 'recruit', 'shrine', 'cache', 'mystery', 'ended']).toContain(run.phase.kind);
}

describe('chooseBotAction', () => {
  it('always returns a legal action, which is never rejected', () => {
    const rng = createRng('legal').fork('bot');
    for (const starter of STARTERS) {
      let run = startRun('legal', starter, CONTENT);
      for (let i = 0; i < 400 && run.phase.kind !== 'ended'; i++) {
        const action = chooseBotAction(run, CONTENT, rng);
        expect(legalRunActions(run, CONTENT)).toContainEqual(action);
        const step = applyRunAction(run, action, CONTENT);
        expect(step.events.some((e) => e.type === 'rejected')).toBe(false);
        run = step.run;
      }
    }
  });

  it('throws on an ended run instead of inventing an action', () => {
    const run = startRun('end', STARTERS[0]!, CONTENT);
    run.phase = { kind: 'ended', result: 'lost' };
    expect(() => chooseBotAction(run, CONTENT, createRng('x'))).toThrow(/no legal action/);
  });

  it('is deterministic for the same seed and starter', () => {
    const a = simulateRun('det', STARTERS[0]!, CONTENT);
    const b = simulateRun('det', STARTERS[0]!, CONTENT);
    expect(b.actions).toEqual(a.actions);
    expect(hashRun(b.run)).toBe(hashRun(a.run));
  });
});

describe('simulateRun', () => {
  it('throws a descriptive error beyond maxSteps', () => {
    expect(() => simulateRun('slow', STARTERS[0]!, CONTENT, { maxSteps: 1 })).toThrow(/exceeded 1 steps.*seed slow/);
  });

  it('terminates with the invariants intact, and replaying the actions reproduces the hash (600 runs)', () => {
    for (let i = 0; i < SEEDS; i++) {
      for (const starter of STARTERS) {
        const seed = `inv-${i}`;
        const { run, actions } = simulateRun(seed, starter, CONTENT, { maxSteps: 3000 });
        expect(run.phase.kind, `${seed}/${starter}`).toBe('ended');

        // Re-apply step by step to check invariants and the soul bookkeeping.
        let cur = startRun(seed, starter, CONTENT);
        let prev = cur.stats;
        let earned = 0;
        let spent = 0;
        for (const [n, action] of actions.entries()) {
          const step = applyRunAction(cur, action, CONTENT);
          cur = step.run;
          const events: RunEvent[] = step.events;
          for (const e of events) {
            if (e.type === 'soul') earned += e.amount;
            if (e.type === 'evolved') {
              const sp = CONTENT.species.find((s) => s.id === e.from)!;
              spent += sp.evolveCost!;
            }
          }
          checkInvariants(cur, `${seed}/${starter} step ${n}`);
          for (const k of ['nodesCleared', 'elitesBeaten', 'bossesBeaten', 'creaturesLost'] as const) {
            expect(cur.stats[k], `${seed}/${starter}: ${k} monotonic`).toBeGreaterThanOrEqual(prev[k]);
          }
          prev = cur.stats;
        }
        expect(hashRun(cur)).toBe(hashRun(run));
        expect(earned - spent, `${seed}/${starter}: souls`).toBe(run.souls);

        const replay = replayRun(seed, starter, actions, CONTENT);
        expect(replay.rejected).toBe(0);
        expect(hashRun(replay.run)).toBe(hashRun(run));
      }
    }
  });

  it('can evolve (evolution and its soul spend are exercised)', () => {
    let evolved = 0;
    for (let i = 0; i < 100 && evolved === 0; i++) {
      const { actions } = simulateRun(`inv-${i}`, STARTERS[0]!, CONTENT);
      if (actions.some((a) => a.type === 'evolve')) evolved++;
    }
    expect(evolved).toBeGreaterThan(0);
    expect(lookup(CONTENT).species(STARTERS[0]!).evolvesTo).toBeDefined();
  });
});

describe('replayRun', () => {
  it('counts rejected actions and leaves the state unchanged for them', () => {
    const base = replayRun('rej', STARTERS[0]!, [], CONTENT);
    const r = replayRun('rej', STARTERS[0]!, [{ type: 'cache' }, { type: 'node', nodeId: 'nope' }], CONTENT);
    expect(r.rejected).toBe(2);
    expect(hashRun(r.run)).toBe(hashRun(base.run));
  });
});

describe('resume property (Review focus 4)', () => {
  it('saving and loading every 7th step reaches the same final state as an uninterrupted run', () => {
    for (let i = 0; i < 20; i++) {
      const starter = STARTERS[i % STARTERS.length]!;
      const seed = `resume-${i}`;
      const { run: whole, actions } = simulateRun(seed, starter, CONTENT);
      let run = startRun(seed, starter, CONTENT);
      for (const [n, action] of actions.entries()) {
        if (n % 7 === 0) {
          const loaded = deserializeRun(serializeRun(run), CONTENT);
          if (!loaded.ok) throw new Error(`${seed} step ${n}: ${loaded.error}`);
          run = loaded.run;
        }
        const step = applyRunAction(run, action, CONTENT);
        expect(step.events.some((e) => e.type === 'rejected')).toBe(false);
        run = step.run;
      }
      expect(hashRun(run), seed).toBe(hashRun(whole));
    }
  });
});
