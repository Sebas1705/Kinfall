import type { Content } from '../../content';
import { lookup } from '../../content/lookup';
import { clone } from '../clone';
import { restoreRng } from '../rng';
import { maxHpOf } from './party';
import type { RunAction, RunEvent, RunPhase, RunState, RunStep } from './types';

type Variant<T extends RunAction['type']> = Extract<RunAction, { type: T }>;

export const MAX_PARTY = 3;

/** A rejected step carries the input run unchanged. */
function reject(run: RunState): RunStep {
  return { run, events: [{ type: 'rejected', reason: 'illegal' }] };
}

function isIndex(v: unknown, length: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length;
}

/** Ends the current shrine, cache or mystery node: back to the map, node cleared. */
function clearNode(run: RunState): void {
  const phase = run.phase;
  if (phase.kind === 'shrine' || phase.kind === 'cache' || phase.kind === 'mystery') {
    run.at = phase.nodeId;
    run.stats.nodesCleared += 1;
  }
  run.phase = { kind: 'map' };
}

/**
 * Heals every living member by `percent` of its max HP (integer, multiplied
 * before dividing, capped at max). A `healed` event carries the HP actually
 * gained and is emitted only when that is above 0, so a member already at full
 * health produces no event.
 */
function healAll(run: RunState, content: Content, percent: number): RunEvent[] {
  const events: RunEvent[] = [];
  run.party.forEach((m, memberIndex) => {
    if (m.hp <= 0) return;
    const max = maxHpOf(m.speciesId, content);
    const amount = Math.min(max - m.hp, Math.floor((max * percent) / 100));
    if (amount <= 0) return;
    m.hp += amount;
    events.push({ type: 'healed', memberIndex, amount });
  });
  return events;
}

export function applyRecruit(run: RunState, action: Variant<'recruit'>, _content: Content): RunStep {
  const offer = run.phase;
  if (offer.kind !== 'recruit' || typeof action.take !== 'boolean') return reject(run);
  const next = clone(run);
  next.phase = { kind: 'map' };
  if (!action.take) return { run: next, events: [{ type: 'declined', speciesId: offer.speciesId }] };

  const member = { speciesId: offer.speciesId, hp: offer.hp };
  if (next.party.length < MAX_PARTY) {
    next.party.push(member);
    return { run: next, events: [{ type: 'recruited', speciesId: offer.speciesId }] };
  }
  if (!isIndex(action.replaceIndex, next.party.length)) return reject(run);
  const replaced = next.party[action.replaceIndex]!.speciesId;
  next.party[action.replaceIndex] = member;
  return { run: next, events: [{ type: 'recruited', speciesId: offer.speciesId, replaced }] };
}

export function applyShrine(run: RunState, action: Variant<'shrine'>, content: Content): RunStep {
  if (run.phase.kind !== 'shrine') return reject(run);
  if (action.choice !== 'rest' && action.choice !== 'leave') return reject(run);
  const next = clone(run);
  const events = action.choice === 'rest' ? healAll(next, content, 50) : [];
  clearNode(next);
  return { run: next, events };
}

/** Evolution target and soul cost of a species, or undefined when it cannot evolve. */
export function evolutionOf(speciesId: string, content: Content): { to: string; cost: number } | undefined {
  const def = lookup(content).species(speciesId);
  if (def.evolvesTo === undefined || def.evolveCost === undefined) return undefined;
  return { to: def.evolvesTo, cost: def.evolveCost };
}

export function applyEvolve(run: RunState, action: Variant<'evolve'>, content: Content): RunStep {
  if (run.phase.kind !== 'shrine' || !isIndex(action.memberIndex, run.party.length)) return reject(run);
  const evo = evolutionOf(run.party[action.memberIndex]!.speciesId, content);
  if (!evo || run.souls < evo.cost) return reject(run);
  const next = clone(run);
  const member = next.party[action.memberIndex]!;
  const from = member.speciesId;
  const oldMax = maxHpOf(from, content);
  const newMax = maxHpOf(evo.to, content);
  next.souls -= evo.cost;
  member.speciesId = evo.to;
  member.hp = Math.min(newMax, member.hp + (newMax - oldMax));
  clearNode(next);
  return { run: next, events: [{ type: 'evolved', from, to: evo.to }] };
}

export function applyCache(run: RunState, _action: Variant<'cache'>, content: Content): RunStep {
  if (run.phase.kind !== 'cache') return reject(run);
  const next = clone(run);
  next.souls += 2;
  const events: RunEvent[] = [{ type: 'soul', amount: 2, reason: 'cache' }, ...healAll(next, content, 25)];
  clearNode(next);
  return { run: next, events };
}

/** The first living member loses 20% of max HP (at least 1) but never drops below 1 HP. */
function hurtFirst(run: RunState, content: Content): RunEvent[] {
  const index = run.party.findIndex((m) => m.hp > 0);
  if (index < 0) return [];
  const m = run.party[index]!;
  const want = Math.max(1, Math.floor(maxHpOf(m.speciesId, content) / 5));
  const amount = Math.min(want, m.hp - 1);
  // A member at 1 HP loses nothing, so no `hurt` event is emitted.
  if (amount <= 0) return [];
  m.hp -= amount;
  return [{ type: 'hurt', memberIndex: index, amount }];
}

export function applyMystery(run: RunState, action: Variant<'mystery'>, content: Content): RunStep {
  if (run.phase.kind !== 'mystery') return reject(run);
  if (action.choice !== 'open' && action.choice !== 'leave') return reject(run);
  const next = clone(run);
  const events: RunEvent[] = [];
  if (action.choice === 'open') {
    // The only action that advances `run.rng`.
    const rng = restoreRng(next.rng);
    const roll = rng.nextInt(2);
    next.rng = rng.getState();
    if (roll === 0) {
      next.souls += 3;
      events.push({ type: 'soul', amount: 3, reason: 'mystery' });
    } else {
      events.push(...hurtFirst(next, content));
    }
  }
  clearNode(next);
  return { run: next, events };
}

/** Legal run actions of the recruit, shrine, cache and mystery phases. */
export function legalEventActions(run: RunState, content: Content): RunAction[] {
  const phase: RunPhase = run.phase;
  if (phase.kind === 'recruit') {
    const out: RunAction[] = [{ type: 'recruit', take: false }];
    if (run.party.length < MAX_PARTY) out.push({ type: 'recruit', take: true });
    else run.party.forEach((_, i) => out.push({ type: 'recruit', take: true, replaceIndex: i }));
    return out;
  }
  if (phase.kind === 'shrine') {
    const out: RunAction[] = [
      { type: 'shrine', choice: 'rest' },
      { type: 'shrine', choice: 'leave' },
    ];
    run.party.forEach((m, i) => {
      const evo = evolutionOf(m.speciesId, content);
      if (evo && run.souls >= evo.cost) out.push({ type: 'evolve', memberIndex: i });
    });
    return out;
  }
  if (phase.kind === 'cache') return [{ type: 'cache' }];
  if (phase.kind === 'mystery') {
    return [
      { type: 'mystery', choice: 'open' },
      { type: 'mystery', choice: 'leave' },
    ];
  }
  return [];
}
