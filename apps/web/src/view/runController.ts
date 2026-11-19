// Run flow between screens: title -> map -> battle or event -> ... -> end. Every applied run action
// (battle turns included) is autosaved; a failed save warns once per failure streak and never
// blocks play. Battle turns go through the battle controller, which calls back into the run.
import type { Content } from '@kinfall/core/content';
import type { RunStorage } from '@kinfall/core/platform/runStorage';
import { applyRunAction, startRun } from '@kinfall/core/sim/run/run';
import type { RunAction, RunEvent, RunState } from '@kinfall/core/sim/run/types';
import type { Side } from '@kinfall/core/sim/state';
import type { BattleController, ControllerDeps } from './controller';
import type { Router } from './router';
import { createRunLog } from './runLog';
import { battleTurn } from './runTurn';
import type { RunUi } from './runUi';
import { buildEndModel } from '@kinfall/core/models/end';
import { buildEventModel } from '@kinfall/core/models/event';
import { buildMapModel } from '@kinfall/core/models/map';
import { randomSeed } from './screens/title';

export interface BattleHooks {
  applyAction: NonNullable<ControllerDeps['applyAction']>;
  onEnd: (winner: Side) => void;
}

export interface RunControllerDeps {
  content: Content;
  storage: RunStorage;
  router: Router;
  ui: RunUi;
  /** Seed shown on the title screen at page load (from the URL or a random code). */
  newSeed: () => string;
  /** Seed prefilled after a run is abandoned or finished (default: a random code; never the URL seed). */
  freshSeed?: () => string;
  /** Builds the battle controller once; the run supplies the turn function and the end hook. */
  createBattle(hooks: BattleHooks): BattleController;
  logger?: Pick<Console, 'warn' | 'error'>;
}

export interface RunController {
  showTitle(options?: { focus?: boolean }): void;
  start(seed: string, starterId: string): void;
  resume(): void;
  /** Clears the save and returns to the title (after the inline confirmation, or "New run" at the end). */
  abandon(): void;
  pickNode(nodeId: string): void;
  pickEvent(action: RunAction): void;
  getRun(): RunState | null;
  getBattle(): BattleController;
  /** Re-renders the visible screen after a language or text-size change, keeping typed input. */
  refreshText(): void;
}

/** The event model's initial choice (never a destructive one); the router falls back to the section. */
const FIRST_CHOICE = 'button[data-initial]:not(:disabled)';

