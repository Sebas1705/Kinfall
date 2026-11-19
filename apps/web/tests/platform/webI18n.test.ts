// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureI18n, getLang, LANG_STORAGE_KEY, setLang, t } from '@kinfall/core/platform/i18n';
import { STRINGS } from '@kinfall/core/platform/strings';
import { browserLangStorage, detectBrowserLang, installWebI18n } from '../../src/platform/webI18n';

afterEach(() => {
  vi.restoreAllMocks();
  configureI18n({});
  localStorage.clear();
  document.documentElement.lang = '';
});

describe('detectBrowserLang', () => {
  it('detects es and falls back to en', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
    expect(detectBrowserLang()).toBe('es');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ES');
    expect(detectBrowserLang()).toBe('es');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr');
    expect(detectBrowserLang()).toBe('en');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('');
    expect(detectBrowserLang()).toBe('en');
  });
});

describe('browserLangStorage', () => {
  it('reads and writes localStorage under the given key', () => {
    browserLangStorage.set(LANG_STORAGE_KEY, 'es');
    expect(localStorage.getItem('webgames.lang')).toBe('es');
    expect(browserLangStorage.get(LANG_STORAGE_KEY)).toBe('es');
  });
});

describe('installWebI18n', () => {
  it('starts in the browser language, saves it and sets html lang', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
    installWebI18n();
    expect(getLang()).toBe('es');
    expect(t('menu.fight')).toBe(STRINGS.es['menu.fight']);
    expect(localStorage.getItem('webgames.lang')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('prefers the saved choice', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
    localStorage.setItem('webgames.lang', 'en');
    installWebI18n();
    expect(getLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores an invalid saved value', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
    localStorage.setItem('webgames.lang', 'fr');
    installWebI18n();
    expect(getLang()).toBe('es');
    expect(localStorage.getItem('webgames.lang')).toBe('es');
  });

  it('setLang persists, sets html lang, and survives storage throwing', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
    installWebI18n();
    setLang('es');
    expect(getLang()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem('webgames.lang')).toBe('es');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => setLang('en')).not.toThrow();
    expect(getLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('starts even when storage is blocked', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => installWebI18n()).not.toThrow();
    expect(getLang()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });
});
