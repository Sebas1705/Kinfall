import { effectiveness } from '../content';
import type { Content, MoveDef, SpeciesDef, StatusId } from '../content';
import { createRng, restoreRng } from './rng';
import type { Rng } from './rng';
import type { Action, BattleEvent, BattleState, Combatant, Side, TeamSpec } from './state';

const MAX_TEAM = 3;
const STATUS_TURNS: Record<StatusId, number> = { scorch: 3, stun: 1 };

function other(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

function speciesOf(id: string, content: Content): SpeciesDef {
  const sp = content.species.find((s) => s.id === id);
  if (!sp) throw new Error(`unknown species: ${id}`);
  return sp;
}

function moveOf(id: string, content: Content): MoveDef {
  const m = content.moves.find((x) => x.id === id);
  if (!m) throw new Error(`unknown move: ${id}`);
  return m;
}

function makeCombatant(speciesId: string, content: Content): Combatant {
  const { base } = speciesOf(speciesId, content);
  const maxHp = base.health * 4;
  const maxFocus = Math.max(1, Math.floor(base.focus / 10));
  return { speciesId, hp: maxHp, maxHp, focus: maxFocus, maxFocus, status: null, fainted: false };
}

function makeTeam(spec: TeamSpec, label: string, content: Content): Combatant[] {
  const ids = spec.speciesIds;
  if (ids.length < 1 || ids.length > MAX_TEAM) {
    throw new Error(`${label} team must have 1..${MAX_TEAM} members, got ${ids.length}`);
  }
  return ids.map((id) => makeCombatant(id, content));
}

export function createBattle(
  seed: string,
  player: TeamSpec,
  enemy: TeamSpec,
  content: Content,
): BattleState {
  return {
    version: 1,
    seed,
    rng: createRng(seed).getState(),
    teams: { player: makeTeam(player, 'player', content), enemy: makeTeam(enemy, 'enemy', content) },
    active: { player: 0, enemy: 0 },
    turn: 1,
    winner: null,
    intent: null,
  };
}

function activeOf(state: BattleState, side: Side): Combatant {
  const c = state.teams[side][state.active[side]];
  if (!c) throw new Error(`no active combatant for ${side}`);
  return c;
}

type Rejection = 'illegal' | 'ended' | 'focus';

/** Why `action` is not allowed for the player right now, or null when it is legal. */
function rejection(state: BattleState, action: Action, content: Content): Rejection | null {
  if (state.winner !== null) return 'ended';
  const team = state.teams.player;
  const current = activeOf(state, 'player');
  if (action.type === 'swap') {
    const i = action.toIndex;
    if (!Number.isInteger(i) || i < 0 || i >= team.length) return 'illegal';
    if (i === state.active.player || team[i]!.fainted) return 'illegal';
    return null;
  }
  // A fainted active creature must be swapped out before anything else.
  if (current.fainted) return 'illegal';
  const moves = speciesOf(current.speciesId, content).moves;
  const i = action.moveIndex;
  if (!Number.isInteger(i) || i < 0 || i >= moves.length) return 'illegal';
  if (moveOf(moves[i]!, content).focusCost > current.focus) return 'focus';
  return null;
}

function moveActions(c: Combatant, content: Content): Action[] {
  if (c.fainted) return [];
  const out: Action[] = [];
  speciesOf(c.speciesId, content).moves.forEach((id, moveIndex) => {
    if (moveOf(id, content).focusCost <= c.focus) out.push({ type: 'move', moveIndex });
  });
  return out;
}

export function legalActions(state: BattleState, content: Content): Action[] {
  if (state.winner !== null) return [];
  const out = moveActions(activeOf(state, 'player'), content);
  state.teams.player.forEach((c, toIndex) => {
    if (toIndex !== state.active.player && !c.fainted) out.push({ type: 'swap', toIndex });
  });
  return out;
}

/** Task 4 enemy: the first legal move of its active creature (the AI arrives in Task 5). */
function enemyAction(state: BattleState, content: Content): Action | null {
  return moveActions(activeOf(state, 'enemy'), content)[0] ?? null;
}

function resolveMove(
  s: BattleState,
  side: Side,
  moveIndex: number,
  rng: Rng,
  content: Content,
  events: BattleEvent[],
): void {
  const user = activeOf(s, side);
  if (user.fainted) return; // knocked out earlier this turn
  const userSp = speciesOf(user.speciesId, content);
  const move = moveOf(userSp.moves[moveIndex]!, content);
  user.focus -= move.focusCost;

  const hit = rng.nextInt(100) < move.accuracy;
  events.push({ type: 'move', side, moveId: move.id, hit });
  if (!hit) return;

  const targetSide = move.target === 'self' ? side : other(side);
  const target = activeOf(s, targetSide);

  if (move.kind === 'damage') {
    const targetSp = speciesOf(target.speciesId, content);
    let base = Math.floor((move.power * userSp.base.power) / targetSp.base.guard);
    if (userSp.elements.includes(move.element)) base = Math.floor((base * 125) / 100);
    const eff = effectiveness(move.element, targetSp.elements);
    // The event reports the hp actually lost so logs reconcile with state.
    const amount = Math.min(target.hp, Math.max(1, Math.floor((base * eff) / 100)));
    target.hp -= amount;
    events.push({ type: 'damage', side: targetSide, amount, effectiveness: eff });
    if (target.hp === 0) {
      target.fainted = true;
      events.push({ type: 'fainted', side: targetSide });
    }
  } else if (move.kind === 'heal') {
    const amount = Math.min(target.maxHp - target.hp, Math.floor((target.maxHp * move.power) / 100));
    target.hp += amount;
    events.push({ type: 'heal', side: targetSide, amount });
  } else if (move.status && target.status === null) {
    target.status = { id: move.status, turns: STATUS_TURNS[move.status] };
    events.push({ type: 'status', side: targetSide, status: move.status });
  }
}

function resolveSwap(s: BattleState, side: Side, toIndex: number, events: BattleEvent[]): void {
  s.active[side] = toIndex;
  events.push({ type: 'swap', side, toIndex });
}

export function applyAction(
  state: BattleState,
  action: Action,
  content: Content,
): { state: BattleState; events: BattleEvent[] } {
  const reason = rejection(state, action, content);
  if (reason !== null) return { state: structuredClone(state), events: [{ type: 'rejected', reason }] };

  const s = structuredClone(state);

  // Replacing a fainted active creature is free: no turn, no enemy action, no rng draw.
  if (action.type === 'swap' && activeOf(s, 'player').fainted) {
    const events: BattleEvent[] = [];
    resolveSwap(s, 'player', action.toIndex, events);
    return { state: s, events };
  }

  const rng = restoreRng(s.rng);
  const events: BattleEvent[] = [{ type: 'turnStart', turn: s.turn }];

  // Order: a swap always goes first; otherwise by speed, ties by the seeded rng.
  const enemyAct = enemyAction(s, content);
  let order: Side[];
  if (action.type === 'swap' || enemyAct === null) {
    order = ['player', 'enemy'];
  } else {
    const ps = speciesOf(activeOf(s, 'player').speciesId, content).base.speed;
    const es = speciesOf(activeOf(s, 'enemy').speciesId, content).base.speed;
    const playerFirst = ps > es || (ps === es && rng.nextInt(2) === 0);
    order = playerFirst ? ['player', 'enemy'] : ['enemy', 'player'];
  }

  for (const side of order) {
    const act = side === 'player' ? action : enemyAct;
    if (act === null) continue;
    if (act.type === 'swap') resolveSwap(s, side, act.toIndex, events);
    else resolveMove(s, side, act.moveIndex, rng, content, events);
  }

  // Win check (player wipe first: a mutual wipe counts as a loss).
  if (s.teams.player.every((c) => c.fainted)) s.winner = 'enemy';
  else if (s.teams.enemy.every((c) => c.fainted)) s.winner = 'player';

  if (s.winner === null) {
    // A fainted enemy is replaced by its next living creature; the player picks its replacement with a free swap.
    if (activeOf(s, 'enemy').fainted) {
      const next = s.teams.enemy.findIndex((c) => !c.fainted);
      resolveSwap(s, 'enemy', next, events);
    }
    // End of turn: active, conscious creatures regain 1 focus up to their max.
    for (const side of ['player', 'enemy'] as const) {
      const c = activeOf(s, side);
      if (!c.fainted && c.focus < c.maxFocus) c.focus += 1;
    }
  } else {
    events.push({ type: 'end', winner: s.winner });
  }

  s.turn += 1;
  s.rng = rng.getState();
  return { state: s, events };
}
