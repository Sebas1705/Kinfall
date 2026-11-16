import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import { createAsyncRunStorage, type AsyncStorageLike } from '../../src/platform/asyncRunStorage';
import { createRng } from '../../src/sim/rng';
import { serializeRun } from '../../src/sim/run/codec';
import { applyRunAction, legalRunActions, startRun } from '../../src/sim/run/run';
import type { RunState } from '../../src/sim/run/types';

const KEY = 'webgames.run.v1';

function fakeStorage(): AsyncStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

function newRun(seed = 'storage'): RunState {
  return startRun(seed, CONTENT.starters[0]!, CONTENT);
}

function lateRun(): RunState {
  const pick = createRng('storage-late');
  let run = newRun('storage-late');
  for (let i = 0; i < 400 && run.phase.kind !== 'ended'; i++) {
    const actions = legalRunActions(run, CONTENT);
    run = applyRunAction(run, actions[pick.nextInt(actions.length)]!, CONTENT).run;
  }
  return run;
}

describe('createAsyncRunStorage', () => {
  it('round-trips a run', async () => {
    const s = createAsyncRunStorage(fakeStorage(), CONTENT);
    const run = newRun();
    expect(await s.save(run)).toEqual({ ok: true });
    expect(await s.load()).toEqual({ kind: 'ok', run });
  });

  it('loads none when nothing is saved', async () => {
    expect(await createAsyncRunStorage(fakeStorage(), CONTENT).load()).toEqual({ kind: 'none' });
  });

  it('reports garbage as corrupt and keeps the data', async () => {
    const st = fakeStorage();
    st.data.set(KEY, '{nope');
    const r = await createAsyncRunStorage(st, CONTENT).load();
    expect(r.kind).toBe('corrupt');
    expect(r.kind === 'corrupt' && r.error.length > 0).toBe(true);
    expect(st.data.get(KEY)).toBe('{nope');
  });

  it('reports tampered text as corrupt and keeps the data', async () => {
    const st = fakeStorage();
    const text = serializeRun(newRun());
    const tampered = text.replace('"zone":0', '"zone":1');
    expect(tampered).not.toBe(text);
    st.data.set(KEY, tampered);
    expect((await createAsyncRunStorage(st, CONTENT).load()).kind).toBe('corrupt');
    expect(st.data.get(KEY)).toBe(tampered);
  });

  it('clear removes the save', async () => {
    const st = fakeStorage();
    const s = createAsyncRunStorage(st, CONTENT);
    await s.save(newRun());
    await s.clear();
    expect(st.data.has(KEY)).toBe(false);
    expect(await s.load()).toEqual({ kind: 'none' });
  });

  it('keeps the previous save when setItem rejects (quota)', async () => {
    const st = fakeStorage();
    const s = createAsyncRunStorage(st, CONTENT);
    const first = newRun('first');
    await s.save(first);
    const before = st.data.get(KEY);
    st.setItem = () => Promise.reject(new Error('QuotaExceededError'));
    const r = await s.save(newRun('second'));
    expect(r).toEqual({ ok: false, error: 'QuotaExceededError' });
    expect(st.data.get(KEY)).toBe(before);
    expect(await s.load()).toEqual({ kind: 'ok', run: first });
  });

  it('turns a synchronously throwing setItem into a failed save', async () => {
    const st = fakeStorage();
    st.setItem = () => {
      throw new Error('sync boom');
    };
    expect(await createAsyncRunStorage(st, CONTENT).save(newRun())).toEqual({ ok: false, error: 'sync boom' });
  });

  it('reports a rejected getItem as unavailable, not corrupt', async () => {
    const st = fakeStorage();
    st.getItem = () => Promise.reject(new Error('blocked'));
    expect(await createAsyncRunStorage(st, CONTENT).load()).toEqual({ kind: 'unavailable', error: 'blocked' });
  });

  it('reports a synchronously throwing getItem as unavailable', async () => {
    const st = fakeStorage();
    st.getItem = () => {
      throw new Error('sync blocked');
    };
    expect(await createAsyncRunStorage(st, CONTENT).load()).toEqual({ kind: 'unavailable', error: 'sync blocked' });
  });

  it('truncates very long error messages', async () => {
    const st = fakeStorage();
    st.getItem = () => Promise.reject(new Error('x'.repeat(1000)));
    const r = await createAsyncRunStorage(st, CONTENT).load();
    expect(r.kind === 'unavailable' && r.error.length <= 200).toBe(true);
    st.setItem = () => Promise.reject(new Error('y'.repeat(1000)));
    const w = await createAsyncRunStorage(st, CONTENT).save(newRun());
    expect(!w.ok && w.error.length <= 200).toBe(true);
  });

  it('handles null storage without throwing', async () => {
    const s = createAsyncRunStorage(null, CONTENT);
    expect((await s.save(newRun())).ok).toBe(false);
    expect((await s.load()).kind).toBe('unavailable');
    await expect(s.clear()).resolves.toBeUndefined();
  });

  it('clear swallows a rejecting or throwing removeItem', async () => {
    const st = fakeStorage();
    st.removeItem = () => Promise.reject(new Error('blocked'));
    await expect(createAsyncRunStorage(st, CONTENT).clear()).resolves.toBeUndefined();
    st.removeItem = () => {
      throw new Error('blocked');
    };
    await expect(createAsyncRunStorage(st, CONTENT).clear()).resolves.toBeUndefined();
  });

  it('saving twice overwrites with the latest run', async () => {
    const st = fakeStorage();
    const s = createAsyncRunStorage(st, CONTENT);
    await s.save(newRun('a'));
    const b = newRun('b');
    await s.save(b);
    await s.save(b);
    expect(st.data.size).toBe(1);
    expect(await s.load()).toEqual({ kind: 'ok', run: b });
  });

  it('keeps a late-run save under 200 KB', async () => {
    const run = lateRun();
    const s = createAsyncRunStorage(fakeStorage(), CONTENT);
    expect(serializeRun(run).length).toBeLessThanOrEqual(200_000);
    expect((await s.save(run)).ok).toBe(true);
    expect((await s.load()).kind).toBe('ok');
  });

  it('uses the same slot as the sync storage', async () => {
    const st = fakeStorage();
    await createAsyncRunStorage(st, CONTENT).save(newRun());
    expect([...st.data.keys()]).toEqual([KEY]);
  });
});
