import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import type { Content } from '../../src/content';
import { applyAction, createBattle } from '../../src/sim/battle';
import { canonicalize, deserializeState, fnv1a64, hashState, serializeState } from '../../src/sim/codec';
import type { BattleState } from '../../src/sim/state';

const PLAYER = { speciesIds: ['cindermite', 'brambleback'] };
const ENEMY = { speciesIds: ['tidewisp', 'skirrow'] };

function fresh(telegraph = false): BattleState {
  return createBattle('codec-seed', PLAYER, ENEMY, CONTENT, { telegraph });
}

function played(): BattleState {
  let s = fresh(true);
  s = applyAction(s, { type: 'move', moveIndex: 0 }, CONTENT).state;
  s = applyAction(s, { type: 'move', moveIndex: 2 }, CONTENT).state;
  return s;
}

function reject(text: string, content?: Content): string {
  const r = deserializeState(text, content);
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error('unreachable');
  expect(r.error.length).toBeGreaterThan(0);
  return r.error;
}

/** Serialises a mutated copy of `s` with a checksum that matches the (invalid) content. */
function forge(mutate: (s: Record<string, unknown>) => void): string {
  const copy = JSON.parse(JSON.stringify(fresh(true))) as Record<string, unknown>;
  mutate(copy);
  const text = serializeState(copy as unknown as BattleState);
  return text;
}

describe('canonicalize', () => {
  it('is key-order independent', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
    expect(canonicalize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('sorts nested keys by code unit, not locale, and keeps array order', () => {
    expect(canonicalize({ b: [3, { z: 1, a: 2 }], B: null, a: 'x' })).toBe(
      '{"B":null,"a":"x","b":[3,{"a":2,"z":1}]}',
    );
  });
});

describe('hashState', () => {
  it('implements FNV-1a 64 (published test vectors)', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('agrees with a BigInt reference implementation on real states and non-ASCII text', () => {
    const ref = (text: string): string => {
      let h = 0xcbf29ce484222325n;
      for (let i = 0; i < text.length; i++) {
        h = ((h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n) & 0xffffffffffffffffn;
      }
      return h.toString(16).padStart(16, '0');
    };
    for (const text of ['', 'é€😀 mixed ünïcode', canonicalize(fresh(true)), canonicalize(played())]) {
      expect(fnv1a64(text)).toBe(ref(text));
    }
  });

  it('is 16 lowercase hex characters', () => {
    expect(hashState(fresh())).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when any field changes, including telegraph', () => {
    expect(hashState(fresh(true))).not.toBe(hashState(fresh(false)));
    const s = fresh();
    const t = structuredClone(s);
    t.turn += 1;
    expect(hashState(t)).not.toBe(hashState(s));
  });

  it('matches recorded golden literals', () => {
    expect(hashState(fresh(false))).toBe('78971dac47b976ac');
    expect(hashState(played())).toBe('7b24d6a94b83f2a8');
  });
});

describe('serializeState / deserializeState', () => {
  it('round-trips a fresh and a played state', () => {
    for (const s of [fresh(), fresh(true), played()]) {
      const r = deserializeState(serializeState(s), CONTENT);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error('unreachable');
      expect(hashState(r.state)).toBe(hashState(s));
      expect(r.state).toEqual(s);
    }
  });

  it('rejects broken text without throwing', () => {
    const good = serializeState(played());
    reject(good.slice(0, good.length >> 1));
    const i = good.indexOf('"hp"') + 6;
    reject(good.slice(0, i) + (good.charAt(i) === '9' ? '8' : '9') + good.slice(i + 1));
    reject('');
    reject('{}');
    reject('null');
    reject('[]');
    reject('42');
    reject('"text"');
  });

  it('rejects an unsupported version', () => {
    const v2 = serializeState(fresh()).replace(/"version":1}$/, '"version":2}');
    expect(reject(v2)).toMatch(/version/i);
  });

  it('rejects a valid text with a tampered hp (checksum mismatch)', () => {
    const text = serializeState(played());
    const obj = JSON.parse(text) as { state: { teams: { player: { hp: number }[] } } };
    const first = obj.state.teams.player[0];
    if (!first) throw new Error('missing combatant');
    first.hp = first.hp === 1 ? 2 : 1;
    expect(reject(JSON.stringify(obj))).toMatch(/checksum/i);
  });

  it('rejects structurally invalid states even with a matching checksum', () => {
    const cases: [string, (s: Record<string, unknown>) => void][] = [
      ['hp above maxHp', (s) => (team(s, 'player')[0]!.hp = 9999)],
      ['negative hp', (s) => (team(s, 'player')[0]!.hp = -1)],
      ['fractional hp', (s) => (team(s, 'player')[0]!.hp = 1.5)],
      ['focus above maxFocus', (s) => (team(s, 'enemy')[0]!.focus = 99)],
      ['fainted with hp > 0', (s) => (team(s, 'player')[0]!.fainted = true)],
      ['hp 0 but not fainted', (s) => (team(s, 'player')[0]!.hp = 0)],
      ['unknown status id', (s) => (team(s, 'player')[0]!.status = { id: 'burn', turns: 1 })],
      ['status turns zero', (s) => (team(s, 'player')[0]!.status = { id: 'stun', turns: 0 })],
      ['empty team', (s) => ((s.teams as Record<string, unknown[]>).enemy = [])],
      ['team of four', (s) => ((s.teams as Record<string, unknown[]>).enemy = [0, 1, 2, 3].map(() => team(s, 'enemy')[0]))],
      ['active out of range', (s) => ((s.active as Record<string, number>).player = 5)],
      ['negative turn', (s) => (s.turn = -1)],
      ['bad winner', (s) => (s.winner = 'nobody')],
      ['bad intent', (s) => (s.intent = { moveIndex: -2 })],
      ['telegraph not boolean', (s) => (s.telegraph = 'yes')],
      ['rng wrong length', (s) => (s.rng = [1, 2, 3])],
      ['rng not uint32', (s) => (s.rng = [1, 2, 3, -4])],
      ['seed not a string', (s) => (s.seed = 7)],
    ];
    for (const [name, mutate] of cases) {
      const err = reject(forge(mutate));
      expect(err, name).not.toMatch(/checksum/i);
    }
  });

  it('rejects unknown species only when content is given', () => {
    const text = forge((s) => (team(s, 'enemy')[0]!.speciesId = 'nonexistent'));
    expect(deserializeState(text).ok).toBe(true);
    expect(reject(text, CONTENT)).toMatch(/species/i);
  });
});

function team(s: Record<string, unknown>, side: 'player' | 'enemy'): Record<string, unknown>[] {
  return (s.teams as Record<string, Record<string, unknown>[]>)[side] as Record<string, unknown>[];
}
