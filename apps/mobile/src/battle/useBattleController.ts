// Mobile glue of core's battle turn controller (the same state machine the web runs): a React-state
// BattleUi, the Animated scene, and turns that go through the run session, so each turn is applied
// to the run and autosaved before its animation starts. Touch only: no navigation input.
import { CONTENT } from '@webgames/core/content';
import {
  createBattleController,
  type BattleController,
  type BattleScene,
  type BattleUi,
  type Logger,
  type TimerApi,
} from '@webgames/core/models/battleController';
import { splitBattleStep } from '@webgames/core/models/battleTurn';
import type { MenuModel } from '@webgames/core/models/menu';
import type { Action, BattleState, Side } from '@webgames/core/sim/state';
import { useEffect, useRef, useState } from 'react';

import type { RunSession } from '../run/session';

export interface ChoicesView {
  state: BattleState;
  model: MenuModel;
  pick: (action: Action) => void;
}

export interface BattleLog {
  /** One line array per played turn, oldest first. */
  turns: readonly string[][];
  /** Lines of the latest turn to announce; empty after a rebuild (nothing is re-announced). */
  fresh: readonly string[];
}

export interface BattleTurnsView {
  busy: boolean;
  choices: ChoicesView | null;
  log: BattleLog;
  /** Bumped when the controller asks to move focus to the first choice (after a settled turn). */
  focusRequest: number;
  controller: BattleController;
}

export interface UseBattleTurnsOptions {
  session: RunSession;
  /** The battle to show (the run's saved battle state); read once, at mount. */
  initial: BattleState;
  scene: BattleScene;
  reducedMotion: boolean;
  /** Called once, after the final turn's play settled; the run has already moved on. */
  onEnd: (winner: Side) => void;
  timers?: TimerApi;
  logger?: Logger;
}

const realTimers: TimerApi = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function useBattleTurns(options: UseBattleTurnsOptions): BattleTurnsView {
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<ChoicesView | null>(null);
  const [log, setLog] = useState<BattleLog>({ turns: [], fresh: [] });
  const [focusRequest, setFocusRequest] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);

  const ref = useRef<BattleController | null>(null);
  if (ref.current === null) {
    const logger = options.logger ?? console;
    const ui: BattleUi = {
      bindInput: () => {},
      navigate: () => {},
      setBusy,
      appendLog: (lines) => setLog((prev) => ({ turns: [...prev.turns, lines], fresh: lines })),
      replaceLog: (turns) => setLog({ turns, fresh: [] }),
      showChoices(state, model, pick, focusFirst) {
        setChoices({ state, model, pick });
        if (focusFirst) setFocusRequest((n) => n + 1);
      },
      // Run mode: the run moves on instead of showing a result panel.
      showResult: () => {},
    };
    ref.current = createBattleController({
      content: CONTENT,
      view: options.scene,
      ui,
      timers: options.timers ?? realTimers,
      reducedMotion: () => latest.current.reducedMotion,
      logger,
      applyAction(prev, action) {
        const result = latest.current.session.act({ type: 'battle', action });
        if (!result.ok) {
          logger.warn('run rejected a battle action; keeping the current state', result.reason);
          return { state: prev, events: [] };
        }
        const turn = splitBattleStep(result.step, prev, action, CONTENT);
        return { state: turn.battle, events: turn.battleEvents };
      },
      onEnd(winner) {
        if (mounted.current) latest.current.onEnd(winner);
      },
    });
  }
  const controller = ref.current;

  useEffect(() => {
    mounted.current = true;
    controller.startWith(latest.current.initial);
    return () => {
      mounted.current = false;
    };
  }, [controller]);

  return { busy, choices, log, focusRequest, controller };
}
