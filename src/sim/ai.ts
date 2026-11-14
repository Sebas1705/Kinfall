import { effectiveness } from '../content';
import type { Content } from '../content';
import { restoreRng } from './rng';
import type { BattleState } from './state';

function movesOf(state: BattleState, content: Content) {
  const enemy = state.teams.enemy[state.active.enemy];
  const sp = enemy && content.species.find((s) => s.id === enemy.speciesId);
  if (!enemy || !sp) return null;
  return { enemy, defs: sp.moves.map((id) => content.moves.find((m) => m.id === id)) };
}

/** True when `moveIndex` is a move the enemy's active creature can use right now. */
export function enemyMoveLegal(state: BattleState, moveIndex: unknown, content: Content): boolean {
  const info = movesOf(state, content);
  if (!info || info.enemy.fainted) return false;
  if (typeof moveIndex !== 'number' || !Number.isInteger(moveIndex)) return false;
  const def = info.defs[moveIndex];
  return def !== undefined && def.focusCost <= info.enemy.focus;
}

/**
 * Picks the enemy's move index: the legal move with the highest `power * effectiveness` against the
 * player's active creature (heal and status moves score 0). Ties are broken with `nextInt` on a fork
 * of the state's rng, so the battle's main rng stream is never advanced. Returns -1 only when the
 * enemy has no legal move at all.
 */
export function chooseEnemyMove(state: BattleState, content: Content): number {
  const info = movesOf(state, content);
  if (!info || info.enemy.fainted) return -1;
  const target = state.teams.player[state.active.player];
  const targetSp = target && content.species.find((s) => s.id === target.speciesId);

  let best = -1;
  let tied: number[] = [];
  info.defs.forEach((def, i) => {
    if (!def || def.focusCost > info.enemy.focus) return;
    const score =
      def.kind === 'damage' && targetSp ? def.power * effectiveness(def.element, targetSp.elements) : 0;
    if (score > best) {
      best = score;
      tied = [i];
    } else if (score === best) {
      tied.push(i);
    }
  });
  if (tied.length === 0) return -1;
  if (tied.length === 1) return tied[0]!;
  return tied[restoreRng(state.rng).fork('ai:' + state.turn).nextInt(tied.length)]!;
}
