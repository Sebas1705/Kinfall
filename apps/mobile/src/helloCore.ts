import { CONTENT } from '@webgames/core/content';
import { simulateRun } from '@webgames/core/sim/run/bot';
import { hashRun } from '@webgames/core/sim/run/codec';
import { runScore } from '@webgames/core/sim/run/score';

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
  const starterId = CONTENT.starters[0];
  if (!starterId) throw new Error('content has no starters');
  const { run, actions } = simulateRun(seed, starterId, CONTENT);
  return {
    seed,
    starterId,
    hash: hashRun(run),
    result: run.phase.kind === 'ended' ? run.phase.result : 'running',
    score: runScore(run, CONTENT),
    steps: actions.length,
  };
}