export function createRunController(deps: RunControllerDeps): RunController {
  const { content, storage, router, ui } = deps;
  const logger = deps.logger ?? console;
  const freshSeed = deps.freshSeed ?? randomSeed;
  let run: RunState | null = null;
  /** Node ids picked this session; the run state itself only remembers the last one. */
  let trail: string[] = [];
  let saveFailing = false;
  let titleSeed = deps.newSeed();
  /** Run events of the battle's final turn, shown once its play has settled. */
  let afterBattle: RunEvent[] = [];
  const log = createRunLog(content, ui);

  const save = () => {
    if (!run) return;
    const result = storage.save(run);
    if (result.ok) {
      if (saveFailing) ui.hideSaveWarning();
      saveFailing = false;
    } else if (!saveFailing) {
      saveFailing = true;
      ui.showSaveWarning(result.error);
    }
  };

  /** Commits an applied step: new state, autosave. */
  const commit = (next: RunState) => {
    run = next;
    save();
  };

  const battle = deps.createBattle({
    applyAction: (prev, action) => {
      const turn = battleTurn(run, prev, action, content);
      if (!turn.ok) {
        logger.warn('run rejected a battle action; keeping the current state', turn.reason);
        return { state: prev, events: [] };
      }
      commit(turn.run);
      afterBattle = turn.runEvents;
      return { state: turn.battle, events: turn.battleEvents };
    },
    onEnd: () => {
      const events = afterBattle;
      afterBattle = [];
      showPhase();
      log.add(events);
    },
  });

  const renderTitle = (preserveInput: boolean) =>
    ui.renderTitle({
      content,
      seed: titleSeed,
      save: storage.load(),
      preserveInput,
      onStart: (seed, starterId) => controller.start(seed, starterId),
      onContinue: () => controller.resume(),
      onDiscard: () => {
        clearSave();
        renderTitle(true);
        router.show('title');
      },
    });

  const clearSave = () => {
    saveFailing = false;
    ui.hideSaveWarning();
    const result = storage.clear();
    if (!result.ok) ui.showClearWarning(result.error);
  };

  /** Renders the screen of the current phase (no routing). */
  const render = () => {
    if (!run) return;
    const kind = run.phase.kind;
    if (kind === 'map') {
      ui.renderMap(buildMapModel(run, content, trail), (id) => controller.pickNode(id), () => controller.abandon());
    } else if (kind === 'ended') {
      const model = buildEndModel(run, content);
      if (model) ui.renderEnd(model, () => controller.abandon());
    } else if (kind !== 'battle') {
      const model = buildEventModel(run, content);
      if (model) ui.renderEvent(model, (a) => controller.pickEvent(a));
    }
  };

  /** Renders and shows the screen for the current phase. */
  const showPhase = (focus = true) => {
    if (!run) return;
    ui.showSeed(run.seed);
    render();
    const phase = run.phase;
    if (phase.kind === 'battle') {
      ui.renderBattleFooter(() => controller.abandon());
      log.show(false);
      router.show('battle', undefined, { focus: false });
      // Rebuilt from the saved state: a fresh log, telegraph and intent as the state says.
      battle.startWith(phase.battle);
      return;
    }
    log.show(true);
    if (phase.kind === 'map') router.show('map', undefined, { focus });
    else if (phase.kind === 'ended') router.show('end', undefined, { focus });
    else router.show('event', FIRST_CHOICE, { focus });
  };

  const controller: RunController = {
    showTitle(options) {
      ui.showSeed(null);
      log.show(false);
      renderTitle(false);
      router.show('title', undefined, options);
    },
    start(seed, starterId) {
      run = startRun(seed, starterId, content);
      trail = [];
      titleSeed = seed;
      log.reset();
      save();
      showPhase();
    },
    resume() {
      const loaded = storage.load();
      if (loaded.kind !== 'ok') {
        controller.showTitle();
        return;
      }
      run = loaded.run;
      trail = [];
      log.reset();
      showPhase();
    },
    abandon() {
      if (battle.isPending()) return;
      run = null;
      trail = [];
      log.reset();
      titleSeed = freshSeed();
      clearSave();
      controller.showTitle();
    },
    pickNode(nodeId) {
      if (!run) return;
      const step = applyRunAction(run, { type: 'node', nodeId }, content);
      if (step.events.some((e) => e.type === 'rejected')) return;
      commit(step.run);
      trail.push(nodeId);
      log.add(step.events);
      showPhase();
    },
    pickEvent(action) {
      if (!run) return;
      const step = applyRunAction(run, action, content);
      if (step.events.some((e) => e.type === 'rejected')) {
        logger.warn('run rejected an event choice; keeping the current state', action);
        showPhase();
        return;
      }
      commit(step.run);
      showPhase();
      log.add(step.events);
    },
    getRun: () => run,
    getBattle: () => battle,
    refreshText() {
      const screen = router.current();
      if (screen === 'title') renderTitle(true);
      else if (screen === 'battle') {
        battle.refreshText();
        ui.renderBattleFooter(() => controller.abandon());
      }
      else if (run) {
        const section = document.querySelector(`[data-screen="${screen}"]`);
        const hadFocus = section?.contains(document.activeElement) ?? false;
        render();
        // The focused control was replaced: put focus back where a new visit would.
        if (hadFocus && !section?.contains(document.activeElement)) router.show(screen, screen === 'event' ? FIRST_CHOICE : undefined);
      }
      if (run) ui.showSeed(run.seed);
      log.refresh();
      router.refreshTitle();
    },
  };
  return controller;
}
