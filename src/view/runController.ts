// Run flow between screens: title -> map -> (battle/event: Task 13) -> map ... Every applied run
// action is autosaved; a failed save warns once per failure streak and never blocks play.
import type { Content } from '../content';
import { nodeTypeLabel, t } from '../platform/i18n';
import type { RunStorage } from '../platform/runStorage';
import { findNode } from '../sim/run/map';
import { applyRunAction, startRun } from '../sim/run/run';
import type { RunState } from '../sim/run/types';
import type { Router } from './router';
import type { RunUi } from './runUi';
import { buildMapModel } from './screens/map';

export interface RunControllerDeps {
  content: Content;
  storage: RunStorage;
  router: Router;
  ui: RunUi;
  /** Seed shown on the title screen (from the URL or a random code). */
  newSeed: () => string;
}

export interface RunController {
  showTitle(options?: { focus?: boolean }): void;
  start(seed: string, starterId: string): void;
  resume(): void;
  abandon(): void;
  pickNode(nodeId: string): void;
  getRun(): RunState | null;
  /** Re-renders the visible screen after a language change, keeping typed input. */
  refreshText(): void;
}

export function createRunController(deps: RunControllerDeps): RunController {
  const { content, storage, router, ui } = deps;
  let run: RunState | null = null;
  /** Node ids picked this session; the run state itself only remembers the last one. */
  let trail: string[] = [];
  let saveFailing = false;
  let titleSeed = deps.newSeed();

  const save = () => {
    if (!run) return;
    const result = storage.save(run);
    if (result.ok) {
      saveFailing = false;
    } else if (!saveFailing) {
      saveFailing = true;
      ui.showSaveWarning(result.error);
    }
  };

  const renderTitle = (preserveInput: boolean) =>
    ui.renderTitle({
      content,
      seed: titleSeed,
      save: storage.load(),
      preserveInput,
      onStart: (seed, starterId) => controller.start(seed, starterId),
      onContinue: () => controller.resume(),
      onDiscard: () => {
        storage.clear();
        renderTitle(true);
        router.show('title');
      },
    });

  const renderMap = () => {
    if (!run) return;
    ui.renderMap(buildMapModel(run, content, trail), (id) => controller.pickNode(id), () => controller.abandon());
  };

  /** Label of the screen a non-map phase would show (placeholder until Task 13). */
  const phaseLabel = (r: RunState): string => {
    const p = r.phase;
    if (p.kind === 'recruit') return t('screen.event');
    if (p.kind === 'ended') return t('screen.end');
    if (p.kind === 'map') return t('screen.map');
    const node = findNode(r.maps[r.zone], p.nodeId);
    return node ? nodeTypeLabel(node.type) : t('screen.event');
  };

  /** Renders and shows the screen for the current phase. */
  const showPhase = (focus = true) => {
    if (!run) return;
    if (run.phase.kind === 'map') {
      renderMap();
      router.show('map', undefined, { focus });
    } else {
      ui.renderPlaceholder(phaseLabel(run));
      router.show('event', undefined, { focus });
    }
  };

  const controller: RunController = {
    showTitle(options) {
      renderTitle(false);
      router.show('title', undefined, options);
    },
    start(seed, starterId) {
      run = startRun(seed, starterId, content);
      trail = [];
      titleSeed = seed;
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
      showPhase();
    },
    abandon() {
      run = null;
      trail = [];
      storage.clear();
      controller.showTitle();
    },
    pickNode(nodeId) {
      if (!run) return;
      const step = applyRunAction(run, { type: 'node', nodeId }, content);
      if (step.events.some((e) => e.type === 'rejected')) return;
      run = step.run;
      trail.push(nodeId);
      save();
      showPhase();
    },
    getRun: () => run,
    refreshText() {
      const screen = router.current();
      if (screen === 'title') renderTitle(true);
      else if (run && screen === 'map') renderMap();
      else if (run && screen === 'event') ui.renderPlaceholder(phaseLabel(run));
      router.refreshTitle();
    },
  };
  return controller;
}
