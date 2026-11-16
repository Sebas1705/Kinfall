// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '../../src/content';
import { setLang } from '../../src/platform/i18n';
import { createRunStorage, type RunStorage, type StorageLike } from '../../src/platform/runStorage';
import { serializeRun } from '../../src/sim/run/codec';
import { applyRunAction, startRun } from '../../src/sim/run/run';
import type { RunState } from '../../src/sim/run/types';
import { createBattleController } from '../../src/view/controller';
import type { BattleUi } from '../../src/view/controller';
import { createRouter } from '../../src/view/router';
import { createRunController } from '../../src/view/runController';
import { createRunUi } from '../../src/view/runUi';

const KEY = 'webgames.run.v1';
const CRAFTED = 'CRAFTED';
const MOVE0 = { type: 'move', moveIndex: 0 } as const;

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function fakeStorage(): StorageLike & { data: Map<string, string>; failing: boolean; failClear: boolean; sets: number } {
  const data = new Map<string, string>();
  const st = {
    data,
    failing: false,
    failClear: false,
    sets: 0,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      st.sets++;
      if (st.failing) throw new Error('quota exceeded');
      data.set(k, v);
    },
    removeItem: (k: string) => {
      if (st.failClear) throw new Error('blocked');
      data.delete(k);
    },
  };
  return st;
}

/** Real storage, except that the marker text loads `crafted` without validation (tests craft battles). */
function storageWith(st: ReturnType<typeof fakeStorage>, crafted?: RunState): RunStorage {
  const real = createRunStorage(st, CONTENT);
  if (!crafted) return real;
  st.data.set(KEY, CRAFTED);
  return { ...real, load: () => (st.data.get(KEY) === CRAFTED ? { kind: 'ok', run: structuredClone(crafted) } : real.load()) };
}

function fakeBattleUi() {
  return {
    bindInput: vi.fn(),
    setBusy: vi.fn(),
    appendLog: vi.fn(),
    replaceLog: vi.fn(),
    showChoices: vi.fn(),
    showResult: vi.fn(),
    navigate: vi.fn(),
  } satisfies BattleUi;
}

function setup(opts: { st?: ReturnType<typeof fakeStorage>; crafted?: RunState } = {}) {
  const st = opts.st ?? fakeStorage();
  document.body.innerHTML = `
    <main id="screens">
      <div id="save-warning" role="status"><div class="save-warning" hidden><p></p><button type="button">x</button></div></div>
      <section data-screen="title"></section>
      <section data-screen="map"></section>
      <section data-screen="battle"><h2>Battle</h2><div id="battle-footer" hidden></div></section>
      <section data-screen="event"></section>
      <section data-screen="end"></section>
      <section id="run-log-panel" hidden><div role="log" aria-live="polite"></div></section>
    </main>
    <p id="seed"></p>`;
  const root = document.getElementById('screens')!;
  const screen = (id: string) => root.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;
  const router = createRouter(root);
  const ui = createRunUi({
    title: screen('title'),
    map: screen('map'),
    event: screen('event'),
    end: screen('end'),
    battleFooter: document.getElementById('battle-footer')!,
    warning: document.getElementById('save-warning')!,
    log: document.getElementById('run-log-panel')!,
    seed: document.getElementById('seed')!,
  });
  const storage = storageWith(st, opts.crafted);
  const battleUi = fakeBattleUi();
  const logger = { warn: vi.fn(), error: vi.fn() };
  const controller = createRunController({
    content: CONTENT,
    storage,
    router,
    ui,
    newSeed: () => 'SEEDSEED',
    freshSeed: () => 'FRESH001',
    logger,
    createBattle: (hooks) =>
      createBattleController({
        content: CONTENT,
        view: null,
        ui: battleUi,
        timers: { setTimeout: () => 0, clearTimeout: () => {} },
        reducedMotion: () => true,
        logger,
        ...hooks,
      }),
  });
  const battle = () => controller.getBattle();
  const runLog = () => [...document.querySelectorAll('#run-log-panel [role="log"] p')].map((p) => p.textContent);
  return { st, root, screen, router, controller, battleUi, battle, logger, runLog };
}

const warningBox = () => document.querySelector<HTMLElement>('.save-warning')!;
const titleSeed = (screen: (id: string) => HTMLElement) => screen('title').querySelector<HTMLInputElement>('input[name="seed"]')!.value;

/** A run standing in its first wild battle. */
function inBattle(seed: string, starter = 'cindermite'): RunState {
  const run = startRun(seed, starter, CONTENT);
  const node = run.maps[0]!.layers[0]![0]!;
  return applyRunAction(run, { type: 'node', nodeId: node.id }, CONTENT).run;
}

