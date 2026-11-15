import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import type { Content, MoveDef, SpeciesDef, Stats } from '../../src/content';
import { chooseEnemyMove } from '../../src/sim/ai';
import { applyAction, battleOutcome, createBattle } from '../../src/sim/battle';
import { deserializeState, serializeState } from '../../src/sim/codec';
import type { BattleEvent, BattleState } from '../../src/sim/state';

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

const FX: Content = {
  zones: [], bosses: [], starters: [],
  moves: [
    move({ id: 'ember_hit', element: 'ember', kind: 'damage', power: 40 }),
    move({ id: 'tide_hit', element: 'tide', kind: 'damage', power: 40 }),
    move({ id: 'umbra_hit', element: 'umbra', kind: 'damage', power: 40 }),
    move({ id: 'big', element: 'ember', kind: 'damage', power: 90, focusCost: 5 }),
    move({ id: 'poke', element: 'umbra', kind: 'damage', power: 200 }),
    move({ id: 'mend', element: 'thorn', kind: 'heal', power: 50, target: 'self' }),
  ],
  species: [
    // 130% of 50*4 = 260; 130% of 33*4 = floor(171.6) = 171
    species('plain', ['thorn'], { health: 50, power: 40, guard: 40, speed: 30, focus: 20 }, ['mend']),
    species('odd', ['thorn'], { health: 33, power: 40, guard: 40, speed: 30, focus: 20 }, ['mend']),
    species('wall', ['thorn'], { health: 500, power: 10, guard: 100, speed: 1, focus: 20 }, ['mend']),
    species('multi', ['ember'], { health: 50, power: 20, guard: 40, speed: 60, focus: 30 }, ['tide_hit', 'umbra_hit', 'ember_hit']),
    // max focus 1: 'big' (cost 5) is never affordable
    species('tired', ['ember'], { health: 50, power: 20, guard: 40, speed: 60, focus: 10 }, ['big', 'mend', 'ember_hit']),
    // one-shots a plain creature
    species('striker', ['umbra'], { health: 50, power: 200, guard: 40, speed: 99, focus: 20 }, ['poke']),
  ],
};

function enemyMoveId(events: BattleEvent[]): string | undefined {
  const e = events.find((ev) => ev.type === 'move' && ev.side === 'enemy');
  return e && e.type === 'move' ? e.moveId : undefined;
}

describe('carried hp', () => {
  it('starts combatants at the given hp on both teams', () => {
    const s = createBattle('hp', { speciesIds: ['plain', 'plain'], hp: [10, 30] }, { speciesIds: ['plain'], hp: [7] }, FX);
    expect(s.teams.player.map((c) => c.hp)).toEqual([10, 30]);
    expect(s.teams.player.map((c) => c.maxHp)).toEqual([200, 200]);
    expect(s.teams.enemy[0]!.hp).toBe(7);
  });

  it('rejects hp out of range, non-integer or with a length mismatch', () => {
    const mk = (hp: number[]) => () => createBattle('x', { speciesIds: ['plain', 'plain'], hp }, { speciesIds: ['plain'] }, FX);
    expect(mk([201, 5])).toThrow(/hp/);
    expect(mk([0, 5])).toThrow(/hp/);
    expect(mk([1.5, 5])).toThrow(/hp/);
    expect(mk([5])).toThrow(/hp/);
    expect(mk([5, 6, 7])).toThrow(/hp/);
    expect(() => createBattle('x', { speciesIds: ['plain'] }, { speciesIds: ['plain'], hp: [999] }, FX)).toThrow(/hp/);
    expect(mk([200, 1])).not.toThrow();
  });

  it('does not mutate the specs', () => {
    const p = { speciesIds: ['plain'], hp: [10], hpPercent: 100 };
    const copy = structuredClone(p);
    createBattle('m', p, { speciesIds: ['plain'] }, FX);
    expect(p).toEqual(copy);
  });
});

