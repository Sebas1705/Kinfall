import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import type { Content, MoveDef, SpeciesDef, Stats } from '../../src/content';
import { chooseEnemyMove } from '../../src/sim/ai';
import { applyAction, createBattle, legalActions } from '../../src/sim/battle';

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
  moves: [
    move({ id: 'ember_hit', element: 'ember', kind: 'damage', power: 40 }),
    move({ id: 'tide_hit', element: 'tide', kind: 'damage', power: 40 }),
    move({ id: 'tide_twin', element: 'tide', kind: 'damage', power: 40 }),
    move({ id: 'umbra_hit', element: 'umbra', kind: 'damage', power: 40 }),
    move({ id: 'big', element: 'ember', kind: 'damage', power: 90, focusCost: 5 }),
    move({ id: 'mend', element: 'thorn', kind: 'heal', power: 50, target: 'self' }),
  ],
  species: [
    // vs thorn: ember_hit is the only 200% move vs thorn
    species('blaze', ['ember'], { health: 50, power: 50, guard: 40, speed: 60, focus: 30 }, [
      'tide_hit',
      'ember_hit',
      'umbra_hit',
    ]),
    species('bramble', ['thorn'], { health: 50, power: 40, guard: 40, speed: 30, focus: 20 }, ['tide_hit', 'mend']),
    // two equal-best moves: the tie is broken by the seeded fork
    species('twin', ['tide'], { health: 50, power: 40, guard: 40, speed: 30, focus: 20 }, ['tide_hit', 'tide_twin']),
    // focus limited: 'big' costs 5 but max focus is 1
    species('tired', ['ember'], { health: 50, power: 40, guard: 40, speed: 30, focus: 10 }, ['big', 'mend', 'ember_hit']),
    // only an unaffordable damage move and a heal
    species('stuck', ['ember'], { health: 50, power: 40, guard: 40, speed: 30, focus: 10 }, ['big', 'mend']),
  ],
};

describe('chooseEnemyMove', () => {
  it('picks the super-effective move when one exists', () => {
    for (let i = 0; i < 20; i++) {
      const s = createBattle(`eff-${i}`, { speciesIds: ['bramble'] }, { speciesIds: ['blaze'] }, FX);
      expect(chooseEnemyMove(s, FX)).toBe(1);
    }
  });

  it('never picks an illegal move over 200 seeds, including focus-limited species', () => {
    for (let i = 0; i < 200; i++) {
      const enemy = ['blaze', 'bramble', 'twin', 'tired', 'stuck'][i % 5]!;
      const s = createBattle(`legal-${i}`, { speciesIds: ['bramble'] }, { speciesIds: [enemy] }, FX);
      const idx = chooseEnemyMove(s, FX);
      const sp = FX.species.find((p) => p.id === enemy)!;
      const mv = FX.moves.find((m) => m.id === sp.moves[idx])!;
      expect(mv.focusCost).toBeLessThanOrEqual(s.teams.enemy[0]!.focus);
    }
    const ids = CONTENT.species.map((p) => p.id);
    for (let i = 0; i < 50; i++) {
      const s = createBattle(`c-${i}`, { speciesIds: [ids[i % 6]!] }, { speciesIds: [ids[(i + 2) % 6]!] }, CONTENT);
      const idx = chooseEnemyMove(s, CONTENT);
      const sp = CONTENT.species.find((p) => p.id === s.teams.enemy[0]!.speciesId)!;
      const mv = CONTENT.moves.find((m) => m.id === sp.moves[idx])!;
      expect(mv.focusCost).toBeLessThanOrEqual(s.teams.enemy[0]!.focus);
    }
  });

  it('prefers an affordable damage move over a heal or an unaffordable move', () => {
    const s = createBattle('pref', { speciesIds: ['bramble'] }, { speciesIds: ['tired'] }, FX);
    expect(chooseEnemyMove(s, FX)).toBe(2);
  });

  it('falls back to a non-damage move when nothing else is legal', () => {
    const s = createBattle('fb', { speciesIds: ['bramble'] }, { speciesIds: ['stuck'] }, FX);
    expect(chooseEnemyMove(s, FX)).toBe(1);
  });

  it('is deterministic, breaks ties both ways across seeds, and leaves state untouched', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const s = createBattle(`tie-${i}`, { speciesIds: ['bramble'] }, { speciesIds: ['twin'] }, FX);
      const before = structuredClone(s);
      const a = chooseEnemyMove(s, FX);
      expect(chooseEnemyMove(s, FX)).toBe(a);
      expect(s).toEqual(before);
      seen.add(a);
    }
    expect(seen).toEqual(new Set([0, 1]));
  });

  it('does not disturb the main rng: a scripted battle is identical with and without AI calls', () => {
    const run = (probe: boolean) => {
      let s = createBattle('rngprobe', { speciesIds: ['blaze', 'bramble'] }, { speciesIds: ['twin', 'blaze'] }, FX);
      const log: unknown[] = [];
      for (let i = 0; i < 60 && s.winner === null; i++) {
        if (probe) chooseEnemyMove(s, FX);
        const legal = legalActions(s, FX);
        const r = applyAction(s, legal[i % legal.length]!, FX);
        if (probe) chooseEnemyMove(r.state, FX);
        log.push(r.events.filter((e) => e.type === 'move' && e.side === 'player'));
        s = r.state;
      }
      return { s, log };
    };
    expect(run(true)).toEqual(run(false));
  });
});

