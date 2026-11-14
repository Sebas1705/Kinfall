import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import type { Content, MoveDef, SpeciesDef, Stats } from '../../src/content';
import { applyAction, createBattle, legalActions } from '../../src/sim/battle';
import type { Action, BattleEvent, BattleState } from '../../src/sim/state';

// ---------------------------------------------------------------------------
// Purpose-built fixture content: numeric assertions never depend on CONTENT.
// ---------------------------------------------------------------------------

function move(m: Partial<MoveDef> & Pick<MoveDef, 'id' | 'element' | 'kind'>): MoveDef {
  return {
    names: { en: m.id, es: m.id },
    power: 0,
    focusCost: 0,
    accuracy: 100,
    target: 'enemy',
    ...m,
  };
}

function species(
  id: string,
  elements: SpeciesDef['elements'],
  base: Stats,
  moves: string[],
): SpeciesDef {
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
  moves: [
    move({ id: 'ember_hit', element: 'ember', kind: 'damage', power: 40 }),
    move({ id: 'ember_big', element: 'ember', kind: 'damage', power: 60, focusCost: 2 }),
    move({ id: 'thorn_hit', element: 'thorn', kind: 'damage', power: 40 }),
    move({ id: 'tide_hit', element: 'tide', kind: 'damage', power: 40 }),
    move({ id: 'whiff', element: 'tide', kind: 'damage', power: 40, accuracy: 0 }),
    move({ id: 'mend', element: 'thorn', kind: 'heal', power: 50, focusCost: 1, target: 'self' }),
    move({ id: 'scorch_hex', element: 'ember', kind: 'status', status: 'scorch' }),
    move({ id: 'stun_hex', element: 'gale', kind: 'status', status: 'stun' }),
  ],
  species: [
    // maxHp 200, maxFocus 3
    species('blaze', ['ember'], { health: 50, power: 50, guard: 40, speed: 60, focus: 30 }, [
      'ember_hit',
      'ember_big',
      'scorch_hex',
      'stun_hex',
    ]),
    // maxHp 200, maxFocus 2
    species('bramble', ['thorn'], { health: 50, power: 40, guard: 40, speed: 30, focus: 20 }, [
      'thorn_hit',
      'mend',
      'whiff',
    ]),
    // maxHp 200, maxFocus 1; same speed as itself (ties), tide beats ember
    species('ripple', ['tide'], { health: 50, power: 40, guard: 40, speed: 45, focus: 5 }, [
      'tide_hit',
    ]),
    // maxHp 1000, barely hurts anyone: a punching bag for multi-turn checks
    species('dummy', ['umbra'], { health: 250, power: 1, guard: 250, speed: 1, focus: 10 }, [
      'tide_hit',
    ]),
    // maxHp 4: falls to any hit
    species('mote', ['gale'], { health: 1, power: 10, guard: 10, speed: 1, focus: 10 }, [
      'tide_hit',
    ]),
  ],
};

const MOVE = (moveIndex: number): Action => ({ type: 'move', moveIndex });
const SWAP = (toIndex: number): Action => ({ type: 'swap', toIndex });

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

function edit(state: BattleState, fn: (s: BattleState) => void): BattleState {
  const s = structuredClone(state);
  fn(s);
  return s;
}

function strongestAction(state: BattleState, content: Content): Action {
  const legal = legalActions(state, content);
  const active = state.teams.player[state.active.player]!;
  const sp = content.species.find((s) => s.id === active.speciesId)!;
  let best: Action | undefined;
  let bestPower = -1;
  for (const a of legal) {
    if (a.type !== 'move') continue;
    const m = content.moves.find((x) => x.id === sp.moves[a.moveIndex])!;
    if (m.kind === 'damage' && m.power > bestPower) {
      bestPower = m.power;
      best = a;
    }
  }
  return best ?? legal[0]!;
}

function playOut(
  state: BattleState,
  content: Content,
  pick: (s: BattleState) => Action = (s) => strongestAction(s, content),
): { state: BattleState; events: BattleEvent[] } {
  let s = state;
  const all: BattleEvent[] = [];
  for (let i = 0; i < 500 && s.winner === null; i++) {
    const r = applyAction(s, pick(s), content);
    expect(r.events.some((e) => e.type === 'rejected')).toBe(false);
    all.push(...r.events);
    s = r.state;
  }
  return { state: s, events: all };
}

