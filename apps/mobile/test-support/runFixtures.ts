// Test helpers for the run session: scriptable in-memory storages and a seeded run.
import { CONTENT } from '@kinfall/core/content';
import { createAsyncRunStorage, type AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';
import { RUN_STORAGE_KEY } from '@kinfall/core/platform/runStorage';
import { availableNodes, startRun } from '@kinfall/core/sim/run/run';
import type { RunState } from '@kinfall/core/sim/run/types';

import { createRunSession, type RunSession } from '../src/run/session';

export const RUN_KEY = RUN_STORAGE_KEY;
export const STARTER = CONTENT.starters[0]!;

export interface MemoryStorage extends AsyncStorageLike {
  data: Map<string, string>;
  /** Every setItem value for the run key, in call order. */
  writes: string[];
  removes: number;
  /** Highest number of setItem/removeItem calls in flight at once. */
  maxInFlight: number;
  /** When set, the next setItem calls reject with these errors (one per call, in order). */
  failNext: Error[];
  /** When true, writes wait for `release()` before landing. */
  hold: boolean;
  release(): void;
}

/** In-memory AsyncStorageLike with failure and hold switches. */
export function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const pending: Array<() => void> = [];
  let inFlight = 0;
  const store: MemoryStorage = {
    data: new Map(Object.entries(initial)),
    writes: [],
    removes: 0,
    maxInFlight: 0,
    failNext: [],
    hold: false,
    release() {
      for (const r of pending.splice(0)) r();
    },
    async getItem(key) {
      return store.data.get(key) ?? null;
    },
    async setItem(key, value) {
      inFlight++;
      store.maxInFlight = Math.max(store.maxInFlight, inFlight);
      try {
        if (store.hold) await new Promise<void>((r) => pending.push(r));
        const err = store.failNext.shift();
        if (err) throw err;
        if (key === RUN_KEY) store.writes.push(value);
        store.data.set(key, value);
      } finally {
        inFlight--;
      }
    },
    async removeItem(key) {
      inFlight++;
      store.maxInFlight = Math.max(store.maxInFlight, inFlight);
      try {
        if (store.hold) await new Promise<void>((r) => pending.push(r));
        store.removes++;
        store.data.delete(key);
      } finally {
        inFlight--;
      }
    },
  };
  return store;
}

/** A session over `storage` with predictable fresh seeds (FRESH1, FRESH2, ...). */
export function makeSession(storage: AsyncStorageLike | null, logger: Pick<Console, 'warn'> = { warn: () => {} }): RunSession {
  let n = 0;
  return createRunSession({
    content: CONTENT,
    storage: createAsyncRunStorage(storage, CONTENT),
    randomSeed: () => `FRESH${++n}`,
    logger,
  });
}

/** A new run of `seed` with the first starter. */
export function freshRun(seed = 'TESTSEED'): RunState {
  return startRun(seed, STARTER, CONTENT);
}

/** Id of the first available node of a run on the map. */
export function firstNode(run: RunState): string {
  const node = availableNodes(run)[0];
  if (!node) throw new Error('no available node');
  return node.id;
}
