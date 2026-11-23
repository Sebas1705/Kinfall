// Event screens (recruit, shrine, cache, mystery): DOM rendering (renderEvent) of the pure event
// model (buildEventModel, in @kinfall/core). The offer, its vignette and a short description are the
// primary region; the choices are the rail; party details and the run log open in the run sheet.
import { CONTENT } from '@kinfall/core/content';
import type { Content } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import type { EventChoice, EventModel } from '@kinfall/core/models/event';
import { t } from '@kinfall/core/platform/i18n';
import type { RunAction } from '@kinfall/core/sim/run/types';
import { creatureCanvas } from './art';
import { el, sheetStore } from './dom';
import { partyPanel } from './party';

function offerCard(model: EventModel, content: Content): HTMLElement | null {
  const offer = model.offer;
  if (!offer) return null;
  return el(
    'div',
    { class: 'offer' },
    creatureCanvas(lookup(content).species(offer.speciesId), 'offer-art'),
    el(
      'span',
      { class: 'offer-text' },
      el('span', { class: 'offer-name' }, offer.name),
      el('span', { class: 'offer-detail' }, offer.elements),
      el('span', { class: 'offer-detail' }, `${t('hud.hp')} ${offer.hp}/${offer.maxHp}`),
    ),
  );
}

function choiceButton(choice: EventChoice, index: number, initial: boolean, onPick: (a: RunAction) => void): HTMLElement {
  const b = el(
    'button',
    { type: 'button', class: 'choice', 'data-choice': String(index), 'data-initial': initial, disabled: choice.disabled },
    el('span', { class: 'choice-label' }, choice.label),
    choice.detail ? el('span', { class: 'choice-detail' }, choice.detail) : null,
  );
  b.addEventListener('click', () => {
    if (!b.disabled) onPick(choice.action);
  });
  return b;
}

export function renderEvent(
  host: HTMLElement,
  model: EventModel,
  onPick: (a: RunAction) => void,
  content: Content = CONTENT,
): void {
  const text = el(
    'div',
    { class: 'event-text' },
    el('p', { class: 'event-desc' }, model.description),
    offerCard(model, content),
    model.note ? el('p', { class: 'event-note' }, model.note) : null,
  );
  host.replaceChildren(
    el(
      'div',
      { class: 'screen-primary' },
      el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1', id: 'event-title' }, model.title),
      // The lazy scene art puts the event's vignette first in the stage (src/art/screenArt.ts).
      el('div', { class: 'event-stage' }, text),
    ),
    el(
      'div',
      { class: 'screen-rail' },
      el(
        'div',
        { class: 'event-choices choice-list', role: 'group', 'aria-labelledby': 'event-title' },
        ...model.choices.map((c, i) => choiceButton(c, i, i === model.focusIndex && !c.disabled, onPick)),
      ),
    ),
    sheetStore(t('run.details'), t('run.open'), partyPanel(model.party, model.souls, 'event')),
  );
}
