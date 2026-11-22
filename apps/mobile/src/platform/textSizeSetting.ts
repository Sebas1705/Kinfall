// The app's own text size (percent: 80 to 150 in steps of 10, default 100), kept in AsyncStorage
// under `webgames.textSize` (the old key prefix stays, ADR 0002). It multiplies the system font
// scale (see effectiveTextScale in core, capped at 2.0), so the layout contract and the text agree.
import type { AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';
import { useSyncExternalStore } from 'react';

import { defaultAsyncStorage } from './asyncStorage';

export const TEXT_SIZE_KEY = 'webgames.textSize';
export const TEXT_SIZE_MIN = 80;
export const TEXT_SIZE_MAX = 150;
export const TEXT_SIZE_STEP = 10;
export const TEXT_SIZE_DEFAULT = 100;
/** Cap of system font scale times app text size; Text components use it as maxFontSizeMultiplier. */
export const MAX_FONT_SIZE_MULTIPLIER = 2;

let value = TEXT_SIZE_DEFAULT;
let storage: AsyncStorageLike | null | undefined;
const listeners = new Set<(v: number) => void>();

function store(): AsyncStorageLike | null {
  if (storage === undefined) storage = defaultAsyncStorage();
  return storage;
}

export function isValidTextSize(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= TEXT_SIZE_MIN &&
    v <= TEXT_SIZE_MAX &&
    (v - TEXT_SIZE_MIN) % TEXT_SIZE_STEP === 0
  );
}

function emit(): void {
  for (const l of [...listeners]) l(value);
}

export const textSizeSetting = {
  /** Current size in percent. */
  get(): number {
    return value;
  },
  /** Saves a new size; a value outside 80..150 or off the step is ignored. A failed save keeps it for this session. */
  async set(v: number): Promise<void> {
    if (!isValidTextSize(v)) return;
    if (v !== value) {
      value = v;
      emit();
    }
    try {
      await store()?.setItem(TEXT_SIZE_KEY, String(v));
    } catch {
      /* kept for this session */
    }
  },
  subscribe(fn: (v: number) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** Reads the saved size (never rejects). `custom` replaces AsyncStorage (tests). */
export async function loadTextSizeSetting(custom?: AsyncStorageLike | null): Promise<number> {
  if (custom !== undefined) storage = custom;
  try {
    const raw = await store()?.getItem(TEXT_SIZE_KEY);
    const n = raw == null ? NaN : Number(raw);
    value = isValidTextSize(n) ? n : TEXT_SIZE_DEFAULT;
  } catch {
    value = TEXT_SIZE_DEFAULT;
  }
  emit();
  return value;
}

/** Live app text size in percent. */
export function useTextSize(): number {
  return useSyncExternalStore(textSizeSetting.subscribe, textSizeSetting.get, textSizeSetting.get);
}

/** Test hook: back to the default size and AsyncStorage. */
export function resetTextSizeSettingForTests(): void {
  value = TEXT_SIZE_DEFAULT;
  storage = undefined;
  emit();
}
