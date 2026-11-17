// The current language as React state, so every screen (navigation keeps them mounted) re-renders
// when core's shared i18n instance switches language. App.tsx feeds it from installMobileI18n's onChange.
import type { Lang } from '@webgames/core/platform/i18n';
import { getLang } from '@webgames/core/platform/i18n';
import { createContext, useContext } from 'react';

export const LangContext = createContext<Lang | null>(null);

/** The current language; re-renders the caller when it changes. */
export function useLang(): Lang {
  return useContext(LangContext) ?? getLang();
}
