import type { Content } from '../../content';
import { maxHpOf } from './party';
import type { RunState } from './types';

const ZONES = 3;

/**
 * Final (or running) score, integer only: zones cleared x1000, bosses x250,
 * elites x100, nodes x20, souls x10, plus each living member's hp percentage
 * (floored). A run counts its current zone index as cleared zones, or all
 * three once it is won.
 */
export function runScore(run: RunState, content: Content): number {
  const won = run.phase.kind === 'ended' && run.phase.result === 'won';
  const zonesCleared = won ? ZONES : run.zone;
  let score =
    zonesCleared * 1000 +
    run.stats.bossesBeaten * 250 +
    run.stats.elitesBeaten * 100 +
    run.stats.nodesCleared * 20 +
    run.souls * 10;
  for (const m of run.party) score += Math.floor((100 * m.hp) / maxHpOf(m.speciesId, content));
  return score;
}
