import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AsyncStorageLike } from '@kinfall/core/platform/asyncRunStorage';
import { getLang, setLang, t } from '@kinfall/core/platform/i18n';
import * as Localization from 'expo-localization';

import { detectDeviceLang, installMobileI18n } from '../../src/platform/mobileI18n';

function fakeStorage(initial: Record<string, string> = {}): AsyncStorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const KEY = 'webgames.lang';

function mockLocale(code: string | null | undefined) {
  jest.spyOn(Localization, 'getLocales').mockReturnValue([{ languageCode: code }] as never);
}

describe('detectDeviceLang', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps Spanish locales to es and everything else to en', () => {
    mockLocale('es');
    expect(detectDeviceLang()).toBe('es');
    mockLocale('ES');
    expect(detectDeviceLang()).toBe('es');
    mockLocale('fr');
    expect(detectDeviceLang()).toBe('en');
    mockLocale(null);
    expect(detectDeviceLang()).toBe('en');
  });

  it('falls back to en when the locale cannot be read', () => {
    jest.spyOn(Localization, 'getLocales').mockImplementation(() => {
      throw new Error('no module');
    });
    expect(detectDeviceLang()).toBe('en');
    jest.spyOn(Localization, 'getLocales').mockReturnValue([] as never);
    expect(detectDeviceLang()).toBe('en');
  });
});

describe('installMobileI18n', () => {
  beforeEach(() => mockLocale('en'));
  afterEach(async () => {
    jest.restoreAllMocks();
    await installMobileI18n({ storage: null, detect: () => 'en' });
  });

  it('prefers the stored language over the device language', async () => {
    mockLocale('es');
    await installMobileI18n({ storage: fakeStorage({ [KEY]: 'en' }) });
    expect(getLang()).toBe('en');
  });

  it('uses the device language when nothing is stored', async () => {
    mockLocale('es');
    await installMobileI18n({ storage: fakeStorage() });
    expect(getLang()).toBe('es');
    expect(t('settings.language')).toBe('Idioma');
    mockLocale('de');
    await installMobileI18n({ storage: fakeStorage() });
    expect(getLang()).toBe('en');
  });

  it('ignores an invalid stored value', async () => {
    mockLocale('es');
    await installMobileI18n({ storage: fakeStorage({ [KEY]: 'fr' }) });
    expect(getLang()).toBe('es');
  });

  it('writes through to storage on setLang and notifies onChange once per change', async () => {
    const storage = fakeStorage();
    const onChange = jest.fn();
    await installMobileI18n({ storage, onChange });
    setLang('es');
    setLang('es');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('es');
    await Promise.resolve();
    expect(storage.data.get(KEY)).toBe('es');
    // A second install (an app restart) reads the saved choice back.
    mockLocale('en');
    await installMobileI18n({ storage });
    expect(getLang()).toBe('es');
  });

  it('swallows a rejecting or throwing storage', async () => {
    const rejecting: AsyncStorageLike = {
      getItem: () => Promise.reject(new Error('read')),
      setItem: () => Promise.reject(new Error('write')),
      removeItem: async () => {},
    };
    mockLocale('es');
    await installMobileI18n({ storage: rejecting });
    expect(getLang()).toBe('es');
    expect(() => setLang('en')).not.toThrow();
    await Promise.resolve();
    expect(getLang()).toBe('en');

    const throwing: AsyncStorageLike = {
      getItem: () => {
        throw new Error('sync read');
      },
      setItem: () => {
        throw new Error('sync write');
      },
      removeItem: async () => {},
    };
    await installMobileI18n({ storage: throwing });
    expect(getLang()).toBe('es');
    expect(() => setLang('en')).not.toThrow();
  });

  it('works without any storage', async () => {
    mockLocale('es');
    await installMobileI18n({ storage: null });
    expect(getLang()).toBe('es');
    expect(() => setLang('en')).not.toThrow();
  });
});
