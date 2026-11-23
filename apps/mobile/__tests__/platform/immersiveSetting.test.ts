import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  IMMERSIVE_KEY,
  immersiveSetting,
  loadImmersiveSetting,
  resetImmersiveSettingForTests,
} from '../../src/platform/immersiveSetting';
import { memoryStorage } from '../../test-support/runFixtures';

beforeEach(() => resetImmersiveSettingForTests());
afterEach(() => resetImmersiveSettingForTests());

const failing = {
  getItem: async () => {
    throw new Error('read');
  },
  setItem: async () => {
    throw new Error('write');
  },
  removeItem: async () => {},
};

describe('immersiveSetting', () => {
  it('defaults to on', () => {
    expect(immersiveSetting.get()).toBe(true);
  });

  it('persists, notifies subscribers and loads back', async () => {
    const storage = memoryStorage();
    await loadImmersiveSetting(storage);
    const seen: boolean[] = [];
    const off = immersiveSetting.subscribe((v) => seen.push(v));
    await immersiveSetting.set(false);
    expect(seen).toEqual([false]);
    expect(storage.data.get(IMMERSIVE_KEY)).toBe('0');
    off();
    await immersiveSetting.set(true);
    expect(seen).toEqual([false]);
    expect(storage.data.get(IMMERSIVE_KEY)).toBe('1');
    storage.data.set(IMMERSIVE_KEY, '0');
    resetImmersiveSettingForTests();
    expect(await loadImmersiveSetting(storage)).toBe(false);
  });

  it('ignores a non-boolean and a garbage stored value', async () => {
    const storage = memoryStorage();
    storage.data.set(IMMERSIVE_KEY, 'maybe');
    expect(await loadImmersiveSetting(storage)).toBe(true);
    await immersiveSetting.set('no' as unknown as boolean);
    expect(immersiveSetting.get()).toBe(true);
  });

  it('rejects nothing when the storage fails and keeps the choice for the session', async () => {
    await expect(loadImmersiveSetting(failing as never)).resolves.toBe(true);
    await expect(immersiveSetting.set(false)).resolves.toBeUndefined();
    expect(immersiveSetting.get()).toBe(false);
  });
});
