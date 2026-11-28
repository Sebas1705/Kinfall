import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_GAME_KEY } from '@kinfall/core/games/registry';

import { readLastGame, writeLastGame } from '../../src/platform/lastGame';
import type { AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';

const failing: AsyncStorageLike = {
  getItem: () => Promise.reject(new Error('read failed')),
  setItem: () => Promise.reject(new Error('write failed')),
  removeItem: () => Promise.reject(new Error('remove failed')),
};

describe('last game storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('reads nothing before anything was written', async () => {
    expect(await readLastGame()).toBeUndefined();
  });

  it('round trips the id under kinfall.lastGame (default AsyncStorage)', async () => {
    await writeLastGame('kinfall');
    expect(await AsyncStorage.getItem(LAST_GAME_KEY)).toBe('kinfall');
    expect(await readLastGame()).toBe('kinfall');
  });

  it('hands back whatever text is stored, unvalidated (the hub validates it)', async () => {
    await AsyncStorage.setItem(LAST_GAME_KEY, 'garbage');
    expect(await readLastGame()).toBe('garbage');
  });

  it('reads undefined and writes silently when the storage rejects', async () => {
    expect(await readLastGame(failing)).toBeUndefined();
    await expect(writeLastGame('kinfall', failing)).resolves.toBeUndefined();
  });

  it('reads undefined and writes silently without a storage', async () => {
    expect(await readLastGame(null)).toBeUndefined();
    await expect(writeLastGame('kinfall', null)).resolves.toBeUndefined();
  });

  it('works over an injected storage', async () => {
    const data = new Map<string, string>();
    const mem: AsyncStorageLike = {
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    };
    await writeLastGame('kinfall', mem);
    expect(data.get(LAST_GAME_KEY)).toBe('kinfall');
    expect(await readLastGame(mem)).toBe('kinfall');
  });
});
