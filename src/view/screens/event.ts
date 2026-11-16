// Event screens (recruit, shrine, cache, mystery): a pure model built from the run state and the
// legal run actions (buildEventModel), and its DOM rendering (renderEvent).
import { CONTENT } from '../../content';
import type { Content } from '../../content';
import { lookup } from '../../content/lookup';
import { speciesName, t } from '../../platform/i18n';
import { evolutionOf } from '../../sim/run/events';
import { legalRunActions, maxHpOf } from '../../sim/run/run';
import type { RunAction, RunState } from '../../sim/run/types';
import { creatureCanvas } from './art';
import { el } from './dom';
import { partyPanel } from './party';
import type { PartyRow } from './party';

export type EventKind = 'recruit' | 'shrine' | 'cache' | 'mystery';

export interface EventChoice {
  action: RunAction;
  label: string;
  /** Short extra text (cost, effect, or why the choice is unavailable). */
  detail?: string;
  disabled: boolean;
}

export interface EventModel {
  kind: EventKind;
  title: string;
  description: string;
  /** Extra line, e.g. "your party is full". */
  note?: string;
  /** The creature offered on a recruit screen. */
  offer?: { speciesId: string; name: string; elements: string; hp: number; maxHp: number };
  party: PartyRow[];
  souls: number;
  choices: EventChoice[];
}

const same = (a: RunAction, b: RunAction) => JSON.stringify(a) === JSON.stringify(b);

/** Choices that move on without changing anything go last. */
function isExit(a: RunAction): boolean {
  return (a.type === 'recruit' && !a.take) || (a.type === 'shrine' && a.choice === 'leave') || (a.type === 'mystery' && a.choice === 'leave');
}

/**
 * Pure model of the current event phase, or null outside the recruit, shrine, cache and mystery
 * phases. Enabled choices are exactly the legal run actions; evolve entries are listed for every
 * member that can evolve, disabled (with the reason in text) when souls are short.
 */
export function buildEventModel(run: RunState, content: Content): EventModel | null {
  const phase = run.phase;
  if (phase.kind !== 'recruit' && phase.kind !== 'shrine' && phase.kind !== 'cache' && phase.kind !== 'mystery') return null;
  const lk = lookup(content);
  const name = (id: string) => speciesName(lk.species(id));
  const row = (m: { speciesId: string; hp: number }): PartyRow => ({ name: name(m.speciesId), hp: m.hp, maxHp: maxHpOf(m.speciesId, content) });
  const memberLine = (i: number) => {
    const r = row(run.party[i]!);
    return t('map.partyMember', { species: r.name, hp: r.hp, max: r.maxHp });
  };

  const legal = legalRunActions(run, content);
  const choices: EventChoice[] = [];
  const entry = (action: RunAction): EventChoice => {
    switch (action.type) {
      case 'recruit':
        if (!action.take) return { action, label: t('event.recruit.decline'), disabled: false };
        if (action.replaceIndex === undefined) return { action, label: t('event.recruit.take'), disabled: false };
        return {
          action,
          label: t('event.recruit.replace', { species: name(run.party[action.replaceIndex]!.speciesId) }),
          detail: memberLine(action.replaceIndex),
          disabled: false,
        };
      case 'shrine':
        return action.choice === 'rest'
          ? { action, label: t('event.shrine.rest'), detail: t('event.shrine.restDetail'), disabled: false }
          : { action, label: t('event.shrine.leave'), disabled: false };
      case 'cache':
        return { action, label: t('event.cache.open'), detail: t('event.cache.detail'), disabled: false };
      case 'mystery':
        return { action, label: t(action.choice === 'open' ? 'event.mystery.open' : 'event.mystery.leave'), disabled: false };
      default:
        return { action, label: '', disabled: true };
    }
  };
  for (const action of legal) if (action.type !== 'evolve' && !isExit(action)) choices.push(entry(action));
  if (phase.kind === 'shrine') {
    run.party.forEach((m, memberIndex) => {
      const evo = evolutionOf(m.speciesId, content);
      if (!evo) return;
      const action: RunAction = { type: 'evolve', memberIndex };
      const enabled = legal.some((l) => same(l, action));
      const cost = t('event.shrine.evolveCost', { cost: evo.cost });
      choices.push({
        action,
        label: t('event.shrine.evolve', { species: name(m.speciesId) }),
        detail: enabled ? cost : `${cost} · ${t('event.disabled.souls')}`,
        disabled: !enabled,
      });
    });
  }
  for (const action of legal) if (isExit(action)) choices.push(entry(action));

  const base = { kind: phase.kind, party: run.party.map(row), souls: run.souls, choices };
  if (phase.kind === 'recruit') {
    const sp = lk.species(phase.speciesId);
    return {
      ...base,
      title: t('event.recruit.title'),
      description: t('event.recruit.desc', { species: name(phase.speciesId), hp: phase.hp }),
      ...(legal.some((a) => a.type === 'recruit' && a.replaceIndex !== undefined) ? { note: t('event.recruit.full') } : {}),
      offer: {
        speciesId: phase.speciesId,
        name: name(phase.speciesId),
        elements: sp.elements.map((e) => t(`element.${e}`)).join(' / '),
        hp: phase.hp,
        maxHp: maxHpOf(phase.speciesId, content),
      },
    };
  }
  return { ...base, title: t(`event.${phase.kind}.title`), description: t(`event.${phase.kind}.desc`) };
}

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

function choiceButton(choice: EventChoice, index: number, onPick: (a: RunAction) => void): HTMLElement {
  const b = el(
    'button',
    { type: 'button', class: 'choice', 'data-choice': String(index), disabled: choice.disabled },
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
      ...model.choices.map((c, i) => choiceButton(c, i, onPick)),
    ),
    partyPanel(model.party, model.souls, 'event'),
  ];
  host.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
}
