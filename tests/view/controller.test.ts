import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '../../src/content';
import { setLang } from '../../src/platform/i18n';
import { createBattle } from '../../src/sim/battle';
import type { BattleEvent, BattleState } from '../../src/sim/state';
import type { TimerApi } from '../../src/view/animator';
import type { BattleView } from '../../src/view/battleView';
import { createBattleController, watchdogMs } from '../../src/view/controller';
import type { BattleUi } from '../../src/view/controller';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeUi() {
  const ui = {
    bindInput: vi.fn(),
    setBusy: vi.fn(),
    appendLog: vi.fn(),
    replaceLog: vi.fn(),
    showChoices: vi.fn(),
    showResult: vi.fn(),
    navigate: vi.fn(),
  } satisfies BattleUi;
  const clear = () => Object.values(ui).forEach((f) => f.mockClear());
  return { ui, clear };
}

function fakeView(play: BattleView['play']) {
  return { render: vi.fn(), play: vi.fn(play), destroy: vi.fn() };
}

/** Timers that never fire unless a test fires them. */
const idleTimers: TimerApi = { setTimeout: () => 0, clearTimeout: () => {} };
const quiet = { warn: vi.fn(), error: vi.fn() };

function normalBattle(): BattleState {
  return createBattle(
    'ctl',
    { speciesIds: ['cindermite', 'tidewisp', 'skirrow'] },
    { speciesIds: ['brambleback', 'dusklurk', 'emberveil'] },
    CONTENT,
    { telegraph: true },
  );
}

/** One more hit wins: the fastest species against a one-creature enemy on 1 hp. */
function finalTurnBattle(): BattleState {
  const s = createBattle('end', { speciesIds: ['skirrow'] }, { speciesIds: ['brambleback'] }, CONTENT, { telegraph: true });
  s.teams.enemy[0]!.hp = 1;
  return s;
}

function setup(play: BattleView['play'], opts: { battle?: () => BattleState; timers?: TimerApi } = {}) {
  const { ui, clear } = fakeUi();
  const view = fakeView(play);
  const controller = createBattleController({
    content: CONTENT,
    view,
    ui,
    timers: opts.timers ?? idleTimers,
    newBattle: opts.battle ?? normalBattle,
    reducedMotion: () => false,
    logger: quiet,
  });
  controller.start();
  clear();
  view.render.mockClear();
  return { ui, view, controller, clear };
}

afterEach(() => {
  vi.useRealTimers();
  setLang('en');
});

describe('controller: language change while a turn is pending', () => {
  it('does not touch the log or the menu until the turn settles, then rebuilds exactly once', async () => {
    const d = deferred();
    const { ui, controller } = setup(() => d.promise);
    controller.pick({ type: 'move', moveIndex: 0 });
    expect(controller.isPending()).toBe(true);
    ui.setBusy.mockClear();

    setLang('es');
    controller.refreshText();
    controller.refreshText();
    expect(ui.appendLog).not.toHaveBeenCalled();
    expect(ui.replaceLog).not.toHaveBeenCalled();
    expect(ui.showChoices).not.toHaveBeenCalled();
    expect(ui.showResult).not.toHaveBeenCalled();
    expect(ui.setBusy).not.toHaveBeenCalled();

    d.resolve();
    await flush();
    expect(controller.isPending()).toBe(false);
    expect(ui.appendLog).not.toHaveBeenCalled();
    expect(ui.replaceLog).toHaveBeenCalledTimes(1);
    const turns = ui.replaceLog.mock.calls[0]![0] as string[][];
    expect(turns.length).toBe(1); // the pending turn, once
    expect(turns[0]!.some((l) => l.includes('Latigazo de Brasa'))).toBe(true); // in the new language
    expect(ui.showChoices).toHaveBeenCalledTimes(1);
  });

  it('rebuilds immediately when no turn is pending', () => {
    const { ui, controller } = setup(() => Promise.resolve());
    controller.refreshText();
    expect(ui.replaceLog).toHaveBeenCalledTimes(1);
    expect(ui.showChoices).toHaveBeenCalledTimes(1);
    expect(ui.showChoices.mock.calls[0]![3]).toBe(false); // focus is not moved
  });
});

