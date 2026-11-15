// Turn controller (presentation side): pick -> applyAction -> view.play -> rebuild. The sim state is
// committed before any animation and is never changed by it. While a turn's play is pending, input
// is ignored and nothing visible is rebuilt; the turn's settlement (normal end, rejection, throw or
// the watchdog) always runs exactly once and unlocks input.
import type { Content } from '../content';
import type { GameAction } from '../platform/input';
import { applyAction as simApplyAction } from '../sim/battle';
import type { Action, BattleEvent, BattleState, Side } from '../sim/state';
import type { TimerApi } from './animator';
import type { BattleView } from './battleView';
import { buildMenu, logLines } from './menu';
import type { MenuModel } from './menu';

/** The page's DOM, as the controller sees it. */
export interface BattleUi {
  /** Wires the input layer; the controller calls it exactly once. */
  bindInput(onAction: (a: GameAction) => void): void;
  setBusy(busy: boolean): void;
  appendLog(lines: string[]): void;
  /** Replaces the whole log (one string array per turn) without re-announcing it. */
  replaceLog(turns: string[][]): void;
  /** Summary, prompt, intent and choice buttons for `state`; `focusFirst` moves focus to the first enabled choice. */
  showChoices(state: BattleState, model: MenuModel, onPick: (a: Action) => void, focusFirst: boolean): void;
  /** Shows (with focus on "New battle" when `focus`) or hides the result panel. */
  showResult(result: { winner: Side; lossNote: boolean } | null, focus: boolean): void;
  /** Moves the selection among the choices for a navigation action. */
  navigate(a: GameAction): void;
}

export interface ControllerDeps {
  content: Content;
  view: BattleView | null;
  ui: BattleUi;
  timers: TimerApi;
  /** Creates battle number `n` (1-based). */
  newBattle(n: number): BattleState;
  reducedMotion(): boolean;
  applyAction?: typeof simApplyAction;
  logger?: Pick<Console, 'warn' | 'error'>;
}

export interface BattleController {
  /** Starts the next battle; ignored while a turn is pending. */
  start(): void;
  /** Plays the player's action; ignored while pending or after the end. */
  pick(action: Action): void;
  /** Handles an input-layer action. */
  onAction(a: GameAction): void;
  /** Language or text size changed: rebuild now, or once when the pending turn settles. */
  refreshText(): void;
  isPending(): boolean;
  getState(): BattleState | null;
  getBattleNo(): number;
}

/** A play that has not settled after this long is abandoned and the final state is shown. */
export function watchdogMs(eventCount: number): number {
  return Math.max(2500, 700 * eventCount);
}

export function createBattleController(deps: ControllerDeps): BattleController {
  const { content, view, ui, timers } = deps;
  const apply = deps.applyAction ?? simApplyAction;
  const logger = deps.logger ?? console;

  let state: BattleState | null = null;
  let history: Array<{ prev: BattleState; events: BattleEvent[] }> = [];
  let battleNo = 0;
  let pending = false;
  let dirty = false;
  let resultShown = false;

  const renderView = () => {
    if (!view || !state) return;
    try {
      view.render(state);
    } catch (err) {
      logger.error('battle scene render failed', err);
    }
  };

  const allLogTurns = () => history.map((h) => logLines(h.prev, h.events, content));

  const rebuild = (moveFocus: boolean) => {
    if (!state) return;
    const over = state.winner !== null;
    ui.setBusy(false);
    ui.showChoices(state, buildMenu(state, content), pick, moveFocus && !over);
    resultShown = over;
    ui.showResult(
      over ? { winner: state.winner!, lossNote: state.teams.player.some((c) => c.fainted) } : null,
      moveFocus && over,
    );
  };

  function pick(action: Action): void {
    if (pending || !state || state.winner !== null) return;
    const prev = state;
    const { state: next, events } = apply(prev, action, content);
    // The new state is final here; the animation below only shows it.
    state = next;
    history.push({ prev, events });
    pending = true;
    ui.setBusy(true);

    let settled = false;
    let watchdog: unknown;
    const settle = () => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(watchdog);
      pending = false;
      if (dirty) {
        // A language change happened mid-turn: one full rebuild, which already includes this turn.
        dirty = false;
        ui.replaceLog(allLogTurns());
      } else {
        const lines = logLines(prev, events, content);
        if (lines.length > 0) ui.appendLog(lines);
      }
      renderView();
      rebuild(true);
    };
    watchdog = timers.setTimeout(() => {
      if (settled) return;
      logger.warn('battle animation did not finish in time; showing the final state');
      settle();
    }, watchdogMs(events.length));

    let playing: Promise<void>;
    try {
      playing = view ? Promise.resolve(view.play(events, { reducedMotion: deps.reducedMotion() })) : Promise.resolve();
    } catch (err) {
      playing = Promise.reject(err);
    }
    void playing.catch((err: unknown) => logger.error('battle animation failed', err)).then(settle);
  }

  const controller: BattleController = {
    start() {
      if (pending) return;
      battleNo += 1;
      state = deps.newBattle(battleNo);
      history = [];
      dirty = false;
      ui.replaceLog([]);
      renderView();
      rebuild(true);
    },
    pick,
    onAction(a: GameAction) {
      if (!state || pending) return;
      if (state.winner !== null) {
        if (a === 'confirm' && resultShown) controller.start();
        return;
      }
      ui.navigate(a);
    },
    refreshText() {
      if (!state) return;
      if (pending) {
        dirty = true;
        return;
      }
      ui.replaceLog(allLogTurns());
      renderView();
      rebuild(false);
    },
    isPending: () => pending,
    getState: () => state,
    getBattleNo: () => battleNo,
  };

  ui.bindInput((a) => controller.onAction(a));
  return controller;
}
