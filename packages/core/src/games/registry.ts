// The game registry: the games the hub offers, in display order. Platform-neutral (no DOM or
// React Native imports); web and mobile both read it.

import type { StringKey } from '../platform/strings';

export type GameId = 'kinfall' | 'simulator' | 'survival';
export type GameStatus = 'playable' | 'soon';

export interface GameDef {
  id: GameId;
  status: GameStatus;
  nameKey: StringKey;
  taglineKey: StringKey;
}

export const GAMES: readonly GameDef[] = [
  { id: 'kinfall', status: 'playable', nameKey: 'hub.game.kinfall.name', taglineKey: 'hub.game.kinfall.tagline' },
  { id: 'simulator', status: 'soon', nameKey: 'hub.game.simulator.name', taglineKey: 'hub.game.simulator.tagline' },
  { id: 'survival', status: 'soon', nameKey: 'hub.game.survival.name', taglineKey: 'hub.game.survival.tagline' },
];

/** Storage key holding the id of the game last opened from the hub. */
export const LAST_GAME_KEY = 'kinfall.lastGame';

export function isGameId(v: unknown): v is GameId {
  return GAMES.some((g) => g.id === v);
}

export function findGame(id: GameId): GameDef {
  const game = GAMES.find((g) => g.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}

export function isPlayable(id: GameId): boolean {
  return findGame(id).status === 'playable';
}

/** The game the hub focuses first: `last` if it is a playable game id, else the first playable game. */
export function initialFocus(last: unknown): GameId {
  if (isGameId(last) && isPlayable(last)) return last;
  const first = GAMES.find((g) => g.status === 'playable');
  if (!first) throw new Error('No playable game registered');
  return first.id;
}

/**
 * The playable game a URL search string names: `?game=<id>`, or `kinfall` for the legacy
 * `mode=battle` and `seed` parameters. Null when nothing names a playable game.
 */
export function gameFromSearch(search: string): GameId | null {
  // Parsed by hand: core has no DOM lib, so no URLSearchParams.
  const params = new Map<string, string>();
  for (const pair of search.replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeParam(eq < 0 ? pair : pair.slice(0, eq));
    if (!params.has(key)) params.set(key, eq < 0 ? '' : decodeParam(pair.slice(eq + 1)));
  }
  const game = params.get('game');
  if (game !== undefined) return isGameId(game) && isPlayable(game) ? game : null;
  if (params.get('mode') === 'battle' || params.has('seed')) return 'kinfall';
  return null;
}

function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}