describe('hpPercent', () => {
  it('scales maxHp with integer maths and starts at full', () => {
    const s = createBattle('pct', { speciesIds: ['plain'] }, { speciesIds: ['plain', 'odd'], hpPercent: 130 }, FX);
    expect(s.teams.enemy.map((c) => [c.hp, c.maxHp])).toEqual([[260, 260], [171, 171]]);
    expect(s.teams.player[0]!.maxHp).toBe(200);
  });

  it('accepts the bounds 50 and 500 and rejects 49, 501 and non-integers', () => {
    const mk = (p: number) => () => createBattle('x', { speciesIds: ['plain'], hpPercent: p }, { speciesIds: ['plain'] }, FX);
    expect(mk(50)).not.toThrow();
    expect(mk(500)).not.toThrow();
    expect(mk(49)).toThrow(/hpPercent/);
    expect(mk(501)).toThrow(/hpPercent/);
    expect(mk(100.5)).toThrow(/hpPercent/);
  });

  it('combines with hp (hp bounded by the scaled maxHp)', () => {
    const ok = () => createBattle('x', { speciesIds: ['plain'], hp: [250], hpPercent: 130 }, { speciesIds: ['plain'] }, FX);
    expect(ok().teams.player[0]!.hp).toBe(250);
    expect(() => createBattle('x', { speciesIds: ['plain'], hp: [261], hpPercent: 130 }, { speciesIds: ['plain'] }, FX)).toThrow(/hp/);
  });
});

describe('boss scripts', () => {
  const wall = { speciesIds: ['wall'] };
  const pass = { type: 'move', moveIndex: 0 } as const; // mend on a full-hp wall: harmless

  it('shows and executes the scripted moves in turn order, cycling', () => {
    let s = createBattle('script', wall, { speciesIds: ['multi'] }, FX, { telegraph: true, script: [2, 0] });
    const wanted = [2, 0, 2, 0, 2];
    const names = ['tide_hit', 'umbra_hit', 'ember_hit'];
    for (const w of wanted) {
      expect(s.intent).toEqual({ moveIndex: w });
      const r = applyAction(s, pass, FX);
      expect(enemyMoveId(r.events)).toBe(names[w]);
      s = r.state;
    }
  });

  it('applies without telegraph too', () => {
    let s = createBattle('script-quiet', wall, { speciesIds: ['multi'] }, FX, { script: [1] });
    expect(s.intent).toBeNull();
    for (let i = 0; i < 3; i++) {
      const r = applyAction(s, pass, FX);
      expect(enemyMoveId(r.events)).toBe('umbra_hit');
      s = r.state;
    }
  });

  it('falls back to the AI on an unaffordable or invalid entry and stays honest over 100 seeds', () => {
    const tired = FX.species.find((sp) => sp.id === 'tired')!;
    for (let i = 0; i < 100; i++) {
      for (const script of [[0], [0, 2], [9], [2, 0, 1]]) {
        let s = createBattle(`honest-${i}`, wall, { speciesIds: ['tired'] }, FX, { telegraph: true, script });
        for (let t = 0; t < 4; t++) {
          const shown = s.intent?.moveIndex;
          expect(shown).toBeDefined();
          const idx = script[(s.turn - 1) % script.length]!;
          const legal = idx === 1 || idx === 2; // entry 0 costs 5 focus (max 1), 9 is out of range
          if (legal) expect(shown).toBe(idx);
          else {
            const { script: _drop, ...plain } = s;
            expect(shown).toBe(chooseEnemyMove(plain, FX));
          }
          const r = applyAction(s, pass, FX);
          expect(enemyMoveId(r.events)).toBe(tired.moves[shown!]);
          s = r.state;
        }
      }
    }
  });

  it('does not change the main rng stream compared with no script when the choice is the same', () => {
    const a = createBattle('rng', wall, { speciesIds: ['multi'] }, FX, { telegraph: true });
    const idx = a.intent!.moveIndex;
    const b = createBattle('rng', wall, { speciesIds: ['multi'] }, FX, { telegraph: true, script: [idx] });
    expect(b.rng).toEqual(a.rng);
    expect(applyAction(b, pass, FX).state.rng).toEqual(applyAction(a, pass, FX).state.rng);
  });

  it('rejects empty or malformed scripts', () => {
    for (const script of [[], [-1], [1.5], [NaN]]) {
      expect(() => createBattle('x', wall, { speciesIds: ['multi'] }, FX, { script })).toThrow(/script/);
    }
  });

  it('does not mutate the input script or state', () => {
    const script = [1, 0];
    const s = createBattle('pure', wall, { speciesIds: ['multi'] }, FX, { telegraph: true, script });
    const frozen = structuredClone(s);
    applyAction(s, pass, FX);
    expect(s).toEqual(frozen);
    script.push(5);
    expect(s.script).toEqual([1, 0]);
  });
});

