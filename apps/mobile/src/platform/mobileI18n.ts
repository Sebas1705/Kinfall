// Binds core i18n to the device. Core's language storage is synchronous and AsyncStorage is not,
// so the saved choice is read once up front and kept in memory (writes go through to AsyncStorage).
import type { AsyncStorageLike } from '@webgames/core/platform/asyncRunStorage';
import {
  LANG_STORAGE_KEY,
  configureI18n,
  isLang,
  type I18n,
  type Lang,
} from '@webgames/core/platform/i18n';
import { getLocales } from 'expo-localization';

import { defaultAsyncStorage } from './asyncStorage';

/** Spanish when the first device language is Spanish, English otherwise (also if it cannot be read). */
export function detectDeviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    return typeof code === 'string' && code.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export interface MobileI18nOptions {
  /** Defaults to AsyncStorage; null means "no persistence". */
  storage?: AsyncStorageLike | null;
  detect?: () => Lang;
  /** Called after `setLang` changes the language, so the app can re-render. */
  onChange?: (lang: Lang) => void;
}

/**
 * Reads the saved language, then configures the shared i18n instance. Resolves only once the
 * start language is final, so the app can wait for it and never flash the wrong language.
 * Never rejects: an unreadable or invalid saved value falls back to the device language.
 */
export async function installMobileI18n(options: MobileI18nOptions = {}): Promise<I18n> {
  const storage = options.storage === undefined ? defaultAsyncStorage() : options.storage;
  let saved: string | null = null;
  try {
    const value = storage ? await storage.getItem(LANG_STORAGE_KEY) : null;
    if (isLang(value)) saved = value;
  } catch {
    // unreadable storage: use the device language
  }
  return configureI18n({
    storage: {
      get: (key) => (key === LANG_STORAGE_KEY ? saved : null),
      set: (key, value) => {
        if (key !== LANG_STORAGE_KEY) return;
        saved = value;
        try {
          storage?.setItem(key, value).catch(() => {});
        } catch {
          // a throwing storage only loses persistence
        }
      },
    },
    detect: options.detect ?? detectDeviceLang,
    onChange: options.onChange,
  });
}
