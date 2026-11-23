// Party chips in the HUD: one short chip per member (name and HP) and the souls, on the map and on
// events. The full list lives in the run sheet; the chips are a glance. Text only, no colour-only
// state: a member at a quarter of its HP or less also gets the `hud-chip--low` class for styling.
import type { PartyRow } from '@kinfall/core/models/party';
import { t } from '@kinfall/core/platform/i18n';
import { el } from './screens/dom';

export function setHudParty(host: HTMLElement | null, party: PartyRow[] | null, souls = 0): void {
  if (!host) return;
  if (party === null) {
    host.replaceChildren();
    return;
  }
  const chips = party.map((p) =>
    el(
      'li',
      { class: `hud-chip${p.hp * 4 <= p.maxHp ? ' hud-chip--low' : ''}` },
      el('span', { class: 'hud-chip__name' }, `${p.name} `),
      el('span', { class: 'hud-chip__value' }, `${p.hp}/${p.maxHp}`),
    ),
  );
  chips.push(
    el(
      'li',
      { class: 'hud-chip hud-chip--souls' },
      el('span', { class: 'hud-chip__name' }, `${t('map.souls')} `),
      el('span', { class: 'hud-chip__value' }, String(souls)),
    ),
  );
  host.replaceChildren(el('ul', { class: 'hud-chips', 'aria-label': t('map.party') }, ...chips));
}
