import type { Content } from '../content';
import { applyAction, createBattle } from './battle';
import { hashState } from './codec';
import type { Action, Side, TeamSpec } from './state';

export interface GoldenEntry {
  name: string;
  seed: string;
  player: TeamSpec;
  enemy: TeamSpec;
  telegraph: boolean;
  actions: Action[];
  finalHash: string;
  winner: Side | null;
}

/** Replays `actions` from a fresh battle; rejected actions are applied like any other (no-ops). */
export function replayBattle(
  seed: string,
  player: TeamSpec,
  enemy: TeamSpec,
  actions: Action[],
  content: Content,
  options?: { telegraph?: boolean },
): { finalHash: string; winner: Side | null } {
  let state = createBattle(seed, player, enemy, content, options);
  for (const action of actions) state = applyAction(state, action, content).state;
  return { finalHash: hashState(state), winner: state.winner };
}
