import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../src/content';
import { maxHpOf, startRun } from '../../../src/sim/run/run';
import { runScore } from '../../../src/sim/run/score';
import type { RunState } from '../../../src/sim/run/types';

function run(patch: Partial<RunState>): RunState {
  return { ...startRun('score', 'cindermite', CONTENT), ...patch };
}

describe('runScore', () => {
  it('scores a won run: 3 zones, bosses, elites, nodes, souls and party hp', () => {
    expect(maxHpOf('cindermite', CONTENT)).toBe(192);
    const tide = maxHpOf('tidewisp', CONTENT);
    expect(tide % 2).toBe(0);
    const won = run({
      zone: 2,
      party: [
        { speciesId: 'cindermite', hp: 192 },
        { speciesId: 'tidewisp', hp: tide / 2 },
      ],
      souls: 4,
      stats: { nodesCleared: 15, elitesBeaten: 2, bossesBeaten: 3, creaturesLost: 0 },
      phase: { kind: 'ended', result: 'won' },
    });
    expect(runScore(won, CONTENT)).toBe(3000 + 750 + 200 + 300 + 40 + 150);
    expect(runScore(won, CONTENT)).toBe(4440);
  });

  it('scores a run lost in zone 1 as one cleared zone and no party', () => {
    const lost = run({
      zone: 1,
      party: [],
      souls: 5,
      stats: { nodesCleared: 9, elitesBeaten: 1, bossesBeaten: 1, creaturesLost: 3 },
      phase: { kind: 'ended', result: 'lost' },
    });
    expect(runScore(lost, CONTENT)).toBe(1000 + 250 + 100 + 180 + 50);
    expect(runScore(lost, CONTENT)).toBe(1580);
  });

  it('scores a run lost in zone 2 as two cleared zones, not three', () => {
    const lost = run({
      zone: 2,
      party: [],
      souls: 0,
      stats: { nodesCleared: 14, elitesBeaten: 0, bossesBeaten: 2, creaturesLost: 1 },
      phase: { kind: 'ended', result: 'lost' },
    });
    expect(runScore(lost, CONTENT)).toBe(2000 + 500 + 280);
  });

  it('scores a fresh run as 0 cleared zones plus the starter at 100%', () => {
    expect(runScore(startRun('fresh', 'cindermite', CONTENT), CONTENT)).toBe(100);
  });

  it('floors each member hp percentage with integer maths', () => {
    // floor(100 * 1 / 192) = 0; floor(100 * 191 / 192) = 99; floor(100 * 97 / 192) = 50
    const mid = run({
      party: [
        { speciesId: 'cindermite', hp: 1 },
        { speciesId: 'cindermite', hp: 191 },
        { speciesId: 'cindermite', hp: 97 },
      ],
      phase: { kind: 'map' },
    });
    expect(runScore(mid, CONTENT)).toBe(0 + 99 + 50);
  });

  it('counts the current zone mid-run in any phase but the won ending', () => {
    for (const phase of [{ kind: 'map' }, { kind: 'recruit', speciesId: 'tidewisp', hp: 10 }] as RunState['phase'][]) {
      const r = run({ zone: 1, party: [], phase, stats: { nodesCleared: 0, elitesBeaten: 0, bossesBeaten: 0, creaturesLost: 0 } });
      expect(runScore(r, CONTENT)).toBe(1000);
    }
  });

  it('is always an integer', () => {
    for (let hp = 1; hp <= 192; hp++) {
      const r = run({ party: [{ speciesId: 'cindermite', hp }], souls: hp });
      expect(Number.isInteger(runScore(r, CONTENT))).toBe(true);
    }
  });
});
