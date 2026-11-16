// Map screen: a pure model of the current zone (buildMapModel) and its DOM rendering (renderMap).
// Layers stack vertically, step 1 first and the boss last, so the map reads well at 320 px.
import type { Content } from '../../content';
import { lookup } from '../../content/lookup';
import { nodeTypeLabel, speciesName, t } from '../../platform/i18n';
import { findNode } from '../../sim/run/map';
import { availableNodes, maxHpOf } from '../../sim/run/run';
import type { NodeType, RunState, ZoneMap } from '../../sim/run/types';
import { confirmInline, el } from './dom';

export type NodeState = 'available' | 'cleared' | 'locked';

export interface MapModel {
  zoneName: string;
  /** 1-based zone number, for the heading. */
  zoneNo: number;
  layers: Array<{
    layer: number;
    nodes: Array<{ id: string; label: string; type: NodeType; state: NodeState; current: boolean }>;
  }>;
  party: Array<{ name: string; hp: number; maxHp: number }>;
  souls: number;
}

/** Type glyphs (text presentation): the label text always accompanies them. */
const GLYPH: Record<NodeType, string> = {
  wild: '⚔︎',
  elite: '✦',
  shrine: '✚',
  cache: '◈',
  mystery: '?',
  boss: '♛',
};

/**
 * Ids of the nodes cleared in the current zone, ending at `run.at`. The run state keeps only the
 * last node, so earlier steps come from `trail` (ids the player picked this session) or, failing
 * that, from the map when only one node leads in. An ambiguous step stops the walk back.
 */
function clearedPath(map: ZoneMap | undefined, at: string | null, trail: readonly string[]): Set<string> {
  const path = new Set<string>();
  let node = at === null ? undefined : findNode(map, at);
  while (node && map) {
    path.add(node.id);
    const target = node.id;
    const preds = (map.layers[node.layer - 1] ?? []).filter((p) => p.next.includes(target));
    node = preds.find((p) => trail.includes(p.id)) ?? (preds.length === 1 ? preds[0] : undefined);
  }
  return path;
}

export function buildMapModel(run: RunState, content: Content, trail: readonly string[] = []): MapModel {
  const map = run.maps[run.zone];
  const cleared = clearedPath(map, run.at, trail);
  const open = new Set(availableNodes(run).map((n) => n.id));
  const zoneKey = `zone.${Math.min(2, Math.max(0, run.zone)) as 0 | 1 | 2}` as const;
  const lk = lookup(content);
  return {
    zoneName: t(zoneKey),
    zoneNo: run.zone + 1,
    layers: (map?.layers ?? []).map((nodes, layer) => ({
      layer,
      nodes: nodes.map((n) => ({
        id: n.id,
        label: nodeTypeLabel(n.type),
        type: n.type,
        state: open.has(n.id) ? 'available' : cleared.has(n.id) ? 'cleared' : 'locked',
        current: n.id === run.at,
      })),
    })),
    party: run.party.map((m) => ({
      name: speciesName(lk.species(m.speciesId)),
      hp: m.hp,
      maxHp: maxHpOf(m.speciesId, content),
    })),
    souls: run.souls,
  };
}

function stateText(node: MapModel['layers'][number]['nodes'][number]): string {
  const base = t(`map.${node.state}`);
  return node.current ? `${base}, ${t('map.current')}` : base;
}

function statusPanel(model: MapModel): HTMLElement {
  const members = model.party.map((p) =>
    el('li', { class: 'run-member' }, t('map.partyMember', { species: p.name, hp: p.hp, max: p.maxHp })),
  );
  return el(
    'section',
    { class: 'run-status', 'aria-labelledby': 'run-party-title' },
    el('h3', { class: 'panel-title', id: 'run-party-title' }, t('map.party')),
    el('ul', { class: 'run-party' }, ...members),
    el('p', { class: 'run-souls' }, el('span', {}, t('map.souls')), ': ', el('strong', { class: 'run-souls-value' }, String(model.souls))),
  );
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
    statusPanel(model),
    el('ol', { class: 'map-layers' }, ...layers),
    el('div', { class: 'map-footer' }, abandon),
  );
}
