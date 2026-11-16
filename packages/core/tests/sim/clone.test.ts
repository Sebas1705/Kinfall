import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import { applyAction, createBattle } from '../../src/sim/battle';
import { clone } from '../../src/sim/clone';
import { canonicalize } from '../../src/sim/codec';
import type { GoldenEntry } from '../../src/sim/golden';
import { createRng } from '../../src/sim/rng';
import { chooseBotAction } from '../../src/sim/run/bot';
import { applyRunAction, legalRunActions, maxHpOf, startRun } from '../../src/sim/run/run';
import type { RunAction, RunState } from '../../src/sim/run/types';
import { assertJsonSafe } from '../support/jsonSafe';

const GOLDEN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'golden');
const battleGolden = JSON.parse(readFileSync(resolve(GOLDEN, 'battle.golden.json'), 'utf8')) as GoldenEntry[];
const runGolden = JSON.parse(readFileSync(resolve(GOLDEN, 'run.golden.json'), 'utf8')) as {
  seed: string;
  starterId: string;
  actions: RunAction[];
}[];

const WALKS = 30;
const BOTS = 30;

/** Every battle state reached while replaying the golden battles (initial state included). */
function goldenBattleStates(): unknown[] {
  const out: unknown[] = [];
  for (const e of battleGolden) {
    let s = createBattle(e.seed, e.player, e.enemy, CONTENT, { telegraph: e.telegraph });
    out.push(s);
    for (const a of e.actions) {
      s = applyAction(s, a, CONTENT).state;
      out.push(s);
    }
  }
  return out;
}

/** Every run state of a run driven by `pick` until it ends or 400 steps pass. */
function runStates(seed: string, starterId: string, pick: (run: RunState) => RunAction): RunState[] {
  let run = startRun(seed, starterId, CONTENT);
  const out = [run];
  for (let i = 0; i < 400 && run.phase.kind !== 'ended'; i++) {
    run = applyRunAction(run, pick(run), CONTENT).run;
    out.push(run);
  }
  return out;
}

function goldenRunStates(): RunState[] {
  return runGolden.flatMap((e) => {
    let i = 0;
    return runStates(e.seed, e.starterId, () => e.actions[i++]!).slice(0, e.actions.length + 1);
  });
}

function randomWalkStates(): RunState[] {
  const out: RunState[] = [];
  for (let n = 0; n < WALKS; n++) {
    const rng = createRng(`clone-walk-${n}`);
    const starter = CONTENT.starters[n % CONTENT.starters.length]!;
    out.push(
      ...runStates(`clone-walk-${n}`, starter, (run) => {
        const legal = legalRunActions(run, CONTENT);
        return legal[rng.nextInt(legal.length)]!;
      }),
    );
  }
  return out;
}

function botStates(): RunState[] {
  const out: RunState[] = [];
  for (let n = 0; n < BOTS; n++) {
    const seed = `clone-bot-${n}`;
    const rng = createRng(seed).fork('bot');
    const starter = CONTENT.starters[n % CONTENT.starters.length]!;
    out.push(...runStates(seed, starter, (run) => chooseBotAction(run, CONTENT, rng)));
  }
  return out;
}

/**
 * Late-run states no bot reaches: a full party standing before the zone 1 and zone 2 bosses,
 * then a seeded random walk through the boss battle and whatever follows.
 */
function craftedLateStates(): RunState[] {
  const out: RunState[] = [];
  for (const zone of [1, 2]) {
    for (let n = 0; n < 5; n++) {
      const seed = `clone-late-${zone}-${n}`;
      const start = startRun(seed, CONTENT.starters[n % CONTENT.starters.length]!, CONTENT);
      start.zone = zone;
      start.party = CONTENT.starters.map((id) => ({ speciesId: id, hp: maxHpOf(id, CONTENT) }));
      const layers = start.maps[zone]!.layers;
      start.at = layers[layers.length - 2]![0]!.id;
      start.stats = { nodesCleared: 7 * zone + 6, elitesBeaten: zone, bossesBeaten: zone, creaturesLost: 0 };
      const rng = createRng(seed);
      let run = start;
      out.push(run);
      for (let i = 0; i < 400 && run.phase.kind !== 'ended'; i++) {
        const legal = legalRunActions(run, CONTENT);
        run = applyRunAction(run, legal[rng.nextInt(legal.length)]!, CONTENT).run;
        out.push(run);
      }
    }
  }
  return out;
}

