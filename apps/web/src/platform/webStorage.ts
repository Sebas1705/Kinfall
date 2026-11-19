import type { StorageLike } from '@kinfall/core/platform/runStorage';

/** The browser's localStorage, or null when it is missing or blocked (accessing it can throw). */
export function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
