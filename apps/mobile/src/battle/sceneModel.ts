// What the battle scene shows for each side while a turn plays: a copy of the active creature that
// the turn's events update one by one (HP down on damage, a status chip, a swap...). Pure display
// data: the sim's state is already final when a play starts, and the next render replaces all of
// this with that state. Mirrors the web scene (apps/web/src/view/battleView.ts).
import type { StatusId } from '@kinfall/core/content';
import type { BattleEvent, BattleState, Combatant, Side } from '@kinfall/core/sim/state';

export interface ShownCreature {
  speciesId: string;
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  status: StatusId | null;
  fainted: boolean;
}

export type ShownSides = Record<Side, ShownCreature | null>;

export const SIDES: readonly Side[] = ['enemy', 'player'];

export function shownOf(c: Combatant): ShownCreature {
  return {
    speciesId: c.speciesId,
    hp: c.hp,
    maxHp: c.maxHp,
    focus: c.focus,
    maxFocus: c.maxFocus,
    status: c.status?.id ?? null,
    fainted: c.fainted,
  };
}

/** The active creature of each side in `state`. */
export function shownSides(state: BattleState): ShownSides {
  const of = (side: Side) => {
    const c = state.teams[side][state.active[side]];
    return c ? shownOf(c) : null;
  };
  return { enemy: of('enemy'), player: of('player') };
}

const clampHp = (s: ShownCreature, hp: number) => Math.max(0, Math.min(s.maxHp, hp));

/**
 * The shown creature of `event.side` after `event`. `rendered` is the state the scene last drew (a
 * swap brings in that state's creature, as the web scene does). Events that change nothing visible
 * return `current` unchanged.
 */
export function applyShownEvent(current: ShownSides, event: BattleEvent, rendered: BattleState | null): ShownSides {
  if (!('side' in event)) return current;
  const side = event.side;
  const s = current[side];
  switch (event.type) {
    case 'damage':
      return s ? { ...current, [side]: { ...s, hp: clampHp(s, s.hp - event.amount) } } : current;
    case 'heal':
      return s ? { ...current, [side]: { ...s, hp: clampHp(s, s.hp + event.amount) } } : current;
    case 'status':
      return s ? { ...current, [side]: { ...s, status: event.status } } : current;
    case 'skip':
      return s && s.status === 'stun' ? { ...current, [side]: { ...s, status: null } } : current;
    case 'fainted':
      return s ? { ...current, [side]: { ...s, hp: 0, fainted: true, status: null } } : current;
    case 'swap': {
      const next = rendered?.teams[side][event.toIndex];
      return next ? { ...current, [side]: shownOf(next) } : current;
    }
    default:
      return current;
  }
}
