import { createRng } from '../rng';
import type { Rng } from '../rng';
import type { MapNode, NodeType, ZoneMap } from './types';

const LAYERS = 7;
const BOSS_LAYER = 6;
const SHRINE_LAYER = 5;

/** Cumulative percent weights, drawn with one nextInt(100) per node. */
const WEIGHTS: ReadonlyArray<readonly [NodeType, number]> = [
  ['wild', 50],
  ['elite', 65],
  ['shrine', 80],
  ['cache', 90],
  ['mystery', 100],
];

function drawType(rng: Rng): NodeType {
  const roll = rng.nextInt(100);
  for (const [type, cumulative] of WEIGHTS) if (roll < cumulative) return type;
  return 'wild';
}

function nodeId(zone: number, layer: number, col: number): string {
  return `z${zone}-l${layer}-c${col}`;
}

function drawTypes(rng: Rng, layer: number, width: number): NodeType[] {
  if (layer === 0) return Array.from({ length: width }, () => 'wild' as const);
  const types: NodeType[] = [];
  let hasElite = false;
  for (let c = 0; c < width; c++) {
    let t = drawType(rng);
    if (t === 'elite') {
      if (layer <= 1 || hasElite) t = 'wild';
      else hasElite = true;
    }
    types.push(t);
  }
  if (layer === SHRINE_LAYER && !types.includes('shrine')) {
    types[rng.nextInt(width)] = 'shrine';
  }
  return types;
}

/** Successor columns for each source node of one layer (1-2 each, every target covered). */
function wireLayer(rng: Rng, sources: number, targets: number): number[][] {
  const out: number[][] = [];
  for (let s = 0; s < sources; s++) {
    const first = rng.nextInt(targets);
    const cols = [first];
    if (rng.nextInt(2) === 1) {
      // Pick a distinct second target.
      const offset = 1 + rng.nextInt(targets - 1);
      cols.push((first + offset) % targets);
    }
    out.push(cols);
  }

  for (let t = 0; t < targets; t++) {
    if (out.some((cols) => cols.includes(t))) continue;
    const single: number[] = [];
    for (let s = 0; s < sources; s++) if (out[s]!.length === 1) single.push(s);
    if (single.length > 0) {
      out[single[rng.nextInt(single.length)]!]!.push(t);
      continue;
    }
    // Every source already has two successors: redirect an edge to a target
    // that keeps at least one other incoming edge.
    const indegree = new Array<number>(targets).fill(0);
    for (const cols of out) for (const c of cols) indegree[c]!++;
    const edges: Array<[number, number]> = [];
    for (let s = 0; s < sources; s++) {
      for (let i = 0; i < out[s]!.length; i++) if (indegree[out[s]![i]!]! >= 2) edges.push([s, i]);
    }
    const [s, i] = edges[rng.nextInt(edges.length)]!;
    out[s]![i] = t;
  }
  return out.map((cols) => [...cols].sort((a, b) => a - b));
}

export function generateZoneMap(seed: string, zone: number): ZoneMap {
  if (!Number.isInteger(zone) || zone < 0 || zone > 2) {
    throw new RangeError(`zone must be an integer in 0..2, got ${zone}`);
  }
  const rng = createRng(seed).fork('map:' + zone);

  const widths: number[] = [];
  for (let l = 0; l < BOSS_LAYER; l++) widths.push(2 + rng.nextInt(2));
  widths.push(1);

  const layers: MapNode[][] = [];
  for (let l = 0; l < LAYERS; l++) {
    const types: NodeType[] = l === BOSS_LAYER ? ['boss'] : drawTypes(rng, l, widths[l]!);
    layers.push(types.map((type, c) => ({ id: nodeId(zone, l, c), zone, layer: l, type, next: [] })));
  }

  for (let l = 0; l < BOSS_LAYER; l++) {
    const links = l === SHRINE_LAYER ? layers[l]!.map(() => [0]) : wireLayer(rng, widths[l]!, widths[l + 1]!);
    layers[l]!.forEach((node, c) => {
      node.next = links[c]!.map((col) => nodeId(zone, l + 1, col));
    });
  }

  return { zone, layers };
}

/** The node with id `id` in `map`, or undefined when the map or the node is missing. */
export function findNode(map: ZoneMap | undefined, id: string): MapNode | undefined {
  if (!map) return undefined;
  for (const layer of map.layers) for (const node of layer) if (node.id === id) return node;
  return undefined;
}
