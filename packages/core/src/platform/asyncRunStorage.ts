import type { Content } from '../content';
import { serializeRun } from '../sim/run/codec';
import type { RunState } from '../sim/run/types';
import {
  RUN_STORAGE_KEY,
  STORAGE_UNAVAILABLE,
  describe,
  loadFromText,
  type LoadResult,
  type SaveResult,
} from './runStorage';

/** Asynchronous key-value storage (React Native's AsyncStorage fits); the app passes it in. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AsyncRunStorage {
  save(run: RunState): Promise<SaveResult>;
  load(): Promise<LoadResult>;
  /** Never throws or rejects; a failing storage leaves the slot as it was. */
  clear(): Promise<void>;
}

/**
 * Async twin of `createRunStorage` with the same slot, results and rules: it never rejects, a
 * missing or failing storage is `unavailable` on load, `corrupt` is only for present text that
 * fails validation (and is left in place), and a failed save keeps the previous value.
 */
export function createAsyncRunStorage(storage: AsyncStorageLike | null, content: Content): AsyncRunStorage {
  return {
    async save(run: RunState): Promise<SaveResult> {
      if (!storage) return { ok: false, error: STORAGE_UNAVAILABLE };
      try {
        await storage.setItem(RUN_STORAGE_KEY, serializeRun(run));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: describe(e) };
      }
    },
    async load(): Promise<LoadResult> {
      if (!storage) return { kind: 'unavailable', error: STORAGE_UNAVAILABLE };
      let text: string | null;
      try {
        text = await storage.getItem(RUN_STORAGE_KEY);
      } catch (e) {
        return { kind: 'unavailable', error: describe(e) };
      }
      return loadFromText(text, content);
    },
    async clear(): Promise<void> {
      if (!storage) return;
      try {
        await storage.removeItem(RUN_STORAGE_KEY);
      } catch {
        // a blocked storage keeps its slot; there is nothing else to do
      }
    },
  };
}