// ---------------------------------------------------------------------------

describe('createBattle', () => {
  it('builds full-health combatants with derived maxHp and maxFocus', () => {
    const s = createBattle('seed', { speciesIds: ['blaze', 'bramble'] }, { speciesIds: ['ripple'] }, FX);
    expect(s.version).toBe(1);
    expect(s.seed).toBe('seed');
    expect(s.turn).toBe(1);
    expect(s.winner).toBeNull();
    expect(s.intent).toBeNull();
    expect(s.active).toEqual({ player: 0, enemy: 0 });
    expect(s.teams.player[0]).toEqual({
      speciesId: 'blaze',
      hp: 200,
      maxHp: 200,
      focus: 3,
      maxFocus: 3,
      status: null,
      fainted: false,
    });
    expect(s.teams.player[1]!.maxFocus).toBe(2);
    expect(s.teams.enemy[0]!.maxFocus).toBe(1);
  });

  it('maxFocus is at least 1', () => {
    const tiny: Content = {
      moves: FX.moves,
      species: [species('tiny', ['gale'], { health: 1, power: 1, guard: 1, speed: 1, focus: 3 }, ['tide_hit'])],
    };
    const s = createBattle('x', { speciesIds: ['tiny'] }, { speciesIds: ['tiny'] }, tiny);
    expect(s.teams.player[0]!.maxFocus).toBe(1);
    expect(s.teams.player[0]!.maxHp).toBe(4);
  });

  it('throws on an unknown species, an empty team or more than 3 members', () => {
    expect(() => createBattle('x', { speciesIds: ['nope'] }, { speciesIds: ['blaze'] }, FX)).toThrow();
    expect(() => createBattle('x', { speciesIds: ['blaze'] }, { speciesIds: ['nope'] }, FX)).toThrow();
    expect(() => createBattle('x', { speciesIds: [] }, { speciesIds: ['blaze'] }, FX)).toThrow();
    expect(() => createBattle('x', { speciesIds: ['blaze'] }, { speciesIds: [] }, FX)).toThrow();
    expect(() =>
      createBattle('x', { speciesIds: ['blaze', 'blaze', 'blaze', 'blaze'] }, { speciesIds: ['blaze'] }, FX),
    ).toThrow();
  });

  it('is deterministic for a seed', () => {
    const a = createBattle('same', { speciesIds: ['blaze'] }, { speciesIds: ['ripple'] }, FX);
    const b = createBattle('same', { speciesIds: ['blaze'] }, { speciesIds: ['ripple'] }, FX);
    expect(a).toEqual(b);
  });
});

