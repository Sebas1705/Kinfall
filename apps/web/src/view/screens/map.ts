// Map screen: DOM rendering (renderMap) of the pure map model (buildMapModel, in @kinfall/core).
// The console layout draws the zone as a fixed board (7 layers, 2 to 3 nodes each and the boss: at
// most 19 buttons) in the primary region, with the focused node's name in the rail. Party details,
// the run log and Abandon (with its inline confirmation) open in the run sheet. In the fallback
// layout the layers stack vertically, step 1 first and the boss last, so the map reads at 320 px.
import type { MapModel } from '@kinfall/core/models/map';
import { t } from '@kinfall/core/platform/i18n';
import { confirmInline, el, sheetStore } from './dom';
import { partyPanel } from './party';

type NodeModel = MapModel['layers'][number]['nodes'][number];

function stateText(node: NodeModel): string {
  const base = t(`map.${node.state}`);
  return node.current ? `${base}, ${t('map.current')}` : base;
}

function nodeButton(node: NodeModel, onPick: (id: string) => void): HTMLElement {
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
    // Icon slot: the lazy scene art draws the type's pixel icon here (src/art/screenArt.ts).
    el('span', { class: 'map-node-icon', 'aria-hidden': 'true' }),
    // Short type name under the icon (first word of the label): real text the console board shows.
    el('span', { class: 'map-node-short' }, node.label.split(' ')[0]),
    el('span', { class: 'map-node-text' }, el('span', { class: 'map-node-label' }, node.label), el('span', { class: 'map-node-state' }, state)),
  );
  if (node.state === 'available') button.addEventListener('click', () => onPick(node.id));
  return el('li', {}, button);
}

/**
 * The rail's readout: the name and state of the node under the focus or the pointer (the icons on
 * the board carry no text in the console). Purely visual: every node already has its accessible
 * name, so the readout is hidden from assistive technology.
 */
function mapReadout(board: HTMLElement): HTMLElement {
  const label = el('span', { class: 'map-readout-label' });
  const state = el('span', { class: 'map-readout-state' });
  const readout = el('div', { class: 'map-readout', 'aria-hidden': 'true' }, label, state);
  const show = (button: Element | null | undefined) => {
    if (!button) return;
    label.textContent = button.querySelector('.map-node-label')?.textContent ?? '';
    state.textContent = button.querySelector('.map-node-state')?.textContent ?? '';
  };
  const nodes = [...board.querySelectorAll<HTMLElement>('button.map-node')];
  show(nodes.find((b) => !b.hasAttribute('disabled')) ?? nodes.find((b) => b.hasAttribute('aria-current')) ?? nodes[0]);
  const follow = (e: Event) => {
    const target = e.target instanceof Element ? e.target.closest('button.map-node') : null;
    if (target) show(target);
  };
  board.addEventListener('focusin', follow);
  board.addEventListener('mouseover', follow);
  return readout;
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
  const board = el('ol', { class: 'map-layers' }, ...layers);
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
    el(
      'div',
      { class: 'screen-primary' },
      el('h2', { class: 'screen-heading', 'data-screen-heading': true, tabindex: '-1' }, t('map.zone', { n: model.zoneNo, name: model.zoneName })),
      board,
    ),
    el('div', { class: 'screen-rail' }, mapReadout(board)),
    sheetStore(t('run.details'), t('run.open'), partyPanel(model.party, model.souls, 'map'), el('div', { class: 'map-footer' }, abandon)),
  );
}