/** First seed whose crafted battle ends with `kind` after one MOVE0 turn. */
function craftedBattle(kind: 'recruit' | 'ended', edit: (r: RunState) => void): RunState {
  for (let i = 0; i < 200; i++) {
    const run = inBattle(`craft-${i}`);
    edit(run);
    if (applyRunAction(run, { type: 'battle', action: MOVE0 }, CONTENT).run.phase.kind === kind) return run;
  }
  throw new Error(`no seed gives ${kind}`);
}

const winning = () =>
  craftedBattle('recruit', (r) => {
    if (r.phase.kind === 'battle') r.phase.battle.teams.enemy[0]!.hp = 1;
  });
const losing = () =>
  craftedBattle('ended', (r) => {
    r.party[0]!.hp = 1;
    if (r.phase.kind === 'battle') r.phase.battle.teams.player[0]!.hp = 1;
  });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setLang('en');
});
afterEach(() => {
  vi.restoreAllMocks();
  setLang('en');
});

describe('run controller: title and map', () => {
  it('showTitle renders the title with the new seed and no Continue when nothing is saved', () => {
    const { controller, router, screen } = setup();
    controller.showTitle();
    expect(router.current()).toBe('title');
    expect(titleSeed(screen)).toBe('SEEDSEED');
    expect(screen('title').querySelector<HTMLButtonElement>('[data-action="continue"]')!.disabled).toBe(true);
  });

  it('start saves the new run and shows the map (an empty run log stays hidden)', () => {
    const { controller, router, st, screen } = setup();
    controller.start('seed-a', 'brambleback');
    expect(router.current()).toBe('map');
    const run = controller.getRun()!;
    expect(run.seed).toBe('seed-a');
    expect(st.data.get(KEY)).toBe(serializeRun(run));
    expect(screen('map').querySelectorAll('button[data-node]:not([disabled])').length).toBe(run.maps[0]!.layers[0]!.length);
    expect(document.getElementById('run-log-panel')!.hidden).toBe(true);
    expect(document.getElementById('seed')!.textContent).toBe('Seed: seed-a');
  });

  it('the title "New run" button goes through start', () => {
    const { controller, router, screen } = setup();
    controller.showTitle();
    screen('title').querySelector<HTMLButtonElement>('[data-action="new-run"]')!.click();
    expect(router.current()).toBe('map');
    expect(controller.getRun()!.seed).toBe('SEEDSEED');
  });

  it('an illegal node pick changes nothing and does not save', () => {
    const { controller, st } = setup();
    controller.start('seed-c', 'cindermite');
    const before = controller.getRun();
    const sets = st.sets;
    controller.pickNode('z0-l4-c0');
    expect(controller.getRun()).toEqual(before);
    expect(st.sets).toBe(sets);
  });

  it('Escape on the map does nothing destructive', () => {
    const { controller, router, st } = setup();
    controller.start('seed-esc', 'cindermite');
    const before = structuredClone(controller.getRun());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    expect(router.current()).toBe('map');
    expect(controller.getRun()).toEqual(before);
    expect(st.data.get(KEY)).toBe(serializeRun(before!));
  });
});