describe('clone', () => {
  it('copies primitives, arrays and plain objects deeply, keeping key order', () => {
    const src = { b: 1, a: [1, 'x', null, true, { c: [2, 3] }], n: null, o: { z: 0, y: -1 } };
    const out = clone(src);
    expect(out).toStrictEqual(src);
    expect(JSON.stringify(out)).toBe(JSON.stringify(src));
    expect(out).not.toBe(src);
    expect(out.a).not.toBe(src.a);
    expect(out.a[4]).not.toBe(src.a[4]);
    expect(out.o).not.toBe(src.o);
    for (const v of [0, -0, 1.5, 'a', true, null, undefined]) expect(Object.is(clone(v), v)).toBe(true);
  });

  it('keeps undefined-valued keys like structuredClone does', () => {
    const src = { a: undefined, b: 1 };
    expect(Object.keys(clone(src))).toEqual(['a', 'b']);
    expect(clone(src)).toStrictEqual(structuredClone(src));
  });

  it('keeps an own __proto__ key as a plain property', () => {
    const src = JSON.parse('{"__proto__":{"x":1},"y":2}') as Record<string, unknown>;
    const out = clone(src);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.keys(out)).toEqual(['__proto__', 'y']);
    expect(canonicalize(out)).toBe(canonicalize(src));
  });

  it('accepts null-prototype objects and returns plain ones', () => {
    const src = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(clone(src)).toEqual({ a: 1 });
  });

  it.each([
    ['Map', new Map()],
    ['Set', new Set()],
    ['Date', new Date(0)],
    ['class instance', new (class Foo {})()],
    ['function', () => 1],
    ['symbol', Symbol('s')],
    ['bigint', 1n],
    ['nested Map', { a: [{ m: new Map() }] }],
  ])('throws on unsupported data: %s', (_name, value) => {
    expect(() => clone(value)).toThrow(TypeError);
  });

  it('does not mutate its input', () => {
    const src = { a: [1, { b: 2 }] };
    const before = JSON.stringify(src);
    const out = clone(src);
    (out.a[1] as { b: number }).b = 9;
    expect(JSON.stringify(src)).toBe(before);
  });
});

describe('engine state is JSON-safe and clone is exact on it', () => {
  const corpora: [string, () => unknown[], number][] = [
    ['golden battle entries', () => battleGolden, 3],
    ['golden battle states', goldenBattleStates, 20],
    ['golden run states', goldenRunStates, 20],
    [`states of ${WALKS} random-walk runs`, randomWalkStates, WALKS * 5],
    [`states of ${BOTS} bot runs`, botStates, BOTS * 5],
    ['crafted late-run states (zone 1 and 2 bosses)', craftedLateStates, 20],
  ];
  for (const [name, build, min] of corpora) {
    it(name, () => {
      const xs = build();
      expect(xs.length).toBeGreaterThanOrEqual(min);
      for (const [i, x] of xs.entries()) {
        assertJsonSafe(x, `${name}[${i}]`);
        const c = clone(x);
        expect(c).toStrictEqual(x);
        expect(c).toStrictEqual(structuredClone(x));
        expect(canonicalize(c)).toBe(canonicalize(x));
        expect(JSON.stringify(c)).toBe(JSON.stringify(x));
        // On JSON-safe data a JSON round trip is also exact, so either clone strategy is sound.
        expect(JSON.parse(JSON.stringify(x))).toStrictEqual(x);
      }
    });
  }

  it('reaches battles, ended runs and every zone in the run corpora', () => {
    const runs = [...goldenRunStates(), ...randomWalkStates(), ...botStates(), ...craftedLateStates()];
    expect(runs.some((r) => r.phase.kind === 'battle')).toBe(true);
    expect(runs.some((r) => r.phase.kind === 'ended')).toBe(true);
    expect(new Set(runs.map((r) => r.zone))).toEqual(new Set([0, 1, 2]));
    expect(runs.some((r) => r.zone === 2 && r.phase.kind === 'battle' && r.phase.battle.script !== undefined)).toBe(true);
  });
});

describe('assertJsonSafe', () => {
  it.each([
    ['undefined value', { a: undefined }],
    ['NaN', { a: Number.NaN }],
    ['Infinity', [Number.POSITIVE_INFINITY]],
    ['-0', { a: -0 }],
    ['Map', { a: new Map() }],
    ['Set', [new Set()]],
    ['Date', { d: new Date(0) }],
    ['class instance', { c: new (class Foo {})() }],
    ['sparse array', { a: [1, , 3] }],
    ['function', { f: () => 1 }],
  ])('rejects %s', (_name, value) => {
    expect(() => assertJsonSafe(value)).toThrow();
  });
  it('accepts plain JSON data', () => {
    expect(() => assertJsonSafe({ a: [1, 'b', null, true, { c: 0 }] })).not.toThrow();
  });
});
