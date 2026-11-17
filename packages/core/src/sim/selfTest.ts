import type { Content } from '../content';
import { replayBattle } from './golden';
import { replayRun, runTags } from './run/bot';
import { hashRun } from './run/codec';
import { runScore } from './run/score';
import type { RunAction } from './run/types';
import type { Action, Side, TeamSpec } from './state';

/**
 * Golden self test: replays every entry of the battle and run golden files with the same calls
 * and comparisons as the Node golden tests (tests/sim/golden.test.ts, tests/sim/run/golden.test.ts)
 * so any JS engine (Hermes on a phone, a browser) can prove it reproduces the stored hashes.
 * Pure and platform-neutral: no clock, no console, no timers. Input is `unknown` because it comes
 * from parsed JSON; malformed input yields `ok: false` with an error and never throws.
 */

/** Vacuity guards, the same minimums as the Node golden tests. */
export const MIN_BATTLE_ENTRIES = 3;
export const MIN_RUN_ENTRIES = 4;

export interface BattleCheck {
  index: number;
  name: string;
  ok: boolean;
  expected: { finalHash: string; winner: Side | null } | null;
  actual: { finalHash: string; winner: Side | null } | null;
  error?: string;
}

export interface RunCheck {
  index: number;
  seed: string;
  starterId: string;
  ok: boolean;
  expected: { finalHash: string; result: string; score: number; tags: string[] } | null;
  actual: { finalHash: string; result: string | null; score: number; rejected: number; tags: string[] } | null;
  error?: string;
}

export type MismatchKind = 'battle' | 'run';

export interface GoldenSectionResult<T> {
  ok: boolean;
  checks: T[];
  /** File-level problems (not an array, too few entries); entry problems live on each check. */
  errors: string[];
}

export interface SelfTestResult {
  ok: boolean;
  battle: BattleCheck[];
  run: RunCheck[];
  /** First failing entry, battle file first; null when every entry passed (or none could be read). */
  firstMismatch: null | { kind: MismatchKind; index: number };
  /** File-level problems; non-empty means `ok` is false even when no entry failed. */
  errors: string[];
}

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isTeam(v: unknown): v is TeamSpec {
  return isRec(v) && Array.isArray(v.speciesIds);
}

function isWinner(v: unknown): v is Side | null {
  return v === null || v === 'player' || v === 'enemy';
}

function sectionErrors(label: string, data: unknown, min: number): string[] {
  if (!Array.isArray(data)) return [`${label} golden is not an array`];
  if (data.length < min) return [`${label} golden has ${data.length} entries, expected at least ${min}`];
  return [];
}

function checkBattleEntry(raw: unknown, index: number, content: Content): BattleCheck {
  const e = isRec(raw) ? raw : {};
  const base = { index, name: str(e.name) || `#${index}` };
  if (
    !isRec(raw) ||
    typeof e.seed !== 'string' ||
    e.seed.length === 0 ||
    !isTeam(e.player) ||
    !isTeam(e.enemy) ||
    !Array.isArray(e.actions) ||
    e.actions.length === 0 ||
    typeof e.finalHash !== 'string' ||
    e.finalHash.length === 0 ||
    !isWinner(e.winner)
  ) {
    return { ...base, ok: false, expected: null, actual: null, error: 'malformed battle entry' };
  }
  const expected = { finalHash: e.finalHash, winner: e.winner };
  try {
    const actual = replayBattle(e.seed, e.player, e.enemy, e.actions as Action[], content, {
      telegraph: e.telegraph === true,
    });
    const ok = actual.finalHash === expected.finalHash && actual.winner === expected.winner;
    return { ...base, ok, expected, actual };
  } catch (err) {
    return { ...base, ok: false, expected, actual: null, error: errorText(err) };
  }
}

