import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../src/content';
import { canonicalize, fnv1a64 } from '../../../src/sim/codec';
import { createRng } from '../../../src/sim/rng';
import { deserializeRun, hashRun, serializeRun, validateRun } from '../../../src/sim/run/codec';
import { resolveBattle } from '../../../src/sim/run/resolve';
import { applyRunAction, legalRunActions, startRun } from '../../../src/sim/run/run';
import type { RunPhase, RunState } from '../../../src/sim/run/types';

type Json = Record<string, unknown>;
type Teams = { player: Json[]; enemy: Json[] };

/**
 * A finished battle won by the player, resolved by the real engine resolver. Walks use it
 * because with the current balance no random walk clears zone 0 on its own, and the codec
 * must also be proven on later zones, boss fights and won runs.
 */
function forceWin(run: RunState): RunState {
  if (run.phase.kind !== 'battle') throw new Error('not in battle');
  const b = structuredClone(run.phase.battle);
  for (const e of b.teams.enemy) Object.assign(e, { hp: 0, fainted: true, status: null });
  b.winner = 'player';
  b.intent = null;
  return resolveBattle(run, run.phase.nodeId, b, CONTENT).run;
}

/** Every state a seeded random walk visits, from the start to the end of the run. */
function walk(seed: string, starterIndex: number, cheat: boolean): RunState[] {
  const pick = createRng(`codec-pick-${seed}`);
  let run = startRun(seed, CONTENT.starters[starterIndex % CONTENT.starters.length]!, CONTENT);
  const out = [run];
  for (let step = 0; step < 3000 && run.phase.kind !== 'ended'; step++) {
    if (cheat && run.phase.kind === 'battle' && pick.nextInt(2) === 0) {
      run = forceWin(run);
    } else {
      const actions = legalRunActions(run, CONTENT);
      run = applyRunAction(run, actions[pick.nextInt(actions.length)]!, CONTENT).run;
    }
    out.push(run);
  }
  return out;
}

const WALKS: RunState[][] = [
  ...Array.from({ length: 12 }, (_, i) => walk(`codec-${i}`, i, false)),
  ...Array.from({ length: 24 }, (_, i) => walk(`codec-cheat-${i}`, i, true)),
];
const ALL = WALKS.flat();

function first(pred: (r: RunState) => boolean, what: string): RunState {
  const r = ALL.find(pred);
  if (!r) throw new Error(`no walked state: ${what}`);
  return r;
}

const kind = (k: RunPhase['kind']) => (r: RunState) => r.phase.kind === k;
const MAP = first((r) => kind('map')(r) && r.at !== null && r.zone > 0, 'map phase in zone > 0');
const BATTLE_FRESH = first((r) => r.phase.kind === 'battle' && r.phase.battle.turn === 1, 'fresh battle');
const BATTLE_MID = first(
  (r) => r.phase.kind === 'battle' && r.phase.battle.turn > 2 && r.party.length > 1,
  'mid battle with a party of 2+',
);
const BOSS_BATTLE = first(
  (r) => r.phase.kind === 'battle' && r.phase.battle.script !== undefined && r.phase.battle.turn > 1,
  'boss battle',
);
const RECRUIT = first(kind('recruit'), 'recruit');
const SHRINE = first(kind('shrine'), 'shrine');
const CACHE = first(kind('cache'), 'cache');
const MYSTERY = first(kind('mystery'), 'mystery');
const WON = first((r) => r.phase.kind === 'ended' && r.phase.result === 'won', 'won run');
const LOST = first((r) => r.phase.kind === 'ended' && r.phase.result === 'lost', 'lost run');
const SAMPLES: Record<string, RunState> = { MAP, BATTLE_FRESH, BATTLE_MID, BOSS_BATTLE, RECRUIT, SHRINE, CACHE, MYSTERY, WON, LOST };

function clone(run: RunState): Json {
  return JSON.parse(JSON.stringify(run)) as Json;
}

/** Serialises a tampered copy with a checksum recomputed to match. */
function forge(run: RunState, mutate: (r: Json) => void): string {
  const r = clone(run);
  mutate(r);
  return serializeRun(r as unknown as RunState);
}