describe('controller: final turn', () => {
  it('shows the result only when play settles and ignores New battle while pending', async () => {
    const d = deferred();
    const { ui, controller } = setup(() => d.promise, { battle: finalTurnBattle });
    controller.pick({ type: 'move', moveIndex: 0 });
    expect(controller.getState()!.winner).toBe('player');
    expect(controller.isPending()).toBe(true);
    expect(ui.showResult).not.toHaveBeenCalled();

    controller.start();
    controller.onAction('confirm');
    expect(controller.getBattleNo()).toBe(1);
    expect(controller.isPending()).toBe(true);
    expect(ui.replaceLog).not.toHaveBeenCalled();

    d.resolve();
    await flush();
    expect(controller.isPending()).toBe(false);
    expect(ui.showResult).toHaveBeenLastCalledWith({ winner: 'player', lossNote: false }, true);
    expect(ui.appendLog).toHaveBeenCalledTimes(1);

    controller.onAction('confirm'); // now it starts the next battle
    expect(controller.getBattleNo()).toBe(2);
    expect(ui.showResult).toHaveBeenLastCalledWith(null, false);
  });
});

describe('controller: a play that never settles', () => {
  it('trips the watchdog, snaps the view to the sim state and unlocks input', async () => {
    vi.useFakeTimers();
    const timers: TimerApi = {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
    let calls = 0;
    const late = deferred();
    const { ui, view, controller } = setup(() => (++calls === 1 ? late.promise : new Promise<void>(() => {})), { timers });
    controller.pick({ type: 'move', moveIndex: 0 });
    const events = view.play.mock.calls[0]![0] as BattleEvent[];
    vi.advanceTimersByTime(watchdogMs(events.length) - 1);
    await flush();
    expect(controller.isPending()).toBe(true);

    vi.advanceTimersByTime(1);
    await flush();
    expect(controller.isPending()).toBe(false);
    expect(view.render).toHaveBeenLastCalledWith(controller.getState());
    expect(quiet.warn).toHaveBeenCalled();
    expect(ui.appendLog).toHaveBeenCalledTimes(1);

    // The abandoned play finishing later changes nothing.
    late.resolve();
    await flush();
    expect(ui.appendLog).toHaveBeenCalledTimes(1);

    // Input works again.
    controller.pick({ type: 'move', moveIndex: 0 });
    expect(view.play).toHaveBeenCalledTimes(2);
    expect(controller.isPending()).toBe(true);
  });

  it('uses at least 2.5 s and 700 ms per event', () => {
    expect(watchdogMs(1)).toBe(2500);
    expect(watchdogMs(10)).toBe(7000);
  });
});

describe('controller: a play that fails', () => {
  it('unlocks input and appends the log once when play rejects', async () => {
    const { ui, controller } = setup(() => Promise.reject(new Error('gpu lost')));
    controller.pick({ type: 'move', moveIndex: 0 });
    await flush();
    expect(controller.isPending()).toBe(false);
    expect(ui.appendLog).toHaveBeenCalledTimes(1);
    expect(ui.showChoices).toHaveBeenCalledTimes(1);
    expect(quiet.error).toHaveBeenCalled();
  });

  it('unlocks input and appends the log once when play throws synchronously', async () => {
    const { ui, view, controller } = setup(() => {
      throw new Error('sync throw');
    });
    controller.pick({ type: 'move', moveIndex: 0 });
    await flush();
    expect(controller.isPending()).toBe(false);
    expect(ui.appendLog).toHaveBeenCalledTimes(1);
    controller.pick({ type: 'move', moveIndex: 0 });
    expect(view.play).toHaveBeenCalledTimes(2);
  });

  it('ignores picks while pending and commits the sim state before playing', async () => {
    const d = deferred();
    const { view, controller } = setup(() => d.promise);
    const before = controller.getState();
    controller.pick({ type: 'move', moveIndex: 0 });
    const after = controller.getState();
    expect(after).not.toBe(before);
    expect(after!.turn).toBe(2);
    controller.pick({ type: 'move', moveIndex: 0 });
    expect(view.play).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toBe(after);
    d.resolve();
    await flush();
  });
});

describe('controller: input wiring', () => {
  it('binds input exactly once however many battles start', () => {
    const { ui } = fakeUi();
    const controller = createBattleController({
      content: CONTENT,
      view: null,
      ui,
      timers: idleTimers,
      newBattle: normalBattle,
      reducedMotion: () => false,
      logger: quiet,
    });
    for (let i = 0; i < 4; i++) controller.start();
    expect(controller.getBattleNo()).toBe(4);
    expect(ui.bindInput).toHaveBeenCalledTimes(1);
    const onAction = ui.bindInput.mock.calls[0]![0] as (a: string) => void;
    onAction('down');
    expect(ui.navigate).toHaveBeenCalledWith('down');
  });
});
