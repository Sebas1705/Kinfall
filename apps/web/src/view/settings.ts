// Page settings shared by the run page and the battle demo page: text size and static labels.
import { t } from '../platform/i18n';
import type { StringKey } from '../platform/i18n';

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
