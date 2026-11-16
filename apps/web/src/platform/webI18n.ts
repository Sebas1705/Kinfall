// Binds core i18n to the browser: the choice lives in localStorage, the default follows
// navigator.language and <html lang> tracks the current language.
import { configureI18n, type I18n, type Lang, type LangStorage } from '@webgames/core/platform/i18n';

/** localStorage as a language store; core swallows the errors a blocked storage throws. */
export const browserLangStorage: LangStorage = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
};

/** Spanish when the browser language starts with "es", English otherwise. */
export function detectBrowserLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function setHtmlLang(lang: Lang): void {
  try {
    document.documentElement.lang = lang;
  } catch {
    // no document (workers)
  }
}

/**
 * Configures the shared i18n instance for the browser. Call once at startup, before any text is
 * rendered. Like before the split, the start language is saved and written to <html lang>.
 */
export function installWebI18n(): I18n {
  const i18n = configureI18n({ storage: browserLangStorage, detect: detectBrowserLang, onChange: setHtmlLang });
  const lang = i18n.getLang();
  i18n.setLang(lang);
  setHtmlLang(lang);
  return i18n;
}
