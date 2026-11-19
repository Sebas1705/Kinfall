import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';

/**
 * AsyncStorage as the core's `AsyncStorageLike`, or null when the native module is missing or
 * throws on first use (core then reports saves as unavailable instead of crashing).
 */
export function defaultAsyncStorage(): AsyncStorageLike | null {
  try {
    const storage = AsyncStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
    };
  } catch {
    return null;
  }
}
