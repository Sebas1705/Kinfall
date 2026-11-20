// Reduced motion = the system setting (AccessibilityInfo: iOS Reduce Motion, Android "Remove
// animations") OR the app's own "Reduce motion" switch on the title screen. The app switch is kept
// in AsyncStorage (`webgames.reduceMotion`, "1" or "0") and read once at start; until it is read it
// counts as off. Everything that moves (battle turns, scene art, screen transitions) reads
// `useReducedMotion()`.
import type { AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';
import { useSyncExternalStore } from 'react';

import { useA11ySettings } from './a11ySettings';
import { defaultAsyncStorage } from './asyncStorage';

export const REDUCE_MOTION_KEY = 'webgames.reduceMotion';

let appSetting = false;
let storage: AsyncStorageLike | null | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function store(): AsyncStorageLike | null {
  if (storage === undefined) storage = defaultAsyncStorage();
  return storage;
}

/** Reads the saved app setting (never rejects). `custom` replaces AsyncStorage (tests). */
export async function loadMotionSetting(custom?: AsyncStorageLike | null): Promise<boolean> {
  if (custom !== undefined) storage = custom;
  try {
    const value = await store()?.getItem(REDUCE_MOTION_KEY);
    appSetting = value === '1';
  } catch {
    appSetting = false;
  }
  emit();
  return appSetting;
}

/** The app's own switch (not the system setting). */
export function appReduceMotion(): boolean {
  return appSetting;
}

/** Turns the app switch on or off and saves it (a failed save keeps the choice for this session). */
export function setAppReduceMotion(on: boolean): void {
  if (appSetting === on) return;
  appSetting = on;
  emit();
  void Promise.resolve(store()?.setItem(REDUCE_MOTION_KEY, on ? '1' : '0')).catch(() => {});
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The app switch, live. */
export function useAppReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, appReduceMotion, appReduceMotion);
}

/** True when the system or the app asks for reduced motion. */
export function useReducedMotion(): boolean {
  const { reduceMotion } = useA11ySettings();
  const app = useAppReduceMotion();
  return reduceMotion || app;
}

/** Test hook: back to the defaults (off, AsyncStorage). */
export function resetMotionSettingForTests(): void {
  appSetting = false;
  storage = undefined;
  emit();
}
