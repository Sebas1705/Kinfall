// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '@webgames/core/content';
import { setLang } from '@webgames/core/platform/i18n';
import { STRINGS } from '@webgames/core/platform/strings';
import { applyAction, createBattle, legalActions } from '@webgames/core/sim/battle';
import type { BattleEvent, BattleState } from '@webgames/core/sim/state';
import { buildMenu, logLines } from '@webgames/core/models/menu';
import { renderMenu } from '../../src/view/menu';

const PLAYER = { speciesIds: ['cindermite', 'tidewisp', 'skirrow'] };
const ENEMY = { speciesIds: ['brambleback', 'dusklurk', 'emberveil'] };

function battle(telegraph = true): BattleState {
  return createBattle('menu-test', PLAYER, ENEMY, CONTENT, { telegraph });
}

const sp = (id: string) => CONTENT.species.find((s) => s.id === id)!;
const mv = (id: string) => CONTENT.moves.find((m) => m.id === id)!;

afterEach(() => setLang('en'));

describe('buildMenu', () => {
  it('lists every move of the active creature, then every legal swap in team order', () => {
    const s = battle();
    const model = buildMenu(s, CONTENT);
    const moves = sp('cindermite').moves;
    expect(model.entries.map((e) => e.action)).toEqual([
      ...moves.map((_, moveIndex) => ({ type: 'move', moveIndex })),
      { type: 'swap', toIndex: 1 },
      { type: 'swap', toIndex: 2 },
    ]);
    expect(model.entries.slice(0, 4).map((e) => e.label)).toEqual(moves.map((id) => mv(id).names.en));
    expect(model.entries[4]!.label).toBe('Swap to Tidewisp');
    expect(model.entries[5]!.label).toBe('Swap to Skirrow');
    expect(model.mustSwap).toBe(false);
    expect(model.prompt).toBe('What will Cindermite do?');
  });

  it('enabled entries are exactly the legal actions', () => {
    const s = battle();
    s.teams.player[0]!.focus = 0;
    const model = buildMenu(s, CONTENT);
    const enabled = model.entries.filter((e) => !e.disabled).map((e) => e.action);
    expect(enabled).toEqual(legalActions(s, CONTENT));
  });

  it('disables moves whose focus cost exceeds the current focus', () => {
    const s = battle();
    s.teams.player[0]!.focus = 0;
    const flags = buildMenu(s, CONTENT).entries.slice(0, 4).map((e) => e.disabled);
    // ember_lash 0, cinder_burst 1, smoulder_hex 1, dusk_claw 0
    expect(flags).toEqual([false, true, true, false]);
    s.teams.player[0]!.focus = 1;
    expect(buildMenu(s, CONTENT).entries.slice(0, 4).every((e) => !e.disabled)).toBe(true);
  });

  it('gives each move a detail with its element and focus cost', () => {
    const model = buildMenu(battle(), CONTENT);
    // A no-break space keeps the cost on the same line as its label.
    expect(model.entries[0]!.detail).toBe('Ember · Focus 0');
    expect(model.entries[1]!.detail).toBe('Ember · Focus 1');
    setLang('es');
    expect(buildMenu(battle(), CONTENT).entries[1]!.detail).toBe('Brasa · Concentración 1');
  });

  it('gives each swap a detail with the hp of that creature', () => {
    const s = battle();
    s.teams.player[1]!.hp = 5;
    const swap = buildMenu(s, CONTENT).entries.find((e) => e.action.type === 'swap')!;
    expect(swap.detail).toBe(`HP 5/${s.teams.player[1]!.maxHp}`);
  });

  it('is stable: the same state gives the same model', () => {
    const s = battle();
    expect(buildMenu(s, CONTENT)).toEqual(buildMenu(structuredClone(s), CONTENT));
  });

  it('shows the telegraphed enemy move in both languages', () => {
    const s = battle();
    const enemyMoves = sp('brambleback').moves;
    for (let i = 0; i < enemyMoves.length; i++) {
      s.intent = { moveIndex: i };
      setLang('en');
      expect(buildMenu(s, CONTENT).intent).toBe(`Next: ${mv(enemyMoves[i]!).names.en}`);
      setLang('es');
      expect(buildMenu(s, CONTENT).intent).toBe(`Siguiente: ${mv(enemyMoves[i]!).names.es}`);
    }
  });

  it('shows the stunned label when the enemy is stunned and has no intent', () => {
    const s = battle();
    s.intent = null;
    s.teams.enemy[0]!.status = { id: 'stun', turns: 1 };
    expect(buildMenu(s, CONTENT).intent).toBe(STRINGS.en['intent.stunned']);
    setLang('es');
    expect(buildMenu(s, CONTENT).intent).toBe(STRINGS.es['intent.stunned']);
  });

  it('has no intent without a telegraph', () => {
    expect(buildMenu(battle(false), CONTENT).intent).toBeNull();
  });

  it('offers only swaps when the active creature has fallen', () => {
    const s = battle();
    s.teams.player[0]!.hp = 0;
    s.teams.player[0]!.fainted = true;
    const model = buildMenu(s, CONTENT);
    expect(model.mustSwap).toBe(true);
    expect(model.entries.map((e) => e.action)).toEqual([
      { type: 'swap', toIndex: 1 },
      { type: 'swap', toIndex: 2 },
    ]);
    expect(model.prompt).toBe(STRINGS.en['menu.chooseNext']);
  });

  it('is empty once the battle is over', () => {
    const s = battle();
    s.winner = 'player';
    s.intent = null;
    const model = buildMenu(s, CONTENT);
    expect(model.entries).toEqual([]);
    expect(model.intent).toBeNull();
  });

  it('keeps Spanish names and labels within 24 characters for a 320 px layout', () => {
    for (const s of CONTENT.species) expect(s.names.es.length, s.id).toBeLessThanOrEqual(24);
    for (const m of CONTENT.moves) expect(m.names.es.length, m.id).toBeLessThanOrEqual(24);
    setLang('es');
    const ids = CONTENT.species.map((s) => s.id);
    for (let i = 0; i < ids.length; i++) {
      const team = { speciesIds: [ids[i]!, ids[(i + 1) % ids.length]!, ids[(i + 2) % ids.length]!] };
      const model = buildMenu(createBattle('es', team, ENEMY, CONTENT), CONTENT);
      for (const e of model.entries) expect(e.label.length, e.label).toBeLessThanOrEqual(24);
    }
  });
});

