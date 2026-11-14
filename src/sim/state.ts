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
  intent: { moveIndex: number } | null;
}

export type BattleEvent =
  | { type: 'turnStart'; turn: number }
  | { type: 'move'; side: Side; moveId: string; hit: boolean }
  | { type: 'damage'; side: Side; amount: number; effectiveness: number }
  | { type: 'heal'; side: Side; amount: number }
  | { type: 'status'; side: Side; status: StatusId }
  | { type: 'swap'; side: Side; toIndex: number }
  | { type: 'fainted'; side: Side }
  | { type: 'rejected'; reason: 'illegal' | 'ended' | 'focus' }
  | { type: 'end'; winner: Side };
