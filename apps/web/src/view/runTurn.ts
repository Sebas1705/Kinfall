// One battle turn of a run, as the battle controller needs it: routed through applyRunAction so the
// run state machine stays the single source of truth, then split into what the battle screen plays
// (battle state and events) and what the run log shows once the final turn has settled.
import type { Content } from '../content';
import { applyAction } from '../sim/battle';
import { applyRunAction } from '../sim/run/run';
import type { RunEvent, RunState } from '../sim/run/types';
import type { Action, BattleEvent, BattleState } from '../sim/state';

export type BattleTurn =
  | { ok: false; reason: string }
  | { ok: true; run: RunState; battle: BattleState; battleEvents: BattleEvent[]; runEvents: RunEvent[] };

export function battleTurn(run: RunState | null, prev: BattleState, action: Action, content: Content): BattleTurn {
  if (!run || run.phase.kind !== 'battle') return { ok: false, reason: 'no battle in progress' };
  const step = applyRunAction(run, { type: 'battle', action }, content);
  const rejected = step.events.find((e): e is Extract<RunEvent, { type: 'rejected' }> => e.type === 'rejected');
  if (rejected) return { ok: false, reason: rejected.reason };

  const battleEvents: BattleEvent[] = [];
  const runEvents: RunEvent[] = [];
  for (const e of step.events) {
    if (e.type === 'battle') battleEvents.push(e.event);
    else runEvents.push(e);
  }
  // While the battle goes on the run holds its state; once it ends the run has moved on, so the
  // final battle state is recomputed from the same pure, deterministic engine call.
  const battle = step.run.phase.kind === 'battle' ? step.run.phase.battle : applyAction(prev, action, content).state;
  return { ok: true, run: step.run, battle, battleEvents, runEvents };
}
