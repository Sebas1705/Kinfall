// End screen model: the result of a finished run, its stats and score (buildEndModel). The web app
// renders it (apps/web/src/view/screens/end.ts).
import type { Content } from '../content';
import { t } from '../platform/i18n';
import { runScore } from '../sim/run/score';
import type { RunState } from '../sim/run/types';

const ZONES = 3;

export interface EndModel {
  result: 'won' | 'lost';
  title: string;
  stats: Array<{ label: string; value: number }>;
  score: number;
}

/** Pure model of an ended run, or null while the run is still going. */
export function buildEndModel(run: RunState, content: Content): EndModel | null {
  if (run.phase.kind !== 'ended') return null;
  const won = run.phase.result === 'won';
  return {
    result: run.phase.result,
    title: t(won ? 'end.won' : 'end.lost'),
    stats: [
      { label: t('end.stat.zones'), value: won ? ZONES : run.zone },
      { label: t('end.stat.nodes'), value: run.stats.nodesCleared },
      { label: t('end.stat.elites'), value: run.stats.elitesBeaten },
      { label: t('end.stat.bosses'), value: run.stats.bossesBeaten },
      { label: t('end.stat.lost'), value: run.stats.creaturesLost },
      { label: t('end.stat.souls'), value: run.souls },
    ],
    score: runScore(run, content),
  };
}
