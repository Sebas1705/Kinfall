// Map screen model: a pure model of the current zone (buildMapModel). The web app renders it
// (apps/web/src/view/screens/map.ts); nothing here touches the DOM.
import type { Content } from '../content';
import { lookup } from '../content/lookup';
import { nodeTypeLabel, speciesName, t } from '../platform/i18n';
import { findNode } from '../sim/run/map';
import { availableNodes, maxHpOf } from '../sim/run/run';
import type { NodeType, RunState, ZoneMap } from '../sim/run/types';

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
