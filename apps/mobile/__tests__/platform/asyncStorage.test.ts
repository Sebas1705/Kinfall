import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultAsyncStorage } from '../../src/platform/asyncStorage';

describe('defaultAsyncStorage', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('reads, writes and removes through the official AsyncStorage mock', async () => {
    const storage = defaultAsyncStorage();
    expect(storage).not.toBeNull();
    expect(await storage!.getItem('k')).toBeNull();
    await storage!.setItem('k', 'v');
    expect(await AsyncStorage.getItem('k')).toBe('v');
    expect(await storage!.getItem('k')).toBe('v');
    await storage!.removeItem('k');
    expect(await storage!.getItem('k')).toBeNull();
  });

  it('propagates storage rejections so core can classify them', async () => {
    const storage = defaultAsyncStorage()!;
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('native down'));
    await expect(storage.getItem('k')).rejects.toThrow('native down');
  });
});