describe('logLines', () => {
  it('names the creature that enters on a swap, and uses it for later events', () => {
    const s = battle();
    const events: BattleEvent[] = [
      { type: 'turnStart', turn: 1 },
      { type: 'swap', side: 'player', toIndex: 1 },
      { type: 'move', side: 'enemy', moveId: 'bramble_whip', hit: true },
      { type: 'damage', side: 'player', amount: 4, effectiveness: 200 },
    ];
    expect(logLines(s, events, CONTENT)).toEqual([
      'Tidewisp enters the fight.',
      'Brambleback uses Bramble Whip.',
      "Tidewisp takes 4 damage. It's very effective!",
    ]);
  });

  it('names the fallen enemy, then its replacement', () => {
    const s = battle();
    const events: BattleEvent[] = [
      { type: 'fainted', side: 'enemy' },
      { type: 'swap', side: 'enemy', toIndex: 1 },
    ];
    expect(logLines(s, events, CONTENT)).toEqual(['Brambleback has fallen.', 'Dusklurk enters the fight.']);
  });

  it('matches a real turn in Spanish and skips events without text', () => {
    setLang('es');
    const s = battle();
    const { events } = applyAction(s, { type: 'move', moveIndex: 0 }, CONTENT);
    const lines = logLines(s, events, CONTENT);
    expect(lines.length).toBe(events.filter((e) => e.type !== 'turnStart').length);
    expect(lines.some((l) => l.includes('Latigazo de Brasa'))).toBe(true);
    for (const l of lines) expect(l).not.toMatch(/\{\w+\}/);
  });
});

describe('renderMenu', () => {
  it('renders one real button per entry and reports the picked action', () => {
    const host = document.createElement('div');
    const s = battle();
    s.teams.player[0]!.focus = 0;
    const model = buildMenu(s, CONTENT);
    const onPick = vi.fn();
    const buttons = renderMenu(host, model, onPick);
    expect(buttons.length).toBe(model.entries.length);
    expect(host.querySelectorAll('button').length).toBe(model.entries.length);
    for (const b of buttons) {
      expect(b.type).toBe('button');
      expect(b.hasAttribute('data-action')).toBe(false);
    }
    expect(buttons[1]!.disabled).toBe(true);
    expect(buttons[0]!.textContent).toContain('Ember Lash');
    expect(buttons[0]!.textContent).toContain('Ember · Focus 0');
    buttons[0]!.click();
    expect(onPick).toHaveBeenCalledWith({ type: 'move', moveIndex: 0 });
    buttons[1]!.click();
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('replaces the previous buttons on each render', () => {
    const host = document.createElement('div');
    renderMenu(host, buildMenu(battle(), CONTENT), () => {});
    renderMenu(host, buildMenu(battle(), CONTENT), () => {});
    expect(host.querySelectorAll('button').length).toBe(6);
  });
});
