import type { Content } from '../../content';
import { battleOutcome } from '../battle';
import type { BattleState } from '../state';
import { findNode } from './map';
import { maxHpOf } from './party';
import type { PartyMember, RunEvent, RunState } from './types';

const LAST_ZONE = 2;

/**
 * Turns a finished battle (`battle.winner !== null`) at `nodeId` into run
 * progress: survivors keep their exact hp in order (focus and status are not
 * stored), every fallen member is lost for the run and leaves 1 soul, and the
 * node type decides the reward. Pure: the inputs are cloned, never mutated.
 * Returns only the resolution events; the caller puts the battle events first.
 */
export function resolveBattle(
  run: RunState,
  nodeId: string,
  battle: BattleState,
  content: Content,
): { run: RunState; events: RunEvent[] } {
  const next = structuredClone(run);
  const outcome = battleOutcome(battle);
  const defeat = outcome.winner === 'enemy';
  const events: RunEvent[] = [];
  const soul = (amount: number, reason: 'fallen' | 'elite' | 'boss'): void => {
    next.souls += amount;
    events.push({ type: 'soul', amount, reason });
  };

  const survivors: PartyMember[] = [];
  for (const m of outcome.members) {
    const speciesId = battle.teams.player[m.index]!.speciesId;
    if (defeat || m.fainted) {
      events.push({ type: 'lost', speciesId });
      soul(1, 'fallen');
      next.stats.creaturesLost += 1;
    } else {
      survivors.push({ speciesId, hp: m.hp });
    }
  }
  next.party = survivors;

  if (defeat || survivors.length === 0) {
    next.phase = { kind: 'ended', result: 'lost' };
    events.push({ type: 'ended', result: 'lost' });
    return { run: next, events };
  }

  next.stats.nodesCleared += 1;
  next.at = nodeId;
  const type = findNode(next.maps[next.zone], nodeId)?.type;

  if (type === 'wild') {
    // A wild battle has a single enemy: that species is offered at half its player-side max hp.
    const speciesId = battle.teams.enemy[0]!.speciesId;
    next.phase = { kind: 'recruit', speciesId, hp: Math.max(1, Math.floor(maxHpOf(speciesId, content) / 2)) };
  } else if (type === 'elite') {
    soul(1, 'elite');
    next.stats.elitesBeaten += 1;
    next.phase = { kind: 'map' };
  } else if (type === 'boss') {
    soul(2, 'boss');
    next.stats.bossesBeaten += 1;
    events.push({ type: 'zoneCleared', zone: next.zone });
    if (next.zone >= LAST_ZONE) {
      next.phase = { kind: 'ended', result: 'won' };
      events.push({ type: 'ended', result: 'won' });
    } else {
      next.zone += 1;
      next.at = null;
      next.phase = { kind: 'map' };
    }
  } else {
    // Only battle nodes start battles; anything else falls back to the map.
    next.phase = { kind: 'map' };
  }
  return { run: next, events };
}
