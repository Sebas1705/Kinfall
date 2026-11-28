// The game last opened from the hub, kept in AsyncStorage under `kinfall.lastGame` (core's
// LAST_GAME_KEY, the same key the web hub uses in localStorage). Both calls never reject: a missing
// or failing storage reads as "nothing stored" and a failed write is dropped (the hub then simply
// opens focused on the first playable game).
import { LAST_GAME_KEY, type GameId } from '@kinfall/core/games/registry';
import type { AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';

import { defaultAsyncStorage } from './asyncStorage';

/** The stored text, unvalidated (core's `initialFocus` decides what to do with it), or undefined. */
export async function readLastGame(storage: AsyncStorageLike | null = defaultAsyncStorage()): Promise<unknown> {
  try {
    return (await storage?.getItem(LAST_GAME_KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function writeLastGame(id: GameId, storage: AsyncStorageLike | null = defaultAsyncStorage()): Promise<void> {
  try {
    await storage?.setItem(LAST_GAME_KEY, id);
  } catch {
    // Remembering the game is a convenience.
  }
}
