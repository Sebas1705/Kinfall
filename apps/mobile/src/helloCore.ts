import { CONTENT } from '@kinfall/core/content';
import { simulateRun } from '@kinfall/core/sim/run/bot';
import { hashRun } from '@kinfall/core/sim/run/codec';
import type { RunState } from '@kinfall/core/sim/run/types';
import { runScore } from '@kinfall/core/sim/run/score';

export const DEFAULT_SEED = 'golden-0';

export interface HelloResult {
  seed: string;
  starterId: string;
  hash: string;
  result: 'won' | 'lost' | 'running';
  score: number;
  steps: number;
}

/** Plays a whole run with the core bot (first starter) and summarises it: the cross-platform check. */
export function runHello(seed: string): HelloResult {
  return runHelloWithState(seed).summary;
}

/** Same as `runHello`, also returning the final run state (what the save button stores). */
export function runHelloWithState(seed: string): { summary: HelloResult; run: RunState } {
  const starterId = CONTENT.starters[0];
  if (!starterId) throw new Error('content has no starters');
  const { run, actions } = simulateRun(seed, starterId, CONTENT);
  const summary: HelloResult = {
    seed,
    starterId,
    hash: hashRun(run),
    result: run.phase.kind === 'ended' ? run.phase.result : 'running',
    score: runScore(run, CONTENT),
    steps: actions.length,
  };
  return { summary, run };
}