describe('damage', () => {
  it('damage formula: same-element bonus then effectiveness', () => {
    // ember move power 40, attacker power 50, defender thorn guard 40:
    // base = floor(40*50/40) = 50; STAB floor(50*125/100) = 62; x200% = 124
    const s = createBattle('dmg', { speciesIds: ['blaze'] }, { speciesIds: ['bramble'] }, FX);
    const { state, events } = applyAction(s, MOVE(0), FX);
    expect(events).toContainEqual({ type: 'damage', side: 'enemy', amount: 124, effectiveness: 200 });
    expect(state.teams.enemy[0]!.hp).toBe(200 - 124);
    // bramble answers: thorn 40 * 40 / 40 = 40, STAB 50, vs ember 50% = 25
    expect(events).toContainEqual({ type: 'damage', side: 'player', amount: 25, effectiveness: 50 });
    expect(state.teams.player[0]!.hp).toBe(200 - 25);
  });

  it('deals at least 1 damage', () => {
    const tanky: Content = {
      moves: FX.moves,
      species: [
        ...FX.species,
        species('wall', ['tide'], { health: 50, power: 1, guard: 250, speed: 1, focus: 10 }, ['ember_hit']),
      ],
    };
    // wall uses ember_hit (no STAB) on blaze: floor(40*1/40)=1, ember vs ember 100% = 1
    // blaze hits wall: floor(40*50/250)=8, STAB 10, ember vs tide 50% -> 5
    const s = createBattle('min', { speciesIds: ['blaze'] }, { speciesIds: ['wall'] }, tanky);
    const { events } = applyAction(s, MOVE(0), tanky);
    expect(events).toContainEqual({ type: 'damage', side: 'player', amount: 1, effectiveness: 100 });
    expect(events).toContainEqual({ type: 'damage', side: 'enemy', amount: 5, effectiveness: 50 });

    const zero: Content = {
      moves: [...FX.moves, move({ id: 'tap', element: 'gale', kind: 'damage', power: 1 })],
      species: [
        species('poke', ['umbra'], { health: 50, power: 1, guard: 40, speed: 99, focus: 10 }, ['tap']),
        species('rock', ['thorn'], { health: 50, power: 1, guard: 250, speed: 1, focus: 10 }, ['tap']),
      ],
    };
    // floor(1*1/250) = 0 -> clamped to 1 even at 200% (gale vs thorn)
    const z = createBattle('min', { speciesIds: ['poke'] }, { speciesIds: ['rock'] }, zero);
    expect(applyAction(z, MOVE(0), zero).events).toContainEqual({
      type: 'damage',
      side: 'enemy',
      amount: 1,
      effectiveness: 200,
    });
  });

  it('a miss emits only the move event with hit false', () => {
    const s = createBattle('miss', { speciesIds: ['bramble'] }, { speciesIds: ['mote'] }, FX);
    const { state, events } = applyAction(s, MOVE(2), FX);
    const i = events.findIndex((e) => e.type === 'move' && e.side === 'player');
    expect(events[i]).toEqual({ type: 'move', side: 'player', moveId: 'whiff', hit: false });
    // the next event is the enemy's own move: nothing followed the miss
    expect(events[i + 1]).toMatchObject({ type: 'move', side: 'enemy' });
    expect(events.some((e) => e.type === 'damage' && e.side === 'enemy')).toBe(false);
    expect(state.teams.enemy[0]!.hp).toBe(4);
  });
});

