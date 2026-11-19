// Run session: the mobile twin of the web run controller, without any UI. It owns the current run,
// the cleared-node trail, the run log and the autosave, and exposes an immutable snapshot that React
// reads through useSyncExternalStore (see useRunSession.tsx). Plain TypeScript: unit-testable
// without React.
//
// Saves: every applied run action enqueues one write of the state it produced. Writes (and the
// clear of an abandon or discard) run one at a time in the order they were enqueued, so two quick
// taps can never interleave and the last write always holds the latest state. A failed save shows
// one dismissible warning per failure streak; play goes on and a later successful save hides it.
import type { Content } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import type { AsyncRunStorage } from '@kinfall/core/platform/asyncRunStorage';
import { nodeTypeLabel, runEventLine, speciesName, t, type RunEventContext } from '@kinfall/core/platform/i18n';
import type { LoadResult } from '@kinfall/core/platform/runStorage';
import { findNode } from '@kinfall/core/sim/run/map';
import { applyRunAction, startRun } from '@kinfall/core/sim/run/run';
import type { RunAction, RunEvent, RunPhase, RunState, RunStep } from '@kinfall/core/sim/run/types';

/** Run events kept in the log; older ones are dropped (same as the web app). */
export const RUN_LOG_MAX = 60;

/** Which screen the Run route draws for a phase (map, battle, the four events, or the end). */
export type RunView = 'map' | 'battle' | 'event' | 'end';

export function runViewOf(phase: RunPhase): RunView {
  switch (phase.kind) {
    case 'map':
      return 'map';
    case 'battle':
      return 'battle';
    case 'ended':
      return 'end';
    case 'recruit':
    case 'shrine':
    case 'cache':
    case 'mystery':
      return 'event';
  }
}

export interface SaveWarning {
  /** Error text from the storage. */
  error: string;
}

export interface RunSessionSnapshot {
  run: RunState | null;
  /** Screen for the current run phase; null without a run. */
  view: RunView | null;
  /** Node ids picked this session; the run state itself only remembers the last one. */
  trail: readonly string[];
  /** Run events with a log line, oldest first, at most RUN_LOG_MAX. Lines are built at render time (language). */
  log: readonly RunEvent[];
  /** How many of the last `log` entries arrived with the latest action (0 after a reset or resume). */
  logFresh: number;
  /** Shown until dismissed or until a save succeeds again. */
  saveWarning: SaveWarning | null;
  /** Seed the title screen prefills: the last started seed, or a fresh code after an abandon. */
  titleSeed: string;
  /** The saved slot as last read for the title screen; null until the first read finishes. */
  saved: LoadResult | null;
}

export type ActResult = { ok: true; step: RunStep } | { ok: false; reason: string };

export interface RunSession {
  getSnapshot(): RunSessionSnapshot;
  subscribe(listener: () => void): () => void;
  /** Re-reads the save slot for the title screen (Continue, corrupt notice). */
  refreshSaved(): Promise<LoadResult>;
  /** Starts a run and saves it once. */
  start(seed: string, starterId: string): void;
  /**
   * The end screen's "New run": clears the save, then starts a run from a fresh seed with
   * `starterId`, by default the starter of the last run started in this session (the first starter
   * after a resume, since a save does not record it). Returns the new seed.
   */
  newRun(starterId?: string): string;
  /** Loads the save; true when a run was restored. Otherwise `saved` says why. */
  resume(): Promise<boolean>;
  /** Drops the run and deletes the save; the title gets a fresh seed. */
  abandon(): Promise<void>;
  /** Deletes a (corrupt) save from the title screen. */
  discardSave(): Promise<void>;
  /** Applies a node pick on the map. */
  pickNode(nodeId: string): ActResult;
  /** Applies any run action (events, recruits, battle turns in 7b/7c); rejected actions change nothing. */
  act(action: RunAction): ActResult;
  dismissSaveWarning(): void;
  /** Resolves once every queued write has finished (tests, and before reading the slot). */
  whenIdle(): Promise<void>;
}

export interface RunSessionDeps {
  content: Content;
  storage: AsyncRunStorage;
  /** A fresh seed code (title prefill at launch and after an abandon). */
  randomSeed: () => string;
  logger?: Pick<Console, 'warn'>;
}

/** Log line context: localised species names and map node labels (falls back to the node type). */
export function runLogContext(content: Content, run: RunState | null): RunEventContext {
  const lk = lookup(content);
  return {
    species: (id) => speciesName(lk.species(id)),
    node: (id) => {
      const node = run ? findNode(run.maps[run.zone], id) : undefined;
      return node ? nodeTypeLabel(node.type) : null;
    },
  };
}

/** Log lines in the current language. */
export function runLogLines(events: readonly RunEvent[], ctx: RunEventContext): string[] {
  return events.map((e) => runEventLine(e, ctx)).filter((l): l is string => l !== null);
}

/**
 * Short name of a phase (the battle screen heading): the node being played (battle, shrine,
 * cache, mystery), the node just cleared (recruit) or the end of the run.
 */
export function phaseHeading(run: RunState): string {
  const phase = run.phase;
  if (phase.kind === 'ended') return t('screen.end');
  if (phase.kind === 'map') return t('screen.map');
  const id = phase.kind === 'recruit' ? run.at : phase.nodeId;
  const node = id === null ? undefined : findNode(run.maps[run.zone], id);
  return node ? nodeTypeLabel(node.type) : t('screen.event');
}