function rejectText(text: string): string {
  let result: ReturnType<typeof deserializeRun> | undefined;
  expect(() => (result = deserializeRun(text, CONTENT))).not.toThrow();
  expect(result!.ok).toBe(false);
  if (result!.ok) throw new Error('unreachable');
  expect(result!.error.length).toBeGreaterThan(0);
  return result!.error;
}

function rejectForged(run: RunState, mutate: (r: Json) => void): string {
  const err = rejectText(forge(run, mutate));
  expect(err).not.toMatch(/checksum/i);
  return err;
}

const phase = (r: Json) => r.phase as Json;
const party = (r: Json) => r.party as Json[];
const battle = (r: Json) => phase(r).battle as Json;
const players = (r: Json) => (battle(r).teams as Teams).player;
const stats = (r: Json) => r.stats as Record<"nodesCleared" | "elitesBeaten" | "bossesBeaten" | "creaturesLost", number>;
const mapNodes = (run: RunState, zone: number) => run.maps[zone]!.layers.flat();

describe('hashRun / serializeRun / deserializeRun', () => {
  it('hashRun is fnv1a64 of the canonical run', () => {
    expect(hashRun(MAP)).toBe(fnv1a64(canonicalize(MAP)));
    expect(hashRun(MAP)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashRun(MAP)).not.toBe(hashRun(SHRINE));
  });

  it('serialises like serializeState: version, checksum and the run', () => {
    const parsed = JSON.parse(serializeRun(MAP)) as Json;
    expect(Object.keys(parsed).sort()).toEqual(['checksum', 'run', 'version']);
    expect(parsed.version).toBe(1);
    expect(parsed.checksum).toBe(hashRun(MAP));
  });

  it('round-trips a map-phase, a mid-battle and an ended run', () => {
    for (const run of [MAP, BATTLE_MID, BOSS_BATTLE, WON, LOST]) {
      const r = deserializeRun(serializeRun(run), CONTENT);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(r.error);
      expect(hashRun(r.run)).toBe(hashRun(run));
      expect(r.run).toEqual(run);
    }
  });

  it('round-trips every state of 36 random walks (the validator is never stricter than the engine)', () => {
    let n = 0;
    for (const run of ALL) {
      const r = deserializeRun(serializeRun(run), CONTENT);
      if (!r.ok) throw new Error(`walked state rejected: ${r.error}`);
      expect(r.run).toEqual(run);
      n++;
    }
    expect(n).toBeGreaterThan(500);
    const kinds = new Set(ALL.map((r) => r.phase.kind));
    expect([...kinds].sort()).toEqual(['battle', 'cache', 'ended', 'map', 'mystery', 'recruit', 'shrine']);
  });
});

