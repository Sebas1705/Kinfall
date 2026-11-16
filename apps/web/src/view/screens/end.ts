// End screen: the result of a finished run, its stats and score, and a way to start again.
import type { Content } from '../../content';
import { t } from '../../platform/i18n';
import { runScore } from '../../sim/run/score';
import type { RunState } from '../../sim/run/types';
import { el } from './dom';

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

export function renderEnd(host: HTMLElement, model: EndModel, onNewRun: () => void): void {
  const again = el('button', { type: 'button', class: 'primary', 'data-choice': 'new-run' }, t('end.newRun'));
  again.addEventListener('click', () => onNewRun());
  const stats = el('dl', { class: 'end-stats' });
  for (const s of model.stats) stats.append(el('div', {}, el('dt', {}, s.label), el('dd', {}, String(s.value))));
  host.replaceChildren(
    el(
      'h2',
      { class: `screen-heading result-title ${model.result === 'won' ? 'win' : 'lose'}`, 'data-screen-heading': true, tabindex: '-1' },
      model.title,
    ),
    el('p', { class: 'end-note' }, t('end.canRestart')),
    el('p', { class: 'end-score' }, el('span', {}, t('end.score')), ': ', el('strong', {}, String(model.score))),
    stats,
    el('div', { class: 'button-row' }, again),
  );
}
