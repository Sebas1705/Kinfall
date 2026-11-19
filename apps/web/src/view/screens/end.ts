// End screen: the result of a finished run, its stats and score, and a way to start again.
// The pure model (buildEndModel) lives in @kinfall/core.
import type { EndModel } from '@kinfall/core/models/end';
import { t } from '@kinfall/core/platform/i18n';
import { el } from './dom';

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