describe('deserializeRun rejects broken text without throwing (review focus 1)', () => {
  it('rejects truncated, empty, null and non-object text', () => {
    const good = serializeRun(BATTLE_MID);
    rejectText(good.slice(0, good.length >> 1));
    rejectText('');
    rejectText('null');
    rejectText('42');
    rejectText('[]');
    rejectText('"text"');
    rejectText('{}');
    rejectText('{"version":1,"checksum":"0000000000000000"}');
  });

  it('rejects a flipped checksum character', () => {
    const parsed = JSON.parse(serializeRun(MAP)) as { checksum: string };
    const c = parsed.checksum;
    parsed.checksum = (c.charAt(0) === 'a' ? 'b' : 'a') + c.slice(1);
    expect(rejectText(JSON.stringify(parsed))).toMatch(/checksum/i);
  });

  it('rejects tampered data with the old checksum', () => {
    const parsed = JSON.parse(serializeRun(MAP)) as { run: { souls: number } };
    parsed.run.souls += 5;
    expect(rejectText(JSON.stringify(parsed))).toMatch(/checksum/i);
  });

  it('rejects another version', () => {
    const parsed = JSON.parse(serializeRun(MAP)) as Json;
    parsed.version = 2;
    expect(rejectText(JSON.stringify(parsed))).toMatch(/version/i);
  });

  it('rejects hostile inputs: __proto__ keys, numbers, null, 10 MB strings, deep nesting', () => {
    rejectText('{"__proto__":{"version":1},"version":1}');
    const proto = JSON.parse(serializeRun(MAP).replace('"souls":', '"__proto__":{"x":1},"souls":')) as Json;
    proto.checksum = fnv1a64(canonicalize(proto.run));
    expect(rejectText(JSON.stringify(proto))).toMatch(/unknown key/);
    rejectText('1');
    rejectText('null');
    rejectText('x'.repeat(10 * 1024 * 1024));
    rejectText(JSON.stringify('x'.repeat(10 * 1024 * 1024)));
    const deep = '['.repeat(1000) + ']'.repeat(1000);
    rejectText(deep);
    const deepRun = `{"version":1,"checksum":"${fnv1a64(canonicalize(JSON.parse(deep)))}","run":${deep}}`;
    rejectText(deepRun);
    const deeper = '{"a":'.repeat(200000) + '1' + '}'.repeat(200000);
    rejectText(`{"version":1,"checksum":"x","run":${deeper}}`);
  });

  it('validateRun never throws for non-run values', () => {
    for (const v of [null, undefined, 0, 'run', [], {}, { version: 1 }, Object.create(null)]) {
      expect(() => validateRun(v, CONTENT)).not.toThrow();
      expect(validateRun(v, CONTENT)).toEqual(expect.any(String));
    }
  });
});

