import { effectiveness } from '../content';
import { lookup } from '../content/lookup';
import type { Content } from '../content';
import { restoreRng } from './rng';
import type { BattleState } from './state';

function movesOf(state: BattleState, content: Content) {
  const enemy = state.teams.enemy[state.active.enemy];
  if (!enemy) return null;
  const l = lookup(content);
  return { enemy, defs: l.species(enemy.speciesId).moves.map((id) => l.move(id)) };
}

/**
 * Picks the enemy's move index: the legal move with the highest `power * effectiveness` against the
 * player's active creature (heal and status moves score 0). Ties are broken with `nextInt` on a fork
 * of the state's rng, so the battle's main rng stream is never advanced. Returns -1 only when the
 * enemy has no legal move at all. When `state.script` is set its entry for this turn wins if it is legal.
 */
export function chooseEnemyMove(state: BattleState, content: Content): number {
  const info = movesOf(state, content);
  if (!info || info.enemy.fainted) return -1;
  if (state.script !== undefined && state.script.length > 0) {
    const scripted = state.script[(state.turn - 1) % state.script.length]!;
    const def = info.defs[scripted];
    if (def !== undefined && def.focusCost <= info.enemy.focus) return scripted;
  }
  const target = state.teams.player[state.active.player];
  const targetSp = target && lookup(content).species(target.speciesId);

  let best = -1;
  let tied: number[] = [];
  info.defs.forEach((def, i) => {
    if (def.focusCost > info.enemy.focus) return;
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
