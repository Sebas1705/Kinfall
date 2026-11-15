import type { StatusId } from '../content';
import type { RngState } from './rng';

export type Side = 'player' | 'enemy';

export interface Combatant {
  speciesId: string;
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  status: { id: StatusId; turns: number } | null;
  fainted: boolean;
}

export interface TeamSpec {
  speciesIds: string[];
  /** Current hp per member (carried between battles); each 1 <= hp[i] <= maxHp. Defaults to full. */
  hp?: number[];
  /** Integer 50..500 scaling every member's maxHp (default 100). */
  hpPercent?: number;
}

export type Action = { type: 'move'; moveIndex: number } | { type: 'swap'; toIndex: number };

export interface BattleState {
  version: 1;
  seed: string;
  rng: RngState;
  teams: Record<Side, Combatant[]>;
  active: Record<Side, number>;
  turn: number;
  winner: Side | null;
  /** When true the enemy's next move is shown in `intent` before the player acts. */
  telegraph: boolean;
  intent: { moveIndex: number } | null;
  /** Boss script: the enemy plays `script[(turn - 1) % length]` when that move is legal. Absent when unscripted. */
  script?: number[];
}

export type BattleEvent =
  | { type: 'turnStart'; turn: number }
  | { type: 'move'; side: Side; moveId: string; hit: boolean }
  | { type: 'damage'; side: Side; amount: number; effectiveness: number; source?: 'scorch' }
  | { type: 'heal'; side: Side; amount: number }
  | { type: 'status'; side: Side; status: StatusId }
  | { type: 'skip'; side: Side }
  | { type: 'swap'; side: Side; toIndex: number }
  | { type: 'fainted'; side: Side }
  | { type: 'rejected'; reason: 'illegal' | 'ended' | 'focus' }
  | { type: 'end'; winner: Side };