describe('applyAction', () => {
  it('does not mutate input', () => {
    const s = createBattle('pure', { speciesIds: ['blaze', 'bramble'] }, { speciesIds: ['bramble', 'mote'] }, FX);
    const snapshot = structuredClone(s);
    deepFreeze(s);
    expect(() => applyAction(s, MOVE(0), FX)).not.toThrow();
    expect(() => applyAction(s, SWAP(1), FX)).not.toThrow();
    expect(() => applyAction(s, MOVE(9), FX)).not.toThrow();
    expect(s).toEqual(snapshot);
    const after = applyAction(s, MOVE(0), FX).state;
    expect(after).not.toBe(s);
    expect(after.rng).not.toEqual(s.rng);
  });

  it('starts every turn with turnStart and advances the turn counter', () => {
    const s = createBattle('t', { speciesIds: ['blaze'] }, { speciesIds: ['bramble'] }, FX);
    const r = applyAction(s, MOVE(0), FX);
    expect(r.events[0]).toEqual({ type: 'turnStart', turn: 1 });
    expect(r.state.turn).toBe(2);
    expect(applyAction(r.state, MOVE(0), FX).events[0]).toEqual({ type: 'turnStart', turn: 2 });
  });

  it('faster creature acts first', () => {
    const moveSides = (events: BattleEvent[]) =>
      events.filter((e) => e.type === 'move').map((e) => (e as { side: string }).side);
    // blaze speed 60 > bramble speed 30
    const fast = createBattle('order', { speciesIds: ['blaze'] }, { speciesIds: ['bramble'] }, FX);
    expect(moveSides(applyAction(fast, MOVE(0), FX).events)).toEqual(['player', 'enemy']);
    const slow = createBattle('order', { speciesIds: ['bramble'] }, { speciesIds: ['blaze'] }, FX);
    expect(moveSides(applyAction(slow, MOVE(0), FX).events)).toEqual(['enemy', 'player']);
  });

  it('breaks speed ties with the seeded rng (both orders occur, each reproducible)', () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const s = createBattle(`tie-${i}`, { speciesIds: ['ripple'] }, { speciesIds: ['ripple'] }, FX);
      const a = applyAction(s, MOVE(0), FX);
      const b = applyAction(s, MOVE(0), FX);
      expect(a).toEqual(b);
      const first = a.events.find((e) => e.type === 'move') as { side: string };
      firsts.add(first.side);
    }
    expect(firsts).toEqual(new Set(['player', 'enemy']));
  });

  it('swap: changes active, emits swap first and the enemy still acts', () => {
    const s = createBattle('swap', { speciesIds: ['blaze', 'bramble'] }, { speciesIds: ['ripple'] }, FX);
    const { state, events } = applyAction(s, SWAP(1), FX);
    expect(state.active.player).toBe(1);
    expect(events[0]).toEqual({ type: 'turnStart', turn: 1 });
    expect(events[1]).toEqual({ type: 'swap', side: 'player', toIndex: 1 });
    expect(events[2]).toEqual({ type: 'move', side: 'enemy', moveId: 'tide_hit', hit: true });
    // ripple tide 40*40/40=40, STAB 50, tide vs thorn 50% -> 25, landing on bramble
    expect(events[3]).toEqual({ type: 'damage', side: 'player', amount: 25, effectiveness: 50 });
    expect(state.teams.player[1]!.hp).toBe(175);
    expect(state.teams.player[0]!.hp).toBe(200);
  });

  it('swap goes first even against a faster enemy', () => {
    const s = createBattle('swap2', { speciesIds: ['bramble', 'mote'] }, { speciesIds: ['blaze'] }, FX);
    const { events } = applyAction(s, SWAP(1), FX);
    expect(events[1]).toEqual({ type: 'swap', side: 'player', toIndex: 1 });
  });

  it('spends and regenerates focus (+1 per turn up to max)', () => {
    const s = createBattle('focus', { speciesIds: ['blaze'] }, { speciesIds: ['dummy'] }, FX);
    const r1 = applyAction(s, MOVE(1), FX); // ember_big costs 2: 3 - 2 + 1 = 2
    expect(r1.state.teams.player[0]!.focus).toBe(2);
    const r2 = applyAction(r1.state, MOVE(0), FX); // free move: 2 + 1 = 3
    expect(r2.state.teams.player[0]!.focus).toBe(3);
    const r3 = applyAction(r2.state, MOVE(0), FX); // capped at max
    expect(r3.state.teams.player[0]!.focus).toBe(3);
  });

  it('focus regenerates only for the active creature of each side, never the bench', () => {
    const s = edit(
      createBattle('bench', { speciesIds: ['blaze', 'bramble'] }, { speciesIds: ['dummy', 'ripple'] }, FX),
      (x) => {
        x.teams.player[0]!.focus = 0;
        x.teams.player[1]!.focus = 0;
        x.teams.enemy[0]!.focus = 0;
        x.teams.enemy[1]!.focus = 0;
      },
    );
    const r = applyAction(s, MOVE(0), FX);
    expect(r.state.teams.player.map((c) => c.focus)).toEqual([1, 0]);
    expect(r.state.teams.enemy.map((c) => c.focus)).toEqual([1, 0]);
    // after swapping, the newcomer regenerates and the creature now on the bench does not
    const r2 = applyAction(r.state, SWAP(1), FX);
    expect(r2.state.teams.player.map((c) => c.focus)).toEqual([1, 1]);
  });

  it('heal restores floor(maxHp * power / 100) capped at maxHp', () => {
    const s = edit(createBattle('heal', { speciesIds: ['bramble'] }, { speciesIds: ['mote'] }, FX), (x) => {
      x.teams.player[0]!.hp = 50;
    });
    const r = applyAction(s, MOVE(1), FX);
    // bramble (speed 30) outpaces mote (speed 1): it heals before mote's hit
    expect(r.events[1]).toEqual({ type: 'move', side: 'player', moveId: 'mend', hit: true });
    expect(r.events[2]).toEqual({ type: 'heal', side: 'player', amount: 100 });
    const near = edit(s, (x) => {
      x.teams.player[0]!.hp = 190;
    });
    const r2 = applyAction(near, MOVE(1), FX);
    expect(r2.events[2]).toEqual({ type: 'heal', side: 'player', amount: 10 });
  });

  it('status moves apply once with the pinned turns', () => {
    const s = createBattle('status', { speciesIds: ['blaze'] }, { speciesIds: ['ripple'] }, FX);
    const r = applyAction(s, MOVE(2), FX);
    expect(r.events[1]).toEqual({ type: 'move', side: 'player', moveId: 'scorch_hex', hit: true });
    expect(r.events[2]).toEqual({ type: 'status', side: 'enemy', status: 'scorch' });
    expect(r.state.teams.enemy[0]!.status).toEqual({ id: 'scorch', turns: 3 });
    // already statused: move event only, status unchanged
    const r2 = applyAction(r.state, MOVE(3), FX);
    expect(r2.events[1]).toEqual({ type: 'move', side: 'player', moveId: 'stun_hex', hit: true });
    expect(r2.events.some((e) => e.type === 'status')).toBe(false);
    expect(r2.state.teams.enemy[0]!.status).toEqual({ id: 'scorch', turns: 3 });

    const stun = applyAction(s, MOVE(3), FX);
    expect(stun.state.teams.enemy[0]!.status).toEqual({ id: 'stun', turns: 1 });
    expect(stun.events).toContainEqual({ type: 'status', side: 'enemy', status: 'stun' });
  });

  it('an enemy with no affordable move passes its action', () => {
    const s = edit(createBattle('pass', { speciesIds: ['blaze'] }, { speciesIds: ['bramble'] }, FX), (x) => {
      x.teams.enemy[0]!.focus = 0;
    });
    const broke: Content = {
      moves: FX.moves,
      species: FX.species.map((sp) => (sp.id === 'bramble' ? { ...sp, moves: ['mend'] } : sp)),
    };
    const r = applyAction(s, MOVE(0), broke);
    expect(r.events.filter((e) => e.type === 'move')).toEqual([
      { type: 'move', side: 'player', moveId: 'ember_hit', hit: true },
    ]);
    expect(r.state.teams.enemy[0]!.focus).toBe(1);
  });

  it('a fainted enemy is replaced by the next living one and does not act', () => {
    const s = createBattle('faint', { speciesIds: ['blaze'] }, { speciesIds: ['mote', 'bramble'] }, FX);
    const { state, events } = applyAction(s, MOVE(0), FX);
    expect(events.slice(1)).toEqual([
      { type: 'move', side: 'player', moveId: 'ember_hit', hit: true },
      // the formula gives 500 but mote only had 4 hp: the event reports the hp actually lost
      { type: 'damage', side: 'enemy', amount: 4, effectiveness: 200 },
      { type: 'fainted', side: 'enemy' },
      { type: 'swap', side: 'enemy', toIndex: 1 },
    ]);
    expect(state.teams.enemy[0]).toMatchObject({ hp: 0, fainted: true });
    expect(state.active.enemy).toBe(1);
    expect(state.winner).toBeNull();
  });

  it('a fainted player creature must be swapped out with a free swap', () => {
    const s = edit(createBattle('pfaint', { speciesIds: ['bramble', 'ripple'] }, { speciesIds: ['blaze'] }, FX), (x) => {
      x.teams.player[0]!.hp = 1;
    });
    const r = applyAction(s, MOVE(0), FX);
    expect(r.events.slice(1)).toEqual([
      { type: 'move', side: 'enemy', moveId: 'ember_hit', hit: true },
      { type: 'damage', side: 'player', amount: 1, effectiveness: 200 },
      { type: 'fainted', side: 'player' },
    ]);
    expect(r.state.winner).toBeNull();
    expect(r.state.active.player).toBe(0);
    expect(legalActions(r.state, FX)).toEqual([SWAP(1)]);
    expect(applyAction(r.state, MOVE(0), FX).events).toEqual([{ type: 'rejected', reason: 'illegal' }]);
    const after = applyAction(r.state, SWAP(1), FX);
    // the forced replacement is free: only the swap, no enemy action, no turn, no rng draw
    expect(after.events).toEqual([{ type: 'swap', side: 'player', toIndex: 1 }]);
    expect(after.state).toEqual({ ...r.state, active: { player: 1, enemy: 0 } });
    expect(after.state.teams.enemy).toEqual(r.state.teams.enemy);
    expect(after.state.turn).toBe(r.state.turn);
    expect(after.state.rng).toEqual(r.state.rng);
    // the next action resolves a normal turn against the newcomer (blaze 60 outpaces ripple 45)
    const next = applyAction(after.state, MOVE(0), FX);
    expect(next.events[0]).toEqual({ type: 'turnStart', turn: r.state.turn });
    expect(next.events.filter((e) => e.type === 'move').map((e) => (e as { side: string }).side)).toEqual([
      'enemy',
      'player',
    ]);
    expect(next.events).toContainEqual({ type: 'move', side: 'player', moveId: 'tide_hit', hit: true });
    expect(next.state.turn).toBe(r.state.turn + 1);
  });

  it('a forced swap offers every living bench creature and none that fainted', () => {
    const s = edit(
      createBattle('pick', { speciesIds: ['bramble', 'ripple', 'dummy'] }, { speciesIds: ['blaze'] }, FX),
      (x) => {
        x.teams.player[0]!.hp = 0;
        x.teams.player[0]!.fainted = true;
      },
    );
    expect(legalActions(s, FX)).toEqual([SWAP(1), SWAP(2)]);
    expect(applyAction(s, SWAP(2), FX).events).toEqual([{ type: 'swap', side: 'player', toIndex: 2 }]);
    const dead = edit(s, (x) => {
      x.teams.player[1]!.hp = 0;
      x.teams.player[1]!.fainted = true;
    });
    expect(legalActions(dead, FX)).toEqual([SWAP(2)]);
    expect(applyAction(dead, SWAP(1), FX).events).toEqual([{ type: 'rejected', reason: 'illegal' }]);
  });

  it('damage events reconcile with hp lost over a whole battle', () => {
    const { state, events } = playOut(
      createBattle('ledger', { speciesIds: ['blaze', 'ripple'] }, { speciesIds: ['bramble', 'mote', 'ripple'] }, FX),
      FX,
    );
    for (const side of ['player', 'enemy'] as const) {
      const dealt = events.reduce((n, e) => (e.type === 'damage' && e.side === side ? n + e.amount : n), 0);
      const healed = events.reduce((n, e) => (e.type === 'heal' && e.side === side ? n + e.amount : n), 0);
      const lost = state.teams[side].reduce((n, c) => n + c.maxHp - c.hp, 0);
      expect(dealt - healed).toBe(lost);
    }
  });

  it('win and loss', () => {
    const win = playOut(createBattle('w', { speciesIds: ['blaze'] }, { speciesIds: ['bramble', 'mote'] }, FX), FX);
    expect(win.state.winner).toBe('player');
    expect(win.events.at(-1)).toEqual({ type: 'end', winner: 'player' });
    expect(win.events.filter((e) => e.type === 'end')).toHaveLength(1);

    const loss = playOut(createBattle('l', { speciesIds: ['bramble', 'mote'] }, { speciesIds: ['blaze'] }, FX), FX);
    expect(loss.state.winner).toBe('enemy');
    expect(loss.events.at(-1)).toEqual({ type: 'end', winner: 'enemy' });
    expect(loss.state.teams.player.every((c) => c.fainted && c.hp === 0)).toBe(true);
  });

  it('determinism: the same scripted battle twice gives deep-equal final states', () => {
    const run = () =>
      playOut(createBattle('det', { speciesIds: ['ripple', 'blaze'] }, { speciesIds: ['blaze', 'ripple'] }, FX), FX);
    const a = run();
    const b = run();
    expect(a.state.winner).not.toBeNull();
    expect(a).toEqual(b);
  });
});

