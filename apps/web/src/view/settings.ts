// Page settings shared by the run page and the battle demo page: text size and static labels.
import { t } from '@kinfall/core/platform/i18n';
import type { StringKey } from '@kinfall/core/platform/i18n';
import { openSheet } from './sheet';

// Keeps the old working name `webgames` on purpose, so the saved setting survives (ADR 0002).
const TEXT_SIZE_KEY = 'webgames.textSize';
const TEXT_SIZES = { min: 80, max: 150, step: 10 };

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function readTextSize(): number {
  try {
    const v = Number(localStorage.getItem(TEXT_SIZE_KEY));
    if (Number.isInteger(v) && v >= TEXT_SIZES.min && v <= TEXT_SIZES.max && v % TEXT_SIZES.step === 0) return v;
  } catch {
    // storage unavailable: use the default
  }
  return 100;
}

function storeTextSize(v: number): void {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, String(v));
  } catch {
    // storage unavailable or full: the setting just won't persist
  }
}

/** Applies the stored text size and keeps it in sync with the #text-size slider. */
export function wireTextSize(onChange: () => void): void {
  const textSize = byId<HTMLInputElement>('text-size');
  const textSizeValue = byId<HTMLOutputElement>('text-size-value');
  const apply = (v: number) => {
    document.documentElement.style.fontSize = `${v}%`;
    textSize.value = String(v);
    textSizeValue.value = `${v}%`;
    textSizeValue.textContent = `${v}%`;
  };
  apply(readTextSize());
  textSize.addEventListener('input', () => {
    const v = Number(textSize.value);
    apply(v);
    storeTextSize(v);
    onChange();
  });
}

/** Static `data-i18n` texts and `data-i18n-label` accessible names. */
export function applyI18nAttributes(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as StringKey);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel as StringKey));
  }
}

/**
 * The settings controls live once in the page (`#settings-panel`, kept in a hidden store so their
 * ids and wiring never change). The HUD button lends them to a sheet while it is open and puts
 * them back on close.
 */
export function wireSettingsButton(btn: HTMLButtonElement): void {
  const panel = byId<HTMLElement>('settings-panel');
  const home = panel.parentElement!;
  btn.addEventListener('click', () => {
    openSheet({ title: t('settings.title'), content: panel, opener: btn, onClose: () => home.append(panel) });
  });
}

/** After a language change: the open sheet's own title and close button follow the new language. */
export function refreshSheetTexts(): void {
  const title = document.querySelector('.sheet__title');
  if (title) title.textContent = t('settings.title');
  const close = document.querySelector('[data-sheet-close]');
  if (close) close.textContent = t('sheet.close');
}