describe('telegraphed intent', () => {
  it('is null without telegraph', () => {
    const s = createBattle('n', { speciesIds: ['bramble'] }, { speciesIds: ['twin'] }, FX);
    expect(s.telegraph).toBe(false);
    expect(s.intent).toBeNull();
    expect(applyAction(s, { type: 'move', moveIndex: 0 }, FX).state.intent).toBeNull();
  });

  it('is honest: the enemy executes exactly the shown move, over 100 seeds and several turns', () => {
    let checked = 0;
    for (let i = 0; i < 100; i++) {
      let s = createBattle(
        `tele-${i}`,
        { speciesIds: ['blaze', 'bramble'] },
        { speciesIds: ['twin', 'blaze', 'tired'] },
        FX,
        { telegraph: true },
      );
      expect(s.telegraph).toBe(true);
      for (let t = 0; t < 8 && s.winner === null; t++) {
        const shown = s.intent;
        expect(shown).not.toBeNull();
        const enemy = s.teams.enemy[s.active.enemy]!;
        const sp = FX.species.find((p) => p.id === enemy.speciesId)!;
        const legal = legalActions(s, FX);
        const r = applyAction(s, legal[(i + t) % legal.length]!, FX);
        const em = r.events.find((e) => e.type === 'move' && e.side === 'enemy');
        if (em && em.type === 'move') {
          expect(em.moveId).toBe(sp.moves[shown!.moveIndex]);
          checked++;
        }
        s = r.state;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('is set right after creation, equals the AI choice and is refreshed each turn', () => {
    const s = createBattle('fresh', { speciesIds: ['bramble'] }, { speciesIds: ['blaze'] }, FX, { telegraph: true });
    expect(s.intent).toEqual({ moveIndex: chooseEnemyMove(s, FX) });
    const r = applyAction(s, { type: 'move', moveIndex: 0 }, FX);
    expect(r.state.intent).toEqual({ moveIndex: chooseEnemyMove(r.state, FX) });
  });

  it('is cleared when the battle ends', () => {
    const s = createBattle('end', { speciesIds: ['blaze'] }, { speciesIds: ['bramble'] }, FX, { telegraph: true });
    const weak = structuredClone(s);
    weak.teams.enemy[0]!.hp = 1;
    const r = applyAction(weak, { type: 'move', moveIndex: 1 }, FX);
    expect(r.state.winner).toBe('player');
    expect(r.state.intent).toBeNull();
  });
});