describe('state shape', () => {
  it('has no script key unless a script is given', () => {
    const s = createBattle('shape', { speciesIds: ['plain'], hp: [5], hpPercent: 200 }, { speciesIds: ['plain'] }, FX);
    expect('script' in s).toBe(false);
    expect(JSON.stringify(s)).not.toContain('script');
    const t = applyAction(s, { type: 'move', moveIndex: 0 }, FX).state;
    expect('script' in t).toBe(false);
  });

  it('keeps the script across turns and round-trips through the codec', () => {
    const s = createBattle('rt', { speciesIds: ['wall'] }, { speciesIds: ['multi'] }, FX, { script: [1, 0] });
    const t = applyAction(s, { type: 'move', moveIndex: 0 }, FX).state;
    expect(t.script).toEqual([1, 0]);
    expect(deserializeState(serializeState(t), FX)).toEqual({ ok: true, state: t });
  });

  it('codec rejects a malformed script', () => {
    const s = createBattle('bad', { speciesIds: ['wall'] }, { speciesIds: ['multi'] }, FX, { script: [1] });
    for (const bad of [[], [-1], [1.5], 'x', null]) {
      const text = serializeState({ ...s, script: bad } as unknown as BattleState);
      expect(deserializeState(text, FX).ok).toBe(false);
    }
  });

  it('smoke: works with the real content', () => {
    const a = CONTENT.species[0]!.id;
    const b = CONTENT.species[1]!;
    const s = createBattle('real', { speciesIds: [a] }, { speciesIds: [b.id], hpPercent: 150 }, CONTENT, { telegraph: true, script: [0] });
    expect(s.teams.enemy[0]!.maxHp).toBe(Math.floor((b.base.health * 4 * 150) / 100));
    expect(s.intent).not.toBeNull();
  });
});

describe('battleOutcome', () => {
  it('lists the player team in order with hp and fainted flags, plus the winner', () => {
    const s0 = createBattle('out', { speciesIds: ['plain', 'wall'], hp: [100, 40] }, { speciesIds: ['plain'], hp: [1] }, FX, { script: [0] });
    expect(battleOutcome(s0)).toEqual({
      winner: null,
      members: [
        { index: 0, hp: 100, fainted: false },
        { index: 1, hp: 40, fainted: false },
      ],
    });
  });

  it('after a scripted victory reports survivors', () => {
    // striker (speed 99) one-shots the 1-hp enemy; the enemy never acts.
    const s0 = createBattle('win', { speciesIds: ['striker', 'plain'], hp: [55, 9] }, { speciesIds: ['plain'], hp: [1] }, FX, { script: [0] });
    const { state } = applyAction(s0, { type: 'move', moveIndex: 0 }, FX);
    expect(state.winner).toBe('player');
    expect(battleOutcome(state)).toEqual({
      winner: 'player',
      members: [
        { index: 0, hp: 55, fainted: false },
        { index: 1, hp: 9, fainted: false },
      ],
    });
  });

  it('flags fainted members and a loss', () => {
    let s = createBattle('lose', { speciesIds: ['plain', 'plain'], hp: [1, 1] }, { speciesIds: ['striker'] }, FX);
    s = applyAction(s, { type: 'move', moveIndex: 0 }, FX).state;
    expect(battleOutcome(s).members[0]).toEqual({ index: 0, hp: 0, fainted: true });
    s = applyAction(s, { type: 'swap', toIndex: 1 }, FX).state;
    s = applyAction(s, { type: 'move', moveIndex: 0 }, FX).state;
    expect(battleOutcome(s)).toEqual({
      winner: 'enemy',
      members: [
        { index: 0, hp: 0, fainted: true },
        { index: 1, hp: 0, fainted: true },
      ],
    });
  });
});
