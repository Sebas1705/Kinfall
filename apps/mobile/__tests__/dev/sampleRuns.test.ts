import { describe, expect, it } from '@jest/globals';
import { CONTENT } from '@webgames/core/content';
import { legalRunActions } from '@webgames/core/sim/run/run';
import { validateRun } from '@webgames/core/sim/run/codec';

import { SAMPLE_KINDS, sampleRun } from '../../src/dev/sampleRuns';

describe('sample runs (dev and test aid)', () => {
  it.each(SAMPLE_KINDS)('%s passes the full save validation', (kind) => {
    expect(validateRun(JSON.parse(JSON.stringify(sampleRun(kind, CONTENT))), CONTENT)).toBeNull();
  });

  it('stands on the phase each sample names', () => {
    expect(sampleRun('recruit', CONTENT).phase.kind).toBe('recruit');
    expect(sampleRun('recruitFull', CONTENT).party).toHaveLength(3);
    expect(sampleRun('shrine', CONTENT).phase.kind).toBe('shrine');
    expect(sampleRun('cache', CONTENT).phase.kind).toBe('cache');
    expect(sampleRun('mystery', CONTENT).phase.kind).toBe('mystery');
    expect(sampleRun('won', CONTENT).phase).toEqual({ kind: 'ended', result: 'won' });
    expect(sampleRun('lost', CONTENT).phase).toEqual({ kind: 'ended', result: 'lost' });
  });

  it('can evolve at the rich shrine and not at the poor one', () => {
    expect(legalRunActions(sampleRun('shrine', CONTENT), CONTENT).some((a) => a.type === 'evolve')).toBe(true);
    expect(legalRunActions(sampleRun('shrinePoor', CONTENT), CONTENT).some((a) => a.type === 'evolve')).toBe(false);
  });

  it('is deterministic', () => {
    for (const kind of SAMPLE_KINDS) expect(sampleRun(kind, CONTENT)).toEqual(sampleRun(kind, CONTENT));
  });
});