describe('run controller: battles', () => {
  it('picking a wild node shows the battle screen and starts the saved battle state', () => {
    const { controller, router, st, screen, battle, battleUi, runLog } = setup();
    controller.start('seed-b', 'cindermite');
    const node = controller.getRun()!.maps[0]!.layers[0]![0]!;
    const before = st.sets;
    screen('map').querySelector<HTMLButtonElement>(`button[data-node="${node.id}"]`)!.click();
    const run = controller.getRun()!;
    expect(run.phase.kind).toBe('battle');
    expect(st.sets).toBe(before + 1);
    expect(st.data.get(KEY)).toBe(serializeRun(run));
    expect(router.current()).toBe('battle');
    expect(battle().getState()).toEqual(run.phase.kind === 'battle' ? run.phase.battle : null);
    expect(battleUi.replaceLog).toHaveBeenLastCalledWith([]);
    expect(runLog()).toEqual(['You head to: Wild creature.']);
    expect(document.getElementById('run-log-panel')!.hidden).toBe(true);
  });

  it('every battle turn is applied through the run and autosaved', async () => {
    const { controller, st, battle } = setup();
    controller.start('seed-turn', 'brambleback');
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    const sets = st.sets;
    battle().pick(MOVE0);
    await flush();
    const run = controller.getRun()!;
    expect(st.sets).toBe(sets + 1);
    expect(st.data.get(KEY)).toBe(serializeRun(run));
    if (run.phase.kind === 'battle') expect(battle().getState()).toEqual(run.phase.battle);
  });

  it('a rejected battle action keeps the state, logs a warning and does not save', async () => {
    const { controller, st, battle, logger } = setup();
    controller.start('seed-rej', 'cindermite');
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    const run = structuredClone(controller.getRun());
    const state = battle().getState();
    const sets = st.sets;
    battle().pick({ type: 'move', moveIndex: 9 });
    await flush();
    expect(controller.getRun()).toEqual(run);
    expect(battle().getState()).toBe(state);
    expect(st.sets).toBe(sets);
    expect(logger.warn).toHaveBeenCalled();
    expect(battle().isPending()).toBe(false);
  });

  it('a won wild battle moves to the recruit screen only after the final turn settled', async () => {
    const { controller, router, battle, battleUi, screen, runLog } = setup({ crafted: winning() });
    controller.resume();
    expect(router.current()).toBe('battle');
    battle().pick(MOVE0);
    expect(controller.getRun()!.phase.kind).toBe('recruit'); // committed and saved first
    expect(router.current()).toBe('battle'); // still showing the final turn
    await flush();
    expect(battleUi.appendLog).toHaveBeenCalled();
    expect(router.current()).toBe('event');
    expect(screen('event').querySelector('h2')!.textContent).toBe('A creature wants to join');
    expect(document.activeElement).toBe(screen('event').querySelector('button[data-choice]'));
    expect(runLog()).toEqual([]); // a clean wild win has no run-level events (no loss, no souls)
  });

  it('a lost run goes to the end screen with the stats, the ended save stays until New run', async () => {
    const { controller, router, battle, screen, st, runLog } = setup({ crafted: losing() });
    controller.resume();
    battle().pick(MOVE0);
    await flush();
    expect(router.current()).toBe('end');
    const end = screen('end');
    expect(end.querySelector('h2')!.textContent).toContain('Run lost');
    expect(end.querySelector('.end-stats')!.textContent).toContain('Creatures lost');
    expect(runLog()).toContain('Your run is lost.');
    const saved = st.data.get(KEY)!;
    expect(saved).toBe(serializeRun(controller.getRun()!));

    end.querySelector<HTMLButtonElement>('[data-choice="new-run"]')!.click();
    expect(st.data.has(KEY)).toBe(false);
    expect(router.current()).toBe('title');
    expect(titleSeed(screen)).toBe('FRESH001');
    expect(controller.getRun()).toBeNull();
  });
});

describe('run controller: abandon from the battle screen', () => {
  const footer = () => document.getElementById('battle-footer')!;
  const abandonBtn = () => footer().querySelector<HTMLButtonElement>('[data-action="abandon"]');
  const yesBtn = () => footer().querySelector<HTMLButtonElement>('[data-action="abandon-yes"]')!;

  it('shows a labelled Abandon run button on the battle screen only in a run, in both languages', () => {
    const { controller, router } = setup();
    controller.start('seed-ab1', 'cindermite');
    expect(footer().hidden).toBe(true);
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    expect(router.current()).toBe('battle');
    expect(footer().hidden).toBe(false);
    expect(abandonBtn()!.textContent).toBe('Abandon run');
    setLang('es');
    controller.refreshText();
    expect(abandonBtn()!.textContent).toBe('Abandonar partida');
  });

  it('is absent when no run host is wired (the demo battle page)', () => {
    document.body.innerHTML = '<div id="battle-footer" hidden></div>';
    const ui = createRunUi({
      title: document.createElement('div'),
      map: document.createElement('div'),
      event: document.createElement('div'),
      end: document.createElement('div'),
      warning: document.createElement('div'),
      log: document.createElement('div'),
    });
    ui.renderBattleFooter(() => {});
    expect(document.getElementById('battle-footer')!.childElementCount).toBe(0);
    expect(document.getElementById('battle-footer')!.hidden).toBe(true);
  });

  it('asks first, then clears the save and shows the title with a fresh seed', () => {
    const { controller, router, st, screen } = setup();
    controller.start('seed-ab2', 'cindermite');
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    abandonBtn()!.click();
    expect(router.current()).toBe('battle'); // only the confirmation so far
    expect(st.data.has(KEY)).toBe(true);
    expect(document.activeElement).toBe(footer().querySelector('[data-action="abandon-no"]'));
    yesBtn().click();
    expect(st.data.has(KEY)).toBe(false);
    expect(controller.getRun()).toBeNull();
    expect(router.current()).toBe('title');
    expect(titleSeed(screen)).toBe('FRESH001');
    expect(screen('title').querySelector<HTMLButtonElement>('[data-action="continue"]')!.disabled).toBe(true);
  });

  it('Keep playing restores the button and focus; the battle is untouched', () => {
    const { controller, router, st } = setup();
    controller.start('seed-ab3', 'cindermite');
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    const saved = st.data.get(KEY);
    abandonBtn()!.click();
    footer().querySelector<HTMLButtonElement>('[data-action="abandon-no"]')!.click();
    expect(abandonBtn()).not.toBeNull();
    expect(document.activeElement).toBe(abandonBtn());
    expect(router.current()).toBe('battle');
    expect(st.data.get(KEY)).toBe(saved);
  });

  it('is ignored while a battle turn is still playing', async () => {
    const { controller, router, st, battle } = setup();
    controller.start('seed-ab4', 'cindermite');
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    abandonBtn()!.click();
    battle().pick(MOVE0);
    expect(battle().isPending()).toBe(true);
    yesBtn().click();
    expect(controller.getRun()).not.toBeNull();
    expect(router.current()).toBe('battle');
    expect(st.data.has(KEY)).toBe(true);
    await flush();
    expect(battle().isPending()).toBe(false);
  });
});

