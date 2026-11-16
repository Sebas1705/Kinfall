import type { Content } from '../content';
import { deserializeRun, serializeRun } from '../sim/run/codec';
import type { RunState } from '../sim/run/types';

const KEY = 'webgames.run.v1';
const MAX_ERROR = 200;

/** Synchronous key-value storage (the browser's localStorage fits); the app passes it in. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadResult =
  | { kind: 'none' }
  | { kind: 'ok'; run: RunState }
  | { kind: 'corrupt'; error: string }
  | { kind: 'unavailable'; error: string };

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface RunStorage {
  save(run: RunState): SaveResult;
  load(): LoadResult;
  /** Deletes the slot; reports a failure (blocked storage) instead of throwing. */
  clear(): SaveResult;
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : 'unknown error';
  return message.length > MAX_ERROR ? `${message.slice(0, MAX_ERROR - 3)}...` : message;
}

/**
 * Autosave slot for the current run. Never throws. Missing or failing storage is `unavailable`;
 * text that is present but fails validation is `corrupt` and is left in place so the UI can
 * offer to discard it.
 */
export function createRunStorage(storage: StorageLike | null, content: Content): RunStorage {
  return {
    save(run: RunState): SaveResult {
      if (!storage) return { ok: false, error: 'Storage is not available.' };
      try {
        storage.setItem(KEY, serializeRun(run));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: describe(e) };
      }
    },
    load(): LoadResult {
      if (!storage) return { kind: 'unavailable', error: 'Storage is not available.' };
      let text: string | null;
      try {
        text = storage.getItem(KEY);
      } catch (e) {
        return { kind: 'unavailable', error: describe(e) };
      }
      if (text === null) return { kind: 'none' };
      const result = deserializeRun(text, content);
      return result.ok ? { kind: 'ok', run: result.run } : { kind: 'corrupt', error: result.error };
    },
    clear(): SaveResult {
      // Without storage nothing was saved, so there is nothing left behind.
      if (!storage) return { ok: true };
      try {
        storage.removeItem(KEY);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: describe(e) };
      }
    },
  };
}
