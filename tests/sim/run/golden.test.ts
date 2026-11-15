import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../src/content';
import { replayRun, runTags } from '../../../src/sim/run/bot';
import { hashRun } from '../../../src/sim/run/codec';
import { runScore } from '../../../src/sim/run/score';
import type { RunAction } from '../../../src/sim/run/types';

interface RunGolden {
  seed: string;
  starterId: string;
  actions: RunAction[];
  finalHash: string;
  result: 'won' | 'lost';
  score: number;
  tags: string[];
}

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'golden', 'run.golden.json');
const entries = JSON.parse(readFileSync(FILE, 'utf8')) as RunGolden[];

describe('golden runs', () => {
  it('has at least 4 distinct entries, each with actions and recorded tags', () => {
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(new Set(entries.map((e) => e.finalHash)).size).toBe(entries.length);
    for (const e of entries) {
      expect(e.actions.length, `${e.seed}/${e.starterId}`).toBeGreaterThan(0);
      expect(e.tags.length).toBeGreaterThan(0);
      expect(e.tags).toContain(`result:${e.result}`);
    }
  });

  for (const e of entries) {
    it(`replays ${e.seed}/${e.starterId} to the recorded hash, result, score and tags`, () => {
      const r = replayRun(e.seed, e.starterId, e.actions, CONTENT);
      expect(r.rejected).toBe(0);
      expect(hashRun(r.run)).toBe(e.finalHash);
      expect(r.run.phase.kind).toBe('ended');
      expect(r.run.phase.kind === 'ended' ? r.run.phase.result : null).toBe(e.result);
      expect(runScore(r.run, CONTENT)).toBe(e.score);
      expect(runTags(r.run, e.actions)).toEqual(e.tags);
    });
  }
});
