// Battle menu model (presentation side). `buildMenu` and `logLines` are pure: they read the sim's state and
// events and produce text and choices; nothing here feeds back into the simulation. The web app renders
// the model (apps/web/src/view/menu.ts).
import type { Content } from '../content';
import { lookup } from '../content/lookup';
import { eventLine, moveName, speciesName, t } from '../platform/i18n';
import { legalActions } from '../sim/battle';
import type { Action, BattleEvent, BattleState, Side } from '../sim/state';

export interface MenuEntry {
  action: Action;
  label: string;
  disabled: boolean;
  detail?: string;
}

export interface MenuModel {
  /** Moves of the active creature in move order, then swaps in team order. */
  entries: MenuEntry[];
  /** "Next: {move}" for a telegraphed enemy move, the stunned label, or null. */
  intent: string | null;
  /** True when the player's active creature has fallen and a replacement must be picked. */
  mustSwap: boolean;
  /** Short heading above the choices; empty once the battle is over. */
  prompt: string;
}

function sameAction(a: Action, b: Action): boolean {
  return a.type === 'move'
    ? b.type === 'move' && a.moveIndex === b.moveIndex
    : b.type === 'swap' && a.toIndex === b.toIndex;
}

/** "Next: {move}" for the telegraphed enemy move, the stunned label, or null. */
export function intentText(state: BattleState, content: Content): string | null {
  if (state.winner !== null) return null;
  const enemy = state.teams.enemy[state.active.enemy];
  if (!enemy) return null;
  if (state.intent !== null) {
    const id = lookup(content).species(enemy.speciesId).moves[state.intent.moveIndex];
    return id === undefined ? null : t('intent.next', { move: moveName(lookup(content).move(id)) });
  }
  if (!enemy.fainted && enemy.status?.id === 'stun') return t('intent.stunned');
  return null;
}

/**
 * Pure menu model. Every move of the active creature is listed (so the player can see what a move
 * would cost), but only the legal ones are enabled: the enabled entries are exactly `legalActions`.
 */
export function buildMenu(state: BattleState, content: Content): MenuModel {
  const legal = legalActions(state, content);
  const isLegal = (a: Action) => legal.some((l) => sameAction(l, a));
  const active = state.teams.player[state.active.player];
  const entries: MenuEntry[] = [];

  if (state.winner === null && active && !active.fainted) {
    lookup(content).species(active.speciesId).moves.forEach((id, moveIndex) => {
      const m = lookup(content).move(id);
      const action: Action = { type: 'move', moveIndex };
      entries.push({
        action,
        label: moveName(m),
        disabled: !isLegal(action),
        detail: `${t(`element.${m.element}`)} · ${t('menu.focusCost', { cost: m.focusCost })}`,
      });
    });
  }
  for (const action of legal) {
    if (action.type !== 'swap') continue;
    const c = state.teams.player[action.toIndex]!;
    entries.push({
      action,
      label: t('menu.swapTo', { species: speciesName(lookup(content).species(c.speciesId)) }),
      disabled: false,
      detail: `${t('hud.hp')} ${c.hp}/${c.maxHp}`,
    });
  }

  const mustSwap = state.winner === null && active !== undefined && active.fainted;
  let prompt = '';
  if (state.winner === null && active) {
    prompt = mustSwap
      ? t('menu.chooseNext')
      : t('menu.prompt', { species: speciesName(lookup(content).species(active.speciesId)) });
  }
  return { entries, intent: intentText(state, content), mustSwap, prompt };
}

/**
 * Localised log lines for the events produced from `prev`. Tracks swaps as it goes so a `swap` line
 * (and every later line) names the creature that just entered.
 */
export function logLines(prev: BattleState, events: BattleEvent[], content: Content): string[] {
  const active: Record<Side, number> = { ...prev.active };
  const species = (side: Side) => {
    const c = prev.teams[side][active[side]];
    return c ? speciesName(lookup(content).species(c.speciesId)) : '?';
  };
  const move = (id: string) => moveName(lookup(content).move(id));
  const out: string[] = [];
  for (const e of events) {
    if (e.type === 'swap') active[e.side] = e.toIndex;
    const line = eventLine(e, { species, move });
    if (line !== null) out.push(line);
  }
  return out;
}
