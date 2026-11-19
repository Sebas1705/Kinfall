// Event screens (recruit, shrine, cache, mystery): DOM rendering (renderEvent) of the pure event
// model (buildEventModel, in @kinfall/core).
import { CONTENT } from '@kinfall/core/content';
import type { Content } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import type { EventChoice, EventModel } from '@kinfall/core/models/event';
import { t } from '@kinfall/core/platform/i18n';
import type { RunAction } from '@kinfall/core/sim/run/types';
import { creatureCanvas } from './art';
import { el } from './dom';
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
  const parts: Array<HTMLElement | null> = [
    el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1', id: 'event-title' }, model.title),
    el('p', { class: 'event-desc' }, model.description),
    offerCard(model, content),
    model.note ? el('p', { class: 'event-note' }, model.note) : null,
    el(
      'div',
      { class: 'event-choices choice-list', role: 'group', 'aria-labelledby': 'event-title' },
      ...model.choices.map((c, i) => choiceButton(c, i, i === model.focusIndex && !c.disabled, onPick)),
    ),
    partyPanel(model.party, model.souls, 'event'),
  ];
  host.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
}
