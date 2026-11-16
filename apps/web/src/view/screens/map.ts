// Map screen: DOM rendering (renderMap) of the pure map model (buildMapModel, in @webgames/core).
// Layers stack vertically, step 1 first and the boss last, so the map reads well at 320 px.
import type { MapModel } from '@webgames/core/models/map';
import { t } from '@webgames/core/platform/i18n';
import type { NodeType } from '@webgames/core/sim/run/types';
import { confirmInline, el } from './dom';
import { partyPanel } from './party';

/** Type glyphs (text presentation): the label text always accompanies them. */
const GLYPH: Record<NodeType, string> = {
  wild: '⚔︎',
  elite: '✦',
  shrine: '✚',
  cache: '◈',
  mystery: '?',
  boss: '♛',
};

function stateText(node: MapModel['layers'][number]['nodes'][number]): string {
  const base = t(`map.${node.state}`);
  return node.current ? `${base}, ${t('map.current')}` : base;
}

function nodeButton(node: MapModel['layers'][number]['nodes'][number], onPick: (id: string) => void): HTMLElement {
  const state = stateText(node);
  const button = el(
    'button',
    {
      type: 'button',
      class: `map-node map-node--${node.state}${node.current ? ' map-node--current' : ''}`,
      'data-node': node.id,
      'data-type': node.type,
      'aria-label': t('map.nodeLabel', { label: node.label, state }),
      'aria-current': node.current ? 'location' : undefined,
      disabled: node.state !== 'available',
    },
    el('span', { class: 'map-node-icon', 'aria-hidden': 'true' }, GLYPH[node.type]),
    el('span', { class: 'map-node-text' }, el('span', { class: 'map-node-label' }, node.label), el('span', { class: 'map-node-state' }, state)),
  );
  if (node.state === 'available') button.addEventListener('click', () => onPick(node.id));
  return el('li', {}, button);
}

export function renderMap(
  host: HTMLElement,
  model: MapModel,
  onPick: (nodeId: string) => void,
  onAbandon: () => void = () => {},
): void {
  const layers = model.layers.map((layer) =>
    el(
      'li',
      { class: 'map-layer' },
      el('h3', { class: 'map-step' }, t('map.step', { n: layer.layer + 1 })),
      el('ol', { class: 'map-nodes' }, ...layer.nodes.map((n) => nodeButton(n, onPick))),
    ),
  );
  const abandon = el('button', { type: 'button', class: 'secondary', 'data-action': 'abandon' }, t('map.abandon'));
  abandon.addEventListener('click', () =>
    confirmInline(abandon, {
      question: t('map.abandonConfirm'),
      yes: t('map.abandonYes'),
      no: t('map.abandonNo'),
      yesAction: 'abandon-yes',
      noAction: 'abandon-no',
      onYes: onAbandon,
    }),
  );
  host.replaceChildren(
    el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1' }, t('map.zone', { n: model.zoneNo, name: model.zoneName })),
    partyPanel(model.party, model.souls, 'map'),
    el('ol', { class: 'map-layers' }, ...layers),
    el('div', { class: 'map-footer' }, abandon),
  );
}
