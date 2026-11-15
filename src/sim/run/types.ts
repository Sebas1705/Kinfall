export type NodeType = 'wild' | 'elite' | 'shrine' | 'cache' | 'mystery' | 'boss';

export interface MapNode {
  /** Format `z<zone>-l<layer>-c<col>`, `col` 0-based within the layer. */
  id: string;
  zone: number;
  layer: number;
  type: NodeType;
  /** Ids of successors in layer + 1, sorted by column ascending, no duplicates. */
  next: string[];
}

export interface ZoneMap {
  zone: number;
  /** Seven layers; `layers[6]` is the single boss node. */
  layers: MapNode[][];
}