describe('validateRun rejects inconsistent runs with a matching checksum', () => {
  it('rejects the review-focus cases', () => {
    // A battle with every player creature fainted and no winner.
    expect(
      rejectForged(BATTLE_MID, (r) => {
        for (const c of players(r)) Object.assign(c, { hp: 0, fainted: true, status: null });
      }),
    ).toMatch(/winner/);
    expect(rejectForged(MAP, (r) => (r.party = [0, 1, 2, 3].map(() => party(r)[0])))).toMatch(/party/);
    expect(rejectForged(MAP, (r) => (r.souls = -1))).toMatch(/souls/);
    expect(rejectForged(MAP, (r) => (r.at = mapNodes(MAP, MAP.zone === 0 ? 1 : 0)[2]!.id))).toMatch(/at/);
    expect(rejectForged(SHRINE, (r) => (phase(r).nodeId = 'z0-l9-c9'))).toMatch(/node/);
    expect(rejectForged(BATTLE_MID, (r) => (phase(r).nodeId = 'nowhere'))).toMatch(/node/);
    expect(
      rejectForged(MAP, (r) => {
        const node = (r.maps as Array<{ layers: Json[][] }>)[1]!.layers[2]![0]!;
        node.type = node.type === 'wild' ? 'cache' : 'wild';
      }),
    ).toMatch(/map/);
    expect(rejectForged(RECRUIT, (r) => (phase(r).speciesId = 'nonexistent'))).toMatch(/species/);
    expect(rejectForged(WON, (r) => (r.zone = 1))).toMatch(/won|zone|at/);
  });

  it('rejects unknown keys on the run, stats, members, phases and the embedded battle', () => {
    const cases: Array<[RunState, (r: Json) => void]> = [
      [MAP, (r) => (r.extra = 1)],
      [MAP, (r) => ((r.stats as Json).extra = 0)],
      [MAP, (r) => (party(r)[0]!.extra = 'x')],
      [MAP, (r) => (phase(r).nodeId = MAP.at)],
      [SHRINE, (r) => (phase(r).extra = 1)],
      [RECRUIT, (r) => (phase(r).nodeId = 'z0-l0-c0')],
      [WON, (r) => (phase(r).extra = true)],
      [BATTLE_MID, (r) => (battle(r).extra = 1)],
      [BATTLE_MID, (r) => (players(r)[0]!.extra = 1)],
    ];
    for (const [run, mutate] of cases) expect(rejectForged(run, mutate)).toMatch(/unknown key/);
  });

  it('rejects malformed top-level fields', () => {
    const cases: Array<[string, (r: Json) => void]> = [
      ['version 2', (r) => (r.version = 2)],
      ['seed number', (r) => (r.seed = 5)],
      ['rng short', (r) => (r.rng = [1, 2, 3])],
      ['rng negative', (r) => (r.rng = [1, 2, 3, -1])],
      ['rng too big', (r) => (r.rng = [1, 2, 3, 2 ** 32])],
      ['two maps', (r) => (r.maps = (r.maps as unknown[]).slice(0, 2))],
      ['maps of another seed', (r) => (r.maps = startRun('other-seed', 'cindermite', CONTENT).maps)],
      ['zone 3', (r) => (r.zone = 3)],
      ['zone -1', (r) => (r.zone = -1)],
      ['zone 1.5', (r) => (r.zone = 1.5)],
      ['at number', (r) => (r.at = 4)],
      ['party not array', (r) => (r.party = {})],
      ['souls 1.5', (r) => (r.souls = 1.5)],
      ['souls string', (r) => (r.souls = '3')],
      ['stats negative', (r) => (stats(r).nodesCleared = -1)],
      ['stats missing', (r) => delete (r.stats as Json).creaturesLost],
      ['stats fractional', (r) => (stats(r).creaturesLost = 0.5)],
      ['unknown phase', (r) => (r.phase = { kind: 'camp' })],
      ['phase null', (r) => (r.phase = null)],
    ];
    for (const [name, mutate] of cases) expect(rejectForged(MAP, mutate), name).toBeTruthy();
  });

  it('rejects party members out of range', () => {
    expect(rejectForged(MAP, (r) => (party(r)[0]!.hp = 0))).toMatch(/hp/);
    expect(rejectForged(MAP, (r) => (party(r)[0]!.hp = 9999))).toMatch(/hp/);
    expect(rejectForged(MAP, (r) => (party(r)[0]!.hp = 2.5))).toMatch(/hp/);
    expect(rejectForged(MAP, (r) => (party(r)[0]!.speciesId = 'nonexistent'))).toMatch(/species/);
    expect(rejectForged(MAP, (r) => (party(r)[0]!.speciesId = '__proto__'))).toMatch(/species/);
    expect(rejectForged(MAP, (r) => (r.party = []))).toMatch(/party/);
    expect(rejectForged(SHRINE, (r) => (r.party = []))).toMatch(/party/);
    expect(rejectForged(WON, (r) => (r.party = []))).toMatch(/party/);
    // A lost run has no survivors.
    expect(deserializeRun(serializeRun(LOST), CONTENT).ok).toBe(true);
    expect(LOST.party).toEqual([]);
  });

  it('rejects a stale or dead-end position', () => {
    // The boss node has no successors: a map phase standing on it is a soft-lock.
    const boss = MAP.maps[MAP.zone]!.layers[6]![0]!.id;
    expect(rejectForged(MAP, (r) => (r.at = boss))).toMatch(/at|node/);
    // Even with the node count adjusted to match, a map phase on the boss node is a dead end.
    expect(
      rejectForged(MAP, (r) => {
        r.at = boss;
        stats(r).nodesCleared = 7 * MAP.zone + 7;
      }),
    ).toMatch(/boss/);
    expect(rejectForged(MAP, (r) => (r.at = 'z9-l0-c0'))).toMatch(/at/);
    // Stats must agree with the zone reached.
    expect(rejectForged(MAP, (r) => (stats(r).bossesBeaten += 1))).toMatch(/bossesBeaten/);
    expect(rejectForged(WON, (r) => (stats(r).bossesBeaten = 2))).toMatch(/bossesBeaten/);
    expect(rejectForged(MAP, (r) => (stats(r).nodesCleared = 0))).toMatch(/nodesCleared/);
  });

  it('rejects inconsistent battle phases', () => {
    const shrineNode = (run: RunState) => mapNodes(run, run.zone).find((n) => n.type !== 'wild' && n.type !== 'elite' && n.type !== 'boss');
    expect(rejectForged(BATTLE_MID, (r) => (battle(r).winner = 'player'))).toMatch(/winner/);
    expect(
      rejectForged(BATTLE_MID, (r) => {
        const b = battle(r);
        for (const c of (b.teams as Teams).enemy) Object.assign(c, { hp: 0, fainted: true, status: null });
        Object.assign(b, { winner: 'player', intent: null });
      }),
    ).toMatch(/finished|winner/);
    expect(rejectForged(BATTLE_MID, (r) => (phase(r).nodeId = shrineNode(BATTLE_MID)!.id))).toMatch(/node/);
    // A combat node that is not reachable from `at`.
    const unreachable = mapNodes(BATTLE_MID, BATTLE_MID.zone).find(
      (n) => n.id !== (BATTLE_MID.phase as { nodeId: string }).nodeId && (n.type === 'wild' || n.type === 'elite') && n.layer >= 3,
    )!;
    expect(rejectForged(BATTLE_MID, (r) => (phase(r).nodeId = unreachable.id))).toMatch(/available|node/);
    expect(rejectForged(BATTLE_MID, (r) => (r.party = party(r).slice(0, 1)))).toMatch(/party|team/);
    expect(
      rejectForged(BATTLE_MID, (r) => {
        const other = CONTENT.species.find((s) => s.id !== party(r)[0]!.speciesId)!.id;
        party(r)[0]!.speciesId = other;
        party(r)[0]!.hp = 1;
      }),
    ).toMatch(/species/);
    expect(rejectForged(BATTLE_MID, (r) => (battle(r).seed = 'other'))).toMatch(/seed/);
    expect(rejectForged(BATTLE_MID, (r) => (battle(r).telegraph = !battle(r).telegraph))).toMatch(/telegraph|intent/);
    expect(rejectForged(BATTLE_MID, (r) => (battle(r).turn = 0))).toMatch(/turn/);
    expect(rejectForged(BATTLE_MID, (r) => (battle(r).version = 2))).toMatch(/version/);
    expect(rejectForged(BOSS_BATTLE, (r) => delete battle(r).script)).toMatch(/script|intent/);
    expect(rejectForged(BATTLE_MID, (r) => (battle(r).script = [0]))).toMatch(/script|intent/);
    expect(
      rejectForged(BATTLE_MID, (r) => {
        const e = (battle(r).teams as Teams).enemy[0]!;
        e.speciesId = e.speciesId === 'skirrow' ? 'tidewisp' : 'skirrow';
      }),
    ).toMatch(/enemy|maxHp|focus|intent/);
    expect(
      rejectForged(BATTLE_MID, (r) => {
        const e = (battle(r).teams as Teams).enemy[0]!;
        e.maxHp = (e.maxHp as number) + 1;
      }),
    ).toMatch(/enemy/);
    // A battle at turn 1 is exactly the fresh battle built from the party and the node.
    expect(rejectForged(BATTLE_FRESH, (r) => (players(r)[0]!.hp = (players(r)[0]!.hp as number) - 1))).toMatch(/fresh/);
    expect(rejectForged(BATTLE_FRESH, (r) => (party(r)[0]!.hp = (party(r)[0]!.hp as number) - 1))).toMatch(/fresh/);
  });

  it('rejects inconsistent event phases', () => {
    for (const run of [SHRINE, CACHE, MYSTERY]) {
      const other = mapNodes(run, run.zone).find((n) => n.type !== run.phase.kind && n.layer === 0)!;
      expect(rejectForged(run, (r) => (phase(r).nodeId = other.id))).toMatch(/node|type/);
      expect(rejectForged(run, (r) => (phase(r).nodeId = 7))).toMatch(/node/);
    }
    // An event node that is not reachable from `at`.
    const far = mapNodes(SHRINE, SHRINE.zone).find(
      (n) => n.type === 'shrine' && n.id !== (SHRINE.phase as { nodeId: string }).nodeId && n.layer !== mapNodes(SHRINE, SHRINE.zone).find((m) => m.id === (SHRINE.phase as { nodeId: string }).nodeId)!.layer,
    );
    if (far) expect(rejectForged(SHRINE, (r) => (phase(r).nodeId = far.id))).toMatch(/available/);
    expect(rejectForged(RECRUIT, (r) => (phase(r).hp = 0))).toMatch(/hp/);
    expect(rejectForged(RECRUIT, (r) => (phase(r).hp = (phase(r).hp as number) + 1))).toMatch(/hp/);
    expect(
      rejectForged(RECRUIT, (r) => {
        phase(r).speciesId = CONTENT.species.find((s) => s.id !== (RECRUIT.phase as { speciesId: string }).speciesId)!.id;
      }),
    ).toMatch(/species|recruit/);
    expect(rejectForged(RECRUIT, (r) => (r.at = null))).toMatch(/recruit|at/);
    expect(rejectForged(WON, (r) => (phase(r).result = 'draw'))).toMatch(/result/);
    expect(rejectForged(LOST, (r) => (phase(r).result = 'won'))).toMatch(/won|party|at|bossesBeaten/);
  });
});

