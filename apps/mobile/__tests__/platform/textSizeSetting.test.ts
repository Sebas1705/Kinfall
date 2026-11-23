import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  TEXT_SIZE_KEY,
  loadTextSizeSetting,
  resetTextSizeSettingForTests,
  textSizeSetting,
} from '../../src/platform/textSizeSetting';
import { memoryStorage } from '../../test-support/runFixtures';

beforeEach(() => resetTextSizeSettingForTests());
afterEach(() => resetTextSizeSettingForTests());

describe('textSizeSetting', () => {
  it('defaults to 100', () => {
    expect(textSizeSetting.get()).toBe(100);
  });

  it('rejects values outside 80..150 or off the step and keeps the previous', async () => {
    const storage = memoryStorage();
    await loadTextSizeSetting(storage);
    await textSizeSetting.set(120);
    for (const bad of [70, 160, 125, NaN, 100.5, Infinity]) await textSizeSetting.set(bad);
    expect(textSizeSetting.get()).toBe(120);
    expect(storage.data.get(TEXT_SIZE_KEY)).toBe('120');
    await textSizeSetting.set(80);
    await textSizeSetting.set(150);
    expect(textSizeSetting.get()).toBe(150);
  });

  it('persists and notifies subscribers', async () => {
    const storage = memoryStorage();
    await loadTextSizeSetting(storage);
    const seen: number[] = [];
    const off = textSizeSetting.subscribe((v) => seen.push(v));
    await textSizeSetting.set(130);
    expect(seen).toEqual([130]);
    expect(storage.data.get(TEXT_SIZE_KEY)).toBe('130');
    off();
    await textSizeSetting.set(90);
    expect(seen).toEqual([130]);
    resetTextSizeSettingForTests();
    expect(await loadTextSizeSetting(storage)).toBe(90);
  });

  it('does not clobber a size set while the load is in flight, and emits only on change', async () => {
    const storage = memoryStorage({ [TEXT_SIZE_KEY]: '140' });
    const seen: number[] = [];
    textSizeSetting.subscribe((v) => seen.push(v));
    const loading = loadTextSizeSetting(storage);
    await textSizeSetting.set(90);
    expect(await loading).toBe(90);
    expect(textSizeSetting.get()).toBe(90);
    expect(seen).toEqual([90]);
    await loadTextSizeSetting(memoryStorage({ [TEXT_SIZE_KEY]: '90' }));
    expect(seen).toEqual([90]);
  });

  it('ignores an invalid saved value and a failing storage', async () => {
    expect(await loadTextSizeSetting(memoryStorage({ [TEXT_SIZE_KEY]: '999' }))).toBe(100);
    const broken = {
      getItem: jest.fn(() => Promise.reject(new Error('x'))),
      setItem: jest.fn(() => Promise.reject(new Error('x'))),
      removeItem: jest.fn(() => Promise.resolve()),
    };
    expect(await loadTextSizeSetting(broken as never)).toBe(100);
    await textSizeSetting.set(110);
    expect(textSizeSetting.get()).toBe(110);
  });
});