type Write = { kind: 'save'; run: RunState } | { kind: 'clear' };

export function createRunSession(deps: RunSessionDeps): RunSession {
  const { content, storage } = deps;
  const logger = deps.logger ?? console;
  const listeners = new Set<() => void>();
  let snap: RunSessionSnapshot = {
    run: null,
    view: null,
    trail: [],
    log: [],
    logFresh: 0,
    saveWarning: null,
    titleSeed: deps.randomSeed(),
    saved: null,
  };
  /** True from a failed save until the next successful one (one warning per streak). */
  let saveFailing = false;
  /** Bumped on abandon/discard: results of writes enqueued before it no longer touch the warning. */
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();
  /** Starter of the last `start`, reused by `newRun`. */
  let lastStarter: string | null = null;

  const set = (patch: Partial<RunSessionSnapshot>) => {
    snap = { ...snap, ...patch };
    if ('run' in patch) snap.view = snap.run ? runViewOf(snap.run.phase) : null;
    for (const l of [...listeners]) l();
  };

  const runWrite = async (write: Write, gen: number) => {
    if (write.kind === 'clear') {
      await storage.clear();
      return;
    }
    const result = await storage.save(write.run);
    if (gen !== generation) return;
    if (result.ok) {
      const wasFailing = saveFailing;
      saveFailing = false;
      if (wasFailing && snap.saveWarning) set({ saveWarning: null });
    } else if (!saveFailing) {
      saveFailing = true;
      set({ saveWarning: { error: result.error } });
    }
  };

  /** Appends a write to the queue; writes never overlap and run in enqueue order. */
  const enqueue = (write: Write): Promise<void> => {
    const gen = generation;
    const next = queue.then(() => runWrite(write, gen)).catch((e: unknown) => {
      // AsyncRunStorage never rejects; this guards the queue against a broken custom storage.
      logger.warn('run save failed unexpectedly', e);
    });
    queue = next;
    return next;
  };

  /** Log after `events`; `run` is the state they produced (node labels of a zone just entered). */
  const logAdd = (events: RunEvent[], run: RunState): Pick<RunSessionSnapshot, 'log' | 'logFresh'> => {
    const ctx = runLogContext(content, run);
    const shown = events.filter((e) => runEventLine(e, ctx) !== null);
    if (shown.length === 0) return { log: snap.log, logFresh: 0 };
    return { log: [...snap.log, ...shown].slice(-RUN_LOG_MAX), logFresh: Math.min(shown.length, RUN_LOG_MAX) };
  };

  const resetWarning = () => {
    generation++;
    saveFailing = false;
  };

  const session: RunSession = {
    getSnapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refreshSaved() {
      await session.whenIdle();
      const saved = await storage.load();
      set({ saved });
      return saved;
    },
    start(seed, starterId) {
      const run = startRun(seed, starterId, content);
      lastStarter = starterId;
      resetWarning();
      set({ run, trail: [], log: [], logFresh: 0, titleSeed: seed, saveWarning: null });
      void enqueue({ kind: 'save', run });
    },
    newRun(starterId) {
      const starter = starterId ?? lastStarter ?? content.starters[0];
      if (starter === undefined) throw new Error('content has no starter');
      const seed = deps.randomSeed();
      resetWarning();
      void enqueue({ kind: 'clear' });
      session.start(seed, starter);
      return seed;
    },
    async resume() {
      await session.whenIdle();
      const saved = await storage.load();
      if (saved.kind !== 'ok') {
        set({ saved });
        return false;
      }
      resetWarning();
      set({ saved, run: saved.run, trail: [], log: [], logFresh: 0, saveWarning: null });
      return true;
    },
    async abandon() {
      resetWarning();
      set({ run: null, trail: [], log: [], logFresh: 0, saveWarning: null, titleSeed: deps.randomSeed(), saved: { kind: 'none' } });
      await enqueue({ kind: 'clear' });
      await session.refreshSaved();
    },
    async discardSave() {
      resetWarning();
      set({ saveWarning: null });
      await enqueue({ kind: 'clear' });
      await session.refreshSaved();
    },
    pickNode(nodeId) {
      // Node ids carry their zone, so ids of earlier zones never match the current map.
      return apply({ type: 'node', nodeId }, () => [...snap.trail, nodeId]);
    },
    act(action) {
      return apply(action);
    },
    dismissSaveWarning() {
      if (snap.saveWarning) set({ saveWarning: null });
    },
    async whenIdle() {
      // Writes enqueued while waiting extend the queue: wait until it stops growing.
      let tail: Promise<void>;
      do {
        tail = queue;
        await tail;
      } while (tail !== queue);
    },
  };

  /** Applies an action: commit, log, autosave; a rejected action keeps the state and saves nothing. */
  function apply(action: RunAction, nextTrail?: () => readonly string[]): ActResult {
    const run = snap.run;
    if (!run) return { ok: false, reason: 'no run' };
    const step = applyRunAction(run, action, content);
    const rejected = step.events.find((e): e is Extract<RunEvent, { type: 'rejected' }> => e.type === 'rejected');
    if (rejected) {
      logger.warn('run rejected an action; keeping the current state', action, rejected.reason);
      return { ok: false, reason: rejected.reason };
    }
    set({ run: step.run, trail: nextTrail ? nextTrail() : snap.trail, ...logAdd(step.events, step.run) });
    void enqueue({ kind: 'save', run: step.run });
    return { ok: true, step };
  }
  return session;
}
