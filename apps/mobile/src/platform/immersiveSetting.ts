// Immersive mode (system bars hidden, a swipe from the edge shows them for a moment): on or off,
// default on, kept in AsyncStorage under `webgames.immersive` (the old key prefix stays, ADR 0002).
// Same pattern as textSizeSetting: a failed read or write never rejects.
import type { AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';
import { useSyncExternalStore } from 'react';

import { defaultAsyncStorage } from './asyncStorage';

export const IMMERSIVE_KEY = 'webgames.immersive';
export const IMMERSIVE_DEFAULT = true;

let value = IMMERSIVE_DEFAULT;
/** Bumped by every set(), so a load that was already in flight does not overwrite it. */
let version = 0;
let storage: AsyncStorageLike | null | undefined;
const listeners = new Set<(v: boolean) => void>();

function store(): AsyncStorageLike | null {
  if (storage === undefined) storage = defaultAsyncStorage();
  return storage;
}

function emit(): void {
  for (const l of [...listeners]) l(value);
}

export const immersiveSetting = {
  /** Whether immersive mode is on. */
  get(): boolean {
    return value;
  },
  /** Saves the choice; a non-boolean is ignored. A failed save keeps it for this session. */
  async set(v: boolean): Promise<void> {
    if (typeof v !== 'boolean') return;
    version++;
    if (v !== value) {
      value = v;
      emit();
    }
    try {
      await store()?.setItem(IMMERSIVE_KEY, v ? '1' : '0');
    } catch {
      /* kept for this session */
    }
  },
  subscribe(fn: (v: boolean) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** Reads the saved choice (never rejects). `custom` replaces AsyncStorage (tests). */
export async function loadImmersiveSetting(custom?: AsyncStorageLike | null): Promise<boolean> {
  if (custom !== undefined) storage = custom;
  const started = version;
  let loaded = IMMERSIVE_DEFAULT;
  try {
    const raw = await store()?.getItem(IMMERSIVE_KEY);
    if (raw === '1') loaded = true;
    else if (raw === '0') loaded = false;
  } catch {
    /* default */
  }
  if (version === started && loaded !== value) {
    value = loaded;
    emit();
  }
  return value;
}

/** Live immersive choice. */
export function useImmersive(): boolean {
  return useSyncExternalStore(immersiveSetting.subscribe, immersiveSetting.get, immersiveSetting.get);
}

/** Test hook: back to the default and AsyncStorage. */
export function resetImmersiveSettingForTests(): void {
  value = IMMERSIVE_DEFAULT;
  storage = undefined;
  emit();
}
