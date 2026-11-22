// End screen: the result of a finished run and its main score in the primary region, New run and
// back to the start in the rail, and the detailed stats in the run sheet (opened from the HUD).
// The pure model (buildEndModel) lives in @kinfall/core.
import type { EndModel } from '@kinfall/core/models/end';
import { t } from '@kinfall/core/platform/i18n';
import { el, sheetStore } from './dom';

/** `onToTitle` adds the "Back to start" button: the title keeps the seed of the run just played. */
export function renderEnd(host: HTMLElement, model: EndModel, onNewRun: () => void, onToTitle?: () => void): void {
  const again = el('button', { type: 'button', class: 'primary', 'data-choice': 'new-run' }, t('end.newRun'));
  again.addEventListener('click', () => onNewRun());
  const rail = el('div', { class: 'screen-rail' }, again);
  if (onToTitle) {
    const back = el('button', { type: 'button', class: 'secondary', 'data-choice': 'to-title' }, t('end.toTitle'));
    back.addEventListener('click', () => onToTitle());
    rail.append(back);
  }
  const stats = el('dl', { class: 'end-stats' });
  for (const s of model.stats) stats.append(el('div', {}, el('dt', {}, s.label), el('dd', {}, String(s.value))));
  host.replaceChildren(
    el(
      'div',
      { class: 'screen-primary' },
      el(
        'h2',
        { class: `screen-heading result-title ${model.result === 'won' ? 'win' : 'lose'}`, 'data-screen-heading': true, tabindex: '-1' },
        model.title,
      ),
      // The lazy scene art puts the result scene after the heading (src/art/screenArt.ts).
      el('p', { class: 'end-score' }, el('span', {}, t('end.score')), ': ', el('strong', {}, String(model.score))),
      el('p', { class: 'end-note' }, t('end.canRestart')),
    ),
    rail,
    sheetStore(t('run.details'), t('run.open'), stats),
  );
}
