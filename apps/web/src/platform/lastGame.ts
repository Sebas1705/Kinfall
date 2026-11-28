// The game last opened from the hub, kept in localStorage. Never throws: a missing or blocked
// storage reads as undefined and writes nothing.
import { LAST_GAME_KEY } from '@kinfall/core/games/registry';
import type { GameId } from '@kinfall/core/games/registry';
import type { StorageLike } from '@kinfall/core/platform/runStorage';

/** The stored value as is (the registry's `initialFocus` validates it), or undefined. */
export function readLastGame(storage: StorageLike | null): unknown {
  try {
    return storage?.getItem(LAST_GAME_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeLastGame(storage: StorageLike | null, id: GameId): void {
  try {
    storage?.setItem(LAST_GAME_KEY, id);
  } catch {
    // Quota or blocked storage: the hub just forgets the last game.
  }
}
