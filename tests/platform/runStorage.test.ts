import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import { createRunStorage, defaultStorage, type StorageLike } from '../../src/platform/runStorage';
import { createRng } from '../../src/sim/rng';
import { serializeRun } from '../../src/sim/run/codec';
import { applyRunAction, legalRunActions, startRun } from '../../src/sim/run/run';
import type { RunState } from '../../src/sim/run/types';

const KEY = 'webgames.run.v1';

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function newRun(seed = 'storage'): RunState {
  return startRun(seed, CONTENT.starters[0]!, CONTENT);
}

/** A long seeded random walk: as late into a run as it gets without cheating. */
function lateRun(): RunState {
  const pick = createRng('storage-late');
  let run = newRun('storage-late');
  for (let i = 0; i < 400 && run.phase.kind !== 'ended'; i++) {
    const actions = legalRunActions(run, CONTENT);
    run = applyRunAction(run, actions[pick.nextInt(actions.length)]!, CONTENT).run;
  }
  return run;
}

describe('createRunStorage', () => {
  it('round-trips a run', () => {
    const s = createRunStorage(fakeStorage(), CONTENT);
    const run = newRun();
    expect(s.save(run)).toEqual({ ok: true });
    expect(s.load()).toEqual({ kind: 'ok', run });
  });

  it('loads none when nothing is saved', () => {
    expect(createRunStorage(fakeStorage(), CONTENT).load()).toEqual({ kind: 'none' });
  });

  it('reports garbage as corrupt and keeps the data', () => {
    const st = fakeStorage();
    st.setItem(KEY, '{nope');
    const r = createRunStorage(st, CONTENT).load();
    expect(r.kind).toBe('corrupt');
    expect(r.kind === 'corrupt' && r.error.length > 0).toBe(true);
    expect(st.getItem(KEY)).toBe('{nope');
  });

  it('reports tampered text as corrupt and keeps the data', () => {
    const st = fakeStorage();
    const text = serializeRun(newRun());
    const tampered = text.replace('"zone":0', '"zone":1');
    expect(tampered).not.toBe(text);
    st.setItem(KEY, tampered);
    expect(createRunStorage(st, CONTENT).load().kind).toBe('corrupt');
    expect(st.getItem(KEY)).toBe(tampered);
  });

  it('clear removes the save', () => {
    const st = fakeStorage();
    const s = createRunStorage(st, CONTENT);
    s.save(newRun());
    s.clear();
    expect(st.getItem(KEY)).toBeNull();
    expect(s.load()).toEqual({ kind: 'none' });
  });

  it('keeps the previous save when setItem hits the quota', () => {
    const st = fakeStorage();
    const s = createRunStorage(st, CONTENT);
    const first = newRun('first');
    s.save(first);
    const before = st.getItem(KEY);
    st.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const r = s.save(newRun('second'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.length > 0).toBe(true);
    expect(st.getItem(KEY)).toBe(before);
    expect(s.load()).toEqual({ kind: 'ok', run: first });
  });

  it('reports a throwing getItem as unavailable, not corrupt', () => {
    const st = fakeStorage();
    st.getItem = () => {
      throw new Error('blocked');
    };
    expect(createRunStorage(st, CONTENT).load()).toEqual({ kind: 'unavailable', error: 'blocked' });
  });

  it('truncates very long error messages', () => {
    const st = fakeStorage();
    st.getItem = () => {
      throw new Error('x'.repeat(1000));
    };
    const r = createRunStorage(st, CONTENT).load();
    expect(r.kind === 'unavailable' && r.error.length <= 200).toBe(true);
  });

  it('handles null storage without throwing', () => {
    const s = createRunStorage(null, CONTENT);
    expect(s.save(newRun()).ok).toBe(false);
    expect(s.load().kind).toBe('unavailable');
    expect(() => s.clear()).not.toThrow();
  });

  it('clear swallows a throwing removeItem', () => {
    const st = fakeStorage();
    st.removeItem = () => {
      throw new Error('blocked');
    };
    expect(() => createRunStorage(st, CONTENT).clear()).not.toThrow();
  });

  it('saving twice overwrites with the latest run', () => {
    const st = fakeStorage();
    const s = createRunStorage(st, CONTENT);
    s.save(newRun('a'));
    const b = newRun('b');
    s.save(b);
    s.save(b);
    expect(st.data.size).toBe(1);
    expect(s.load()).toEqual({ kind: 'ok', run: b });
  });

  it('keeps a late-run save under 200 KB', () => {
    const run = lateRun();
    const s = createRunStorage(fakeStorage(), CONTENT);
    expect(serializeRun(run).length).toBeLessThanOrEqual(200_000);
    expect(s.save(run).ok).toBe(true);
    expect(s.load().kind).toBe('ok');
  });
});

describe('defaultStorage', () => {
  it('is null where localStorage does not exist (node)', () => {
    expect(defaultStorage()).toBeNull();
  });
});