function checkRunEntry(raw: unknown, index: number, content: Content): RunCheck {
  const e = isRec(raw) ? raw : {};
  const base = { index, seed: str(e.seed), starterId: str(e.starterId) };
  if (
    !isRec(raw) ||
    base.seed.length === 0 ||
    base.starterId.length === 0 ||
    !Array.isArray(e.actions) ||
    e.actions.length === 0 ||
    typeof e.finalHash !== 'string' ||
    e.finalHash.length === 0 ||
    (e.result !== 'won' && e.result !== 'lost') ||
    typeof e.score !== 'number' ||
    !Number.isInteger(e.score) ||
    !Array.isArray(e.tags) ||
    !e.tags.every((t) => typeof t === 'string')
  ) {
    return { ...base, ok: false, expected: null, actual: null, error: 'malformed run entry' };
  }
  const actions = e.actions as RunAction[];
  const expected = { finalHash: e.finalHash, result: e.result, score: e.score, tags: e.tags as string[] };
  try {
    const { run, rejected } = replayRun(base.seed, base.starterId, actions, content);
    const actual = {
      finalHash: hashRun(run),
      result: run.phase.kind === 'ended' ? run.phase.result : null,
      score: runScore(run, content),
      rejected,
      tags: runTags(run, actions),
    };
    const ok =
      rejected === 0 &&
      actual.finalHash === expected.finalHash &&
      actual.result === expected.result &&
      actual.score === expected.score &&
      actual.tags.length === expected.tags.length &&
      actual.tags.every((t, i) => t === expected.tags[i]);
    return { ...base, ok, expected, actual };
  } catch (err) {
    return { ...base, ok: false, expected, actual: null, error: errorText(err) };
  }
}

/** Replays every battle golden entry (file guard: an array of at least MIN_BATTLE_ENTRIES). */
export function checkBattleGolden(data: unknown, content: Content): GoldenSectionResult<BattleCheck> {
  const errors = sectionErrors('battle', data, MIN_BATTLE_ENTRIES);
  const checks = Array.isArray(data) ? data.map((e, i) => checkBattleEntry(e, i, content)) : [];
  return { ok: errors.length === 0 && checks.every((c) => c.ok), checks, errors };
}

/** Replays every run golden entry (file guard: an array of at least MIN_RUN_ENTRIES). */
export function checkRunGolden(data: unknown, content: Content): GoldenSectionResult<RunCheck> {
  const errors = sectionErrors('run', data, MIN_RUN_ENTRIES);
  const checks = Array.isArray(data) ? data.map((e, i) => checkRunEntry(e, i, content)) : [];
  return { ok: errors.length === 0 && checks.every((c) => c.ok), checks, errors };
}

/** Joins the two sections; split from `runGoldenSelfTest` so a UI can yield between them. */
export function combineSelfTest(
  battle: GoldenSectionResult<BattleCheck>,
  run: GoldenSectionResult<RunCheck>,
): SelfTestResult {
  const badBattle = battle.checks.find((c) => !c.ok);
  const badRun = run.checks.find((c) => !c.ok);
  const firstMismatch = badBattle
    ? { kind: 'battle' as const, index: badBattle.index }
    : badRun
      ? { kind: 'run' as const, index: badRun.index }
      : null;
  return {
    ok: battle.ok && run.ok,
    battle: battle.checks,
    run: run.checks,
    firstMismatch,
    errors: [...battle.errors, ...run.errors],
  };
}

/** Replays both golden files. Never throws. */
export function runGoldenSelfTest(battleGolden: unknown, runGolden: unknown, content: Content): SelfTestResult {
  return combineSelfTest(checkBattleGolden(battleGolden, content), checkRunGolden(runGolden, content));
}

/**
 * One-line, JSON-safe description of a result for display and logs, e.g.
 * `PASS battle 3/3 run 6/6` or `FAIL battle 2/3 run 6/6 first=battle#1 {...expected/actual...}`.
 */
export function selfTestSummary(result: SelfTestResult): string {
  const passed = (checks: { ok: boolean }[]) => checks.filter((c) => c.ok).length;
  const parts = [
    result.ok ? 'PASS' : 'FAIL',
    `battle ${passed(result.battle)}/${result.battle.length}`,
    `run ${passed(result.run)}/${result.run.length}`,
  ];
  const m = result.firstMismatch;
  if (m) {
    const check: BattleCheck | RunCheck | undefined = m.kind === 'battle' ? result.battle[m.index] : result.run[m.index];
    const detail = check
      ? { expected: check.expected, actual: check.actual, ...(check.error !== undefined ? { error: check.error } : {}) }
      : {};
    parts.push(`first=${m.kind}#${m.index}`, JSON.stringify(detail));
  }
  if (result.errors.length > 0) parts.push(`errors=${JSON.stringify(result.errors)}`);
  return parts.join(' ');
}