/** Numeric leaf paths of a JSON value. */
function numericPaths(value: unknown, path: Array<string | number> = []): Array<Array<string | number>> {
  if (typeof value === 'number') return [path];
  if (value === null || typeof value !== 'object') return [];
  const out: Array<Array<string | number>> = [];
  if (Array.isArray(value)) value.forEach((v, i) => out.push(...numericPaths(v, [...path, i])));
  else for (const [k, v] of Object.entries(value)) out.push(...numericPaths(v, [...path, k]));
  return out;
}

function bump(run: RunState, path: Array<string | number>, delta: number): Json {
  const r = clone(run);
  let at: Record<string | number, unknown> = r;
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
  const last = path[path.length - 1]!;
  at[last] = (at[last] as number) + delta;
  return r;
}

/** An accepted run must stay playable: legal actions exist (unless ended), all apply cleanly and keep it valid. */
function expectPlayable(run: RunState, label: string): void {
  const actions = legalRunActions(run, CONTENT);
  if (run.phase.kind === 'ended') {
    expect(actions, label).toEqual([]);
    return;
  }
  expect(actions.length, label).toBeGreaterThan(0);
  for (const a of actions) {
    const step = applyRunAction(run, a, CONTENT);
    expect(step.events.some((e) => e.type === 'rejected'), label).toBe(false);
    expect(validateRun(step.run, CONTENT), label).toBeNull();
  }
}