describe('run controller: event screens', () => {
  it('picking an event choice applies it, saves, logs the lines and shows the map', () => {
    const crafted = startRun('seed-ev', 'cindermite', CONTENT);
    crafted.phase = { kind: 'recruit', speciesId: 'skirrow', hp: 5 };
    const { controller, router, screen, st, runLog } = setup({ crafted });
    controller.resume();
    expect(router.current()).toBe('event');
    const sets = st.sets;
    screen('event').querySelector<HTMLButtonElement>('button[data-choice]')!.click();
    expect(controller.getRun()!.party.map((m) => m.speciesId)).toEqual(['cindermite', 'skirrow']);
    expect(st.sets).toBe(sets + 1);
    expect(runLog()).toEqual(['Skirrow joins your party.']);
    expect(router.current()).toBe('map');
    expect(document.getElementById('run-log-panel')!.hidden).toBe(false);
  });

  it('a full-party recruit opens with focus on "Let it go", not on a Replace entry', () => {
    const crafted = startRun('seed-full', 'cindermite', CONTENT);
    crafted.party = [
      { speciesId: 'cindermite', hp: 5 },
      { speciesId: 'skirrow', hp: 6 },
      { speciesId: 'tidewisp', hp: 7 },
    ];
    crafted.phase = { kind: 'recruit', speciesId: 'dusklurk', hp: 9 };
    const { controller, router } = setup({ crafted });
    controller.resume();
    expect(router.current()).toBe('event');
    expect((document.activeElement as HTMLElement).textContent).toBe('Let it go');
  });

  it('resume into a shrine shows the event screen; Spanish refresh re-renders it', () => {
    const crafted = startRun('seed-sh', 'cindermite', CONTENT);
    crafted.phase = { kind: 'shrine', nodeId: crafted.maps[0]!.layers[0]![0]!.id };
    const { controller, router, screen } = setup({ crafted });
    controller.resume();
    expect(router.current()).toBe('event');
    expect(screen('event').querySelector('h2')!.textContent).toBe('A quiet shrine');
    setLang('es');
    controller.refreshText();
    expect(screen('event').querySelector('h2')!.textContent).toBe('Un santuario tranquilo');
  });

  it('resume into an ended run shows the end screen', () => {
    const crafted = startRun('seed-end', 'cindermite', CONTENT);
    crafted.phase = { kind: 'ended', result: 'lost' };
    const { controller, router } = setup({ crafted });
    controller.resume();
    expect(router.current()).toBe('end');
  });
});

