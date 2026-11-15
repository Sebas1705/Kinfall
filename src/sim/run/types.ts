import type { RngState } from '../rng';
import type { Action, BattleEvent, BattleState } from '../state';

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

export interface PartyMember {
  speciesId: string;
  /** Current hp, 1..maxHpOf(speciesId); carried between battles. */
  hp: number;
}

export type RunPhase =
  | { kind: 'map' }
  | { kind: 'battle'; nodeId: string; battle: BattleState }
  | { kind: 'recruit'; speciesId: string; hp: number }
  | { kind: 'shrine'; nodeId: string }
  | { kind: 'cache'; nodeId: string }
  | { kind: 'mystery'; nodeId: string }
  | { kind: 'ended'; result: 'won' | 'lost' };

export interface RunStats {
  nodesCleared: number;
  elitesBeaten: number;
  bossesBeaten: number;
  creaturesLost: number;
}

export interface RunState {
  version: 1;
  seed: string;
  rng: RngState;
  maps: ZoneMap[];
  zone: number;
  /** Id of the last cleared node in the current zone; null at a zone start. */
  at: string | null;
  party: PartyMember[];
  souls: number;
  stats: RunStats;
  phase: RunPhase;
}

export type RunAction =
  | { type: 'node'; nodeId: string }
  | { type: 'battle'; action: Action }
  | { type: 'recruit'; take: boolean; replaceIndex?: number }
  | { type: 'shrine'; choice: 'rest' | 'leave' }
  | { type: 'evolve'; memberIndex: number }
  | { type: 'cache' }
  | { type: 'mystery'; choice: 'open' | 'leave' };

export type RunEvent =
  | { type: 'enter'; nodeId: string; nodeType: NodeType }
  | { type: 'battle'; event: BattleEvent }
  | { type: 'soul'; amount: number; reason: 'fallen' | 'elite' | 'boss' | 'cache' | 'mystery' }
  | { type: 'lost'; speciesId: string }
  | { type: 'recruited'; speciesId: string; replaced?: string }
  | { type: 'declined'; speciesId: string }
  | { type: 'evolved'; from: string; to: string }
  | { type: 'healed'; memberIndex: number; amount: number }
  | { type: 'hurt'; memberIndex: number; amount: number }
  | { type: 'zoneCleared'; zone: number }
  | { type: 'ended'; result: 'won' | 'lost' }
  | { type: 'rejected'; reason: 'illegal' | 'phase' | 'ended' };

export interface RunStep {
  run: RunState;
  events: RunEvent[];
}