describe('rejections', () => {
  const base = createBattle('rej', { speciesIds: ['blaze', 'bramble', 'ripple'] }, { speciesIds: ['bramble'] }, FX);

  const cases: [string, BattleState, Action, 'illegal' | 'ended' | 'focus'][] = [
    ['moveIndex 9', base, MOVE(9), 'illegal'],
    ['moveIndex -1', base, MOVE(-1), 'illegal'],
    ['moveIndex 4 (one past the end)', base, MOVE(4), 'illegal'],
    ['moveIndex non-integer', base, MOVE(0.5), 'illegal'],
    ['swap to the active index', base, SWAP(0), 'illegal'],
    [
      'swap to a fainted creature',
      edit(base, (s) => {
        s.teams.player[1]!.hp = 0;
        s.teams.player[1]!.fainted = true;
      }),
      SWAP(1),
      'illegal',
    ],
    ['swap out of range (3)', base, SWAP(3), 'illegal'],
    ['swap out of range (-1)', base, SWAP(-1), 'illegal'],
    [
      'any move after winner is set',
      edit(base, (s) => {
        s.winner = 'player';
      }),
      MOVE(0),
      'ended',
    ],
    [
      'an illegal action after winner is set',
      edit(base, (s) => {
        s.winner = 'enemy';
      }),
      SWAP(9),
      'ended',
    ],
    [
      'focus cost above current focus',
      edit(base, (s) => {
        s.teams.player[0]!.focus = 1;
      }),
      MOVE(1),
      'focus',
    ],
  ];

  for (const [name, state, action, reason] of cases) {
    it(`rejects ${name} as '${reason}' without changing state`, () => {
      const before = structuredClone(state);
      const r = applyAction(state, action, FX);
      expect(r.events).toEqual([{ type: 'rejected', reason }]);
      expect(r.state).toEqual(before);
      expect(state).toEqual(before);
    });
  }
});

