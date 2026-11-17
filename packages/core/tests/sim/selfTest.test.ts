import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import {
  checkBattleGolden,
  checkRunGolden,
  combineSelfTest,
  runGoldenSelfTest,
  selfTestSummary,
  type SelfTestResult,
} from '../../src/sim/selfTest';
import { assertJsonSafe } from '../support/jsonSafe';

const GOLDEN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'golden');
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(GOLDEN, name), 'utf8'));
type Entry = Record<string, unknown>;
const battle = () => read('battle.golden.json') as Entry[];
const runs = () => read('run.golden.json') as Entry[];

/** Flips the last hex digit of a 16-char hash. */
const flip = (h: unknown) => {
  const s = String(h);
  return s.slice(0, -1) + (s.endsWith('0') ? '1' : '0');
};

describe('golden self test', () => {
  it('passes on the real golden files, checking every entry', () => {
    const b = battle();
    const r = runs();
    const result = runGoldenSelfTest(b, r, CONTENT);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.firstMismatch).toBeNull();
    expect(result.battle).toHaveLength(b.length);
    expect(result.run).toHaveLength(r.length);
    expect(result.battle.every((c) => c.ok)).toBe(true);
    expect(result.run.every((c) => c.ok && c.actual?.rejected === 0)).toBe(true);
    result.battle.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.name).toBe(b[i]!.name);
      expect(c.actual).toEqual({ finalHash: b[i]!.finalHash, winner: b[i]!.winner });
    });
    result.run.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.seed).toBe(r[i]!.seed);
      expect(c.starterId).toBe(r[i]!.starterId);
      expect(c.actual).toMatchObject({ finalHash: r[i]!.finalHash, result: r[i]!.result, score: r[i]!.score });
    });
    expect(selfTestSummary(result)).toBe(`PASS battle ${b.length}/${b.length} run ${r.length}/${r.length}`);
  });

  it('section helpers combine to the same result as the one-shot runner', () => {
    const b = battle();
    const r = runs();
    expect(combineSelfTest(checkBattleGolden(b, CONTENT), checkRunGolden(r, CONTENT))).toEqual(
      runGoldenSelfTest(b, r, CONTENT),
    );
  });

  for (const index of [0, 2]) {
    it(`reports a flipped battle hash at index ${index}`, () => {
      const b = battle();
      const real = b[index]!.finalHash;
      b[index]!.finalHash = flip(real);
      const result = runGoldenSelfTest(b, runs(), CONTENT);
      expect(result.ok).toBe(false);
      expect(result.firstMismatch).toEqual({ kind: 'battle', index });
      expect(result.battle.filter((c) => !c.ok).map((c) => c.index)).toEqual([index]);
      expect(result.battle[index]!.expected?.finalHash).toBe(flip(real));
      expect(result.battle[index]!.actual?.finalHash).toBe(real);
      const summary = selfTestSummary(result);
      expect(summary.startsWith(`FAIL battle ${b.length - 1}/${b.length} `)).toBe(true);
      expect(summary).toContain(`first=battle#${index}`);
      expect(summary).toContain(flip(real));
      expect(summary).toContain(String(real));
    });
  }

  it('reports a flipped run hash with its exact index, and a battle mismatch wins as first', () => {
    const r = runs();
    const last = r.length - 1;
    r[last]!.finalHash = flip(r[last]!.finalHash);
    const onlyRun = runGoldenSelfTest(battle(), r, CONTENT);
    expect(onlyRun.ok).toBe(false);
    expect(onlyRun.firstMismatch).toEqual({ kind: 'run', index: last });
    expect(onlyRun.run[last]!.actual?.finalHash).toBe(runs()[last]!.finalHash);

    const b = battle();
    b[1]!.winner = b[1]!.winner === 'player' ? 'enemy' : 'player';
    const both = runGoldenSelfTest(b, r, CONTENT);
    expect(both.firstMismatch).toEqual({ kind: 'battle', index: 1 });
    expect(both.battle[1]!.actual?.finalHash).toBe(b[1]!.finalHash);
  });

  it('flags a wrong run score and result', () => {
    const r = runs();
    r[0]!.score = Number(r[0]!.score) + 1;
    r[2]!.result = r[2]!.result === 'won' ? 'lost' : 'won';
    const result = runGoldenSelfTest(battle(), r, CONTENT);
    expect(result.run.filter((c) => !c.ok).map((c) => c.index)).toEqual([0, 2]);
    expect(result.firstMismatch).toEqual({ kind: 'run', index: 0 });
  });

  it('flags rejected actions even when nothing else changed', () => {
    const r = runs();
    const original = r[0]!.actions as unknown[];
    // An extra action after the run ended is rejected and leaves the state (hash, score) unchanged.
    r[0]!.actions = [...original, { type: 'cache' }];
    const result = runGoldenSelfTest(battle(), r, CONTENT);
    expect(result.run[0]!.actual?.rejected).toBeGreaterThan(0);
    expect(result.run[0]!.actual?.finalHash).toBe(r[0]!.finalHash);
    expect(result.run[0]!.ok).toBe(false);
    expect(result.firstMismatch).toEqual({ kind: 'run', index: 0 });
  });

  describe('malformed input never throws and is never ok', () => {
    const cases: [string, unknown, unknown][] = [
      ['undefined files', undefined, undefined],
      ['null files', null, null],
      ['objects instead of arrays', {}, { a: 1 }],
      ['strings', 'battle', 'run'],
      ['empty arrays', [], []],
      ['arrays of junk', [1, null, 'x', [], {}], [true, 0, {}, [], 'y']],
    ];
    for (const [name, b, r] of cases) {
      it(name, () => {
        let result: SelfTestResult | undefined;
        expect(() => {
          result = runGoldenSelfTest(b, r, CONTENT);
        }).not.toThrow();
        expect(result!.ok).toBe(false);
        expect(result!.errors.length + result!.battle.filter((c) => !c.ok).length).toBeGreaterThan(0);
        expect(() => selfTestSummary(result!)).not.toThrow();
        expect(selfTestSummary(result!).startsWith('FAIL')).toBe(true);
        assertJsonSafe(JSON.parse(JSON.stringify(result)));
      });
    }

    it('too few entries fails the file guard even when the entries replay', () => {
      const result = runGoldenSelfTest(battle().slice(0, 2), runs().slice(0, 3), CONTENT);
      expect(result.ok).toBe(false);
      expect(result.firstMismatch).toBeNull();
      expect(result.battle.every((c) => c.ok)).toBe(true);
      expect(result.errors).toEqual([
        'battle golden has 2 entries, expected at least 3',
        'run golden has 3 entries, expected at least 4',
      ]);
      expect(selfTestSummary(result)).toContain('errors=');
    });

    it('an entry with empty actions is a mismatch, not a pass', () => {
      const b = battle();
      b[0]!.actions = [];
      const r = runs();
      r[1]!.actions = [];
      const result = runGoldenSelfTest(b, r, CONTENT);
      expect(result.battle[0]).toMatchObject({ ok: false, error: 'malformed battle entry' });
      expect(result.run[1]).toMatchObject({ ok: false, error: 'malformed run entry' });
      expect(result.firstMismatch).toEqual({ kind: 'battle', index: 0 });
    });

    it('a replay that throws (unknown species or starter) is reported with its error', () => {
      const b = battle();
      b[1]!.player = { speciesIds: ['no-such-species'] };
      const r = runs();
      r[0]!.starterId = 'no-such-starter';
      const result = runGoldenSelfTest(b, r, CONTENT);
      expect(result.ok).toBe(false);
      expect(result.battle[1]!.ok).toBe(false);
      expect(result.battle[1]!.error).toBeTruthy();
      expect(result.run[0]!.ok).toBe(false);
      expect(result.run[0]!.error).toBeTruthy();
      expect(selfTestSummary(result)).toContain('"error"');
    });
  });

  it('result and summary are JSON-safe', () => {
    const result = runGoldenSelfTest(battle(), runs(), CONTENT);
    assertJsonSafe(result);
    expect(typeof selfTestSummary(result)).toBe('string');
  });
});
