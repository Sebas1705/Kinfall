import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import { battleTurn, splitBattleStep } from '../../src/models/battleTurn';
import { applyAction, legalActions } from '../../src/sim/battle';
import { applyRunAction, availableNodes, startRun } from '../../src/sim/run/run';
import type { RunState } from '../../src/sim/run/types';
import type { BattleState } from '../../src/sim/state';

/** A run standing on its first wild battle. */
function inBattle(): RunState {
  let run = startRun('TURNSEED', CONTENT.starters[0]!, CONTENT);
  const wild = availableNodes(run).find((n) => n.type === 'wild')!;
  run = applyRunAction(run, { type: 'node', nodeId: wild.id }, CONTENT).run;
  expect(run.phase.kind).toBe('battle');
  return run;
}

const battleOf = (run: RunState): BattleState => {
  if (run.phase.kind !== 'battle') throw new Error('not in battle');
  return run.phase.battle;
};

describe('battleTurn', () => {
  it('refuses without a battle in progress', () => {
    const run = startRun('TURNSEED', CONTENT.starters[0]!, CONTENT);
    const prev = battleOf(inBattle());
    expect(battleTurn(run, prev, { type: 'move', moveIndex: 0 }, CONTENT)).toEqual({ ok: false, reason: 'no battle in progress' });
    expect(battleTurn(null, prev, { type: 'move', moveIndex: 0 }, CONTENT).ok).toBe(false);
  });

  it('passes the run rejection reason through', () => {
    const run = inBattle();
    const turn = battleTurn(run, battleOf(run), { type: 'swap', toIndex: 9 }, CONTENT);
    expect(turn.ok).toBe(false);
  });

  it('splits battle and run events, and recomputes the final battle state once the run moved on', () => {
    let run = inBattle();
    let turns = 0;
    for (;;) {
      const prev = battleOf(run);
      const action = legalActions(prev, CONTENT)[0]!;
      const step = applyRunAction(run, { type: 'battle', action }, CONTENT);
      const turn = splitBattleStep(step, prev, action, CONTENT);
      expect(battleTurn(run, prev, action, CONTENT)).toEqual(turn);
      const engine = applyAction(prev, action, CONTENT);
      expect(turn.battleEvents).toEqual(engine.events);
      expect(turn.battle).toEqual(engine.state);
      expect(turn.runEvents.every((e) => e.type !== 'battle')).toBe(true);
      run = turn.run;
      turns++;
      if (run.phase.kind !== 'battle') {
        expect(turn.battle.winner).not.toBeNull();
        break;
      }
      expect(turn.runEvents).toEqual([]);
      expect(turns).toBeLessThan(200);
    }
  });
});
