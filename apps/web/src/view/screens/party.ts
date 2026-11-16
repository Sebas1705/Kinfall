// Party and souls panel shared by the map and event screens.
import type { PartyRow } from '@webgames/core/models/party';
import { t } from '@webgames/core/platform/i18n';
import { el } from './dom';

/** `idPrefix` keeps ids unique: hidden screens keep their old DOM while another one is shown. */
export function partyPanel(party: PartyRow[], souls: number, idPrefix: string): HTMLElement {
  const titleId = `${idPrefix}-party-title`;
  const members = party.map((p) => el('li', { class: 'run-member' }, t('map.partyMember', { species: p.name, hp: p.hp, max: p.maxHp })));
  return el(
    'section',
    { class: 'run-status', 'aria-labelledby': titleId },
    el('h3', { class: 'panel-title', id: titleId }, t('map.party')),
    el('ul', { class: 'run-party' }, ...members),
    el('p', { class: 'run-souls' }, el('span', {}, t('map.souls')), ': ', el('strong', { class: 'run-souls-value' }, String(souls))),
  );
}