describe('mutation: every numeric field +1/-1 is either rejected or still playable', () => {
  for (const [name, run] of Object.entries(SAMPLES)) {
    it(name, () => {
      let accepted = 0;
      let rejected = 0;
      for (const path of numericPaths(run)) {
        for (const delta of [1, -1]) {
          const label = `${name} ${path.join('.')} ${delta > 0 ? '+' : ''}${delta}`;
          const text = serializeRun(bump(run, path, delta) as unknown as RunState);
          let r: ReturnType<typeof deserializeRun> | undefined;
          expect(() => (r = deserializeRun(text, CONTENT)), label).not.toThrow();
          const result = r!;
          if (result.ok) {
            accepted++;
            expectPlayable(result.run, label);
          } else {
            rejected++;
          }
        }
      }
      expect(rejected).toBeGreaterThan(0);
      expect(accepted + rejected).toBeGreaterThan(10);
    });
  }

  it('swapping a species id anywhere outside the maps is rejected or still playable', () => {
    for (const [name, run] of Object.entries(SAMPLES)) {
      const r0 = clone(run);
      const targets: Json[] = [...party(r0)];
      if (run.phase.kind === 'battle') targets.push(...Object.values(battle(r0).teams as Teams).flat());
      if (run.phase.kind === 'recruit') targets.push(phase(r0));
      targets.forEach((_, ti) => {
        for (const sp of CONTENT.species) {
          const r = clone(run);
          const ts: Json[] = [...party(r)];
          if (run.phase.kind === 'battle') ts.push(...Object.values(battle(r).teams as Teams).flat());
          if (run.phase.kind === 'recruit') ts.push(phase(r));
          ts[ti]!.speciesId = sp.id;
          const res = deserializeRun(serializeRun(r as unknown as RunState), CONTENT);
          if (res.ok) expectPlayable(res.run, `${name} target ${ti} -> ${sp.id}`);
        }
      });
    }
  });
});