describe('legalActions', () => {
  it('lists moves the active can pay for and swaps to living bench members', () => {
    const s = edit(
      createBattle('legal', { speciesIds: ['blaze', 'bramble', 'ripple'] }, { speciesIds: ['bramble'] }, FX),
      (x) => {
        x.teams.player[0]!.focus = 1;
        x.teams.player[2]!.fainted = true;
        x.teams.player[2]!.hp = 0;
      },
    );
    expect(legalActions(s, FX)).toEqual([MOVE(0), MOVE(2), MOVE(3), SWAP(1)]);
    expect(legalActions(edit(s, (x) => (x.winner = 'player')), FX)).toEqual([]);
  });

  it('never includes an action that applyAction would reject, and misses none it accepts', () => {
    const candidates: Action[] = [];
    for (let i = -1; i <= 5; i++) candidates.push(MOVE(i), SWAP(i));
    for (let seed = 0; seed < 25; seed++) {
      let s = createBattle(
        `walk-${seed}`,
        { speciesIds: ['blaze', 'bramble', 'ripple'] },
        { speciesIds: ['ripple', 'bramble', 'blaze'] },
        FX,
      );
      for (let step = 0; step < 200; step++) {
        const legal = legalActions(s, FX);
        for (const a of candidates) {
          const rejected = applyAction(s, a, FX).events.some((e) => e.type === 'rejected');
          const listed = legal.some((l) => JSON.stringify(l) === JSON.stringify(a));
          expect(rejected).toBe(!listed);
        }
        if (s.winner !== null) break;
        expect(legal.length).toBeGreaterThan(0);
        // vary the walk deterministically
        s = applyAction(s, legal[(seed + step) % legal.length]!, FX).state;
      }
      expect(s.winner).not.toBeNull();
    }
  });
});

describe('CONTENT smoke', () => {
  it('a full battle between two CONTENT teams ends with a winner, deterministically', () => {
    const ids = CONTENT.species.map((s) => s.id);
    const run = () =>
      playOut(
        createBattle(
          'smoke',
          { speciesIds: ids.slice(0, 3) },
          { speciesIds: ids.slice(3, 6) },
          CONTENT,
        ),
        CONTENT,
      );
    const a = run();
    expect(a.state.winner).not.toBeNull();
    expect(a.events.at(-1)).toEqual({ type: 'end', winner: a.state.winner });
    expect(run()).toEqual(a);
  });
});