describe('run controller: resume and saves', () => {
  it('resuming a saved mid-battle run shows the battle screen with the same BattleState and an empty log', async () => {
    const st = fakeStorage();
    const mid = inBattle('seed-mid', 'tidewisp');
    const after = applyRunAction(mid, { type: 'battle', action: MOVE0 }, CONTENT).run;
    expect(after.phase.kind).toBe('battle');
    st.data.set(KEY, serializeRun(after));
    const { controller, router, battle, battleUi } = setup({ st });
    controller.showTitle();
    document.querySelector<HTMLButtonElement>('[data-action="continue"]')!.click();
    expect(router.current()).toBe('battle');
    expect(battle().getState()).toEqual(after.phase.kind === 'battle' ? after.phase.battle : null);
    expect(battleUi.replaceLog).toHaveBeenLastCalledWith([]);
    expect(battleUi.showChoices).toHaveBeenLastCalledWith(battle().getState(), expect.anything(), expect.any(Function), true);
  });

  it('resume loads a saved map run', () => {
    const st = fakeStorage();
    const saved = startRun('seed-e', 'tidewisp', CONTENT);
    st.data.set(KEY, serializeRun(saved));
    const { controller, router } = setup({ st });
    controller.resume();
    expect(router.current()).toBe('map');
    expect(controller.getRun()).toEqual(saved);
  });

  it('a failing save shows the warning once per streak, keeps playing and retries later saves', async () => {
    const { controller, st, router, battle } = setup();
    st.failing = true;
    controller.start('seed-d', 'cindermite');
    expect(router.current()).toBe('map');
    expect(warningBox().hidden).toBe(false);
    expect(warningBox().textContent).toContain('Could not save your run: quota exceeded. You can keep playing.');
    warningBox().querySelector('button')!.click();
    expect(warningBox().hidden).toBe(true);
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    expect(router.current()).toBe('battle');
    expect(warningBox().hidden).toBe(true);
    st.failing = false;
    battle().pick(MOVE0);
    await flush();
    expect(st.data.get(KEY)).toBe(serializeRun(controller.getRun()!));
    expect(st.sets).toBe(3);
  });

  it('the save warning hides after a later successful save and shows again on a new failure streak', async () => {
    const { controller, st, battle } = setup();
    st.failing = true;
    controller.start('seed-w', 'cindermite');
    expect(warningBox().hidden).toBe(false);
    expect(warningBox().querySelectorAll('p').length).toBe(1);
    st.failing = false;
    controller.pickNode(controller.getRun()!.maps[0]!.layers[0]![0]!.id);
    expect(warningBox().hidden).toBe(true); // a successful save ends the streak
    st.failing = true;
    battle().pick(MOVE0);
    await flush();
    expect(warningBox().hidden).toBe(false); // a new streak warns again
  });

  it('abandon asks first, clears the save, resets the banner and prefills a fresh seed', () => {
    const { controller, router, st, screen } = setup();
    st.failing = true;
    controller.start('seed-f', 'cindermite');
    expect(warningBox().hidden).toBe(false);
    st.failing = false;
    st.data.set(KEY, 'something');
    screen('map').querySelector<HTMLButtonElement>('[data-action="abandon"]')!.click();
    expect(router.current()).toBe('map'); // only a confirmation so far
    expect(st.data.has(KEY)).toBe(true);
    screen('map').querySelector<HTMLButtonElement>('[data-action="abandon-yes"]')!.click();
    expect(st.data.has(KEY)).toBe(false);
    expect(controller.getRun()).toBeNull();
    expect(router.current()).toBe('title');
    expect(warningBox().hidden).toBe(true);
    expect(titleSeed(screen)).toBe('FRESH001');
    expect(screen('title').querySelector<HTMLButtonElement>('[data-action="continue"]')!.disabled).toBe(true);
  });

  it('a failed clear on abandon shows a notice instead of failing silently', () => {
    const { controller, st, screen, router } = setup();
    controller.start('seed-h', 'cindermite');
    st.failClear = true;
    controller.abandon();
    expect(router.current()).toBe('title');
    expect(warningBox().hidden).toBe(false);
    expect(warningBox().textContent).toContain('Could not delete your saved run: blocked.');
    expect(screen('title').querySelector<HTMLButtonElement>('[data-action="continue"]')!.disabled).toBe(false);
  });

  it('a corrupt save shows the notice and "Discard save" clears it', () => {
    const st = fakeStorage();
    st.data.set(KEY, '{garbage');
    const { controller, screen } = setup({ st });
    controller.showTitle();
    const title = screen('title');
    expect(title.textContent).toContain('Your saved run is damaged');
    title.querySelector<HTMLButtonElement>('[data-action="discard"]')!.click();
    title.querySelector<HTMLButtonElement>('[data-action="discard-yes"]')!.click();
    expect(st.data.has(KEY)).toBe(false);
    expect(title.querySelector('[data-action="discard"]')).toBeNull();
  });

  it('refreshText re-renders the map and the run log in the new language', () => {
    const { controller, screen, runLog } = setup();
    controller.start('seed-g', 'cindermite');
    setLang('es');
    controller.refreshText();
    expect(screen('map').querySelector('h2')!.textContent).toBe('Zona 1: Marjal de Ceniza');
    expect(runLog()).toEqual([]);
  });
});
