import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import type { Content } from '../../src/content';
import { applyAction, createBattle } from '../../src/sim/battle';
import { canonicalize, deserializeState, fnv1a64, hashState, serializeState, validateState } from '../../src/sim/codec';
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

describe('validateState (complete rules)', () => {
  const LIVE = (): Record<string, unknown> => JSON.parse(JSON.stringify(fresh(true))) as Record<string, unknown>;
  const enemyMoves = (s: Record<string, unknown>): string[] =>
    CONTENT.species.find((x) => x.id === team(s, 'enemy')[0]!.speciesId)!.moves;
  const costOf = (id: string): number => CONTENT.moves.find((m) => m.id === id)!.focusCost;

  function invalid(mutate: (s: Record<string, unknown>) => void, content: Content | undefined = CONTENT): string {
    const s = LIVE();
    mutate(s);
    const err = validateState(s, content);
    expect(err).not.toBeNull();
    expect(err!.length).toBeGreaterThan(0);
    return err!;
  }

  it('accepts engine states with and without content', () => {
    for (const s of [fresh(), fresh(true), played()]) {
      expect(validateState(s, CONTENT)).toBeNull();
      expect(validateState(s, undefined)).toBeNull();
    }
  });

  it('checks winner against the fainted flags', () => {
    const faintAll = (s: Record<string, unknown>, side: 'player' | 'enemy') => {
      for (const c of team(s, side)) Object.assign(c, { hp: 0, fainted: true, status: null });
    };
    expect(invalid((s) => faintAll(s, 'player'))).toMatch(/winner/);
    expect(invalid((s) => faintAll(s, 'enemy'))).toMatch(/winner/);
    expect(invalid((s) => Object.assign(s, { winner: 'player', intent: null }))).toMatch(/winner/);
    expect(invalid((s) => Object.assign(s, { winner: 'enemy', intent: null }))).toMatch(/winner/);
    // Mutual wipe counts as an enemy win.
    expect(
      invalid((s) => {
        faintAll(s, 'player');
        faintAll(s, 'enemy');
        Object.assign(s, { winner: 'player', intent: null });
      }),
    ).toMatch(/winner/);
    const ok = LIVE();
    faintAll(ok, 'player');
    faintAll(ok, 'enemy');
    Object.assign(ok, { winner: 'enemy', intent: null });
    expect(validateState(ok, CONTENT)).toBeNull();
  });

  it('rejects a live battle whose active enemy is fainted', () => {
    expect(
      invalid((s) => {
        Object.assign(team(s, 'enemy')[0]!, { hp: 0, fainted: true, status: null });
      }),
    ).toMatch(/active enemy/);
  });

  it('rejects an intent the active enemy cannot play', () => {
    expect(invalid((s) => (s.intent = { moveIndex: enemyMoves(s).length }))).toMatch(/intent/);
    expect(
      invalid((s) => {
        const i = enemyMoves(s).findIndex((id) => costOf(id) > 0);
        team(s, 'enemy')[0]!.focus = 0;
        s.intent = { moveIndex: i };
      }),
    ).toMatch(/intent/);
  });

  it('keeps intent consistent with telegraph, winner and stun', () => {
    expect(invalid((s) => (s.telegraph = false), undefined)).toMatch(/intent/);
    expect(invalid((s) => (team(s, 'enemy')[0]!.status = { id: 'stun', turns: 1 }), undefined)).toMatch(/intent/);
    expect(invalid((s) => (s.intent = null))).toMatch(/intent/);
    const quiet = JSON.parse(JSON.stringify(fresh(false))) as Record<string, unknown>;
    quiet.intent = { moveIndex: 0 };
    expect(validateState(quiet, undefined)).toMatch(/intent/);
  });

  it('requires the scripted move as intent when it is playable', () => {
    const s = createBattle('scripted', { speciesIds: ['cindermite'] }, { speciesIds: ['cindermaw'], hpPercent: 220 }, CONTENT, {
      telegraph: true,
      script: [2, 0],
    });
    expect(validateState(s, CONTENT)).toBeNull();
    expect(s.intent).toEqual({ moveIndex: 2 });
    expect(validateState({ ...s, intent: { moveIndex: 0 } }, CONTENT)).toMatch(/script/);
  });

  it('checks maxFocus and player maxHp against the species when content is given', () => {
    expect(
      invalid((s) => {
        const c = team(s, 'enemy')[0]!;
        c.maxFocus = (c.maxFocus as number) + 1;
      }),
    ).toMatch(/maxFocus/);
    expect(
      invalid((s) => {
        const c = team(s, 'player')[1]!;
        c.maxHp = (c.maxHp as number) + 1;
      }),
    ).toMatch(/maxHp/);
    // Enemy max HP may be scaled.
    const s = LIVE();
    const e = team(s, 'enemy')[1]!;
    e.maxHp = (e.maxHp as number) * 2;
    expect(validateState(s, CONTENT)).toBeNull();
  });

  it('bounds status turns and clears status on fainted combatants', () => {
    expect(invalid((s) => (team(s, 'player')[0]!.status = { id: 'scorch', turns: 4 }))).toMatch(/status/);
    expect(invalid((s) => (team(s, 'player')[0]!.status = { id: 'stun', turns: 2 }))).toMatch(/status/);
    expect(
      invalid((s) => Object.assign(team(s, 'player')[1]!, { hp: 0, fainted: true, status: { id: 'scorch', turns: 1 } })),
    ).toMatch(/status/);
  });

  it('rejects a script with non-integers or negatives', () => {
    expect(invalid((s) => (s.script = [0, 1.5]))).toMatch(/script/);
    expect(invalid((s) => (s.script = [0, -1]))).toMatch(/script/);
  });

  it('rejects unknown keys anywhere in the state', () => {
    const cases: Array<(s: Record<string, unknown>) => void> = [
      (s) => (s.extra = 1),
      (s) => ((s.teams as Record<string, unknown>).extra = []),
      (s) => ((s.active as Record<string, unknown>).extra = 0),
      (s) => (team(s, 'player')[0]!.extra = true),
      (s) => (team(s, 'player')[0]!.status = { id: 'stun', turns: 1, extra: 1 }),
      (s) => (s.intent = { moveIndex: (s.intent as { moveIndex: number }).moveIndex, extra: 1 }),
      (s) => Object.defineProperty(s, '__proto__', { value: {}, enumerable: true, configurable: true, writable: true }),
    ];
    for (const mutate of cases) expect(invalid(mutate, undefined)).toMatch(/unknown key/);
  });

  it('the codec reports the new rules through deserializeState', () => {
    const text = forge((s) => (s.winner = 'player'));
    expect(reject(text, CONTENT)).toMatch(/winner/);
    // A JSON `__proto__` key becomes an own property; with a recomputed checksum it is still rejected.
    const parsed = JSON.parse(serializeState(fresh(true)).replace('"active":', '"__proto__":{},"active":')) as {
      checksum: string;
      state: unknown;
    };
    parsed.checksum = fnv1a64(canonicalize(parsed.state));
    expect(reject(JSON.stringify(parsed), CONTENT)).toMatch(/unknown key/);
  });
});
