// Fullscreen API wrapper and the HUD button that drives it. Where the API is missing (or the
// browser disables it, e.g. iPhone Safari) the button stays hidden and toggling is a no-op.
import { t } from '@kinfall/core/platform/i18n';
import type { StringKey } from '@kinfall/core/platform/i18n';

type FullscreenDoc = Document & { fullscreenEnabled?: boolean };

function supported(): boolean {
  return typeof document !== 'undefined' && (document as FullscreenDoc).fullscreenEnabled === true;
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement != null;
}

export async function toggleFullscreen(el?: HTMLElement): Promise<void> {
  if (!supported()) return;
  try {
    if (isFullscreen()) {
      await document.exitFullscreen?.();
    } else {
      await (el ?? document.documentElement).requestFullscreen?.();
    }
  } catch {
    // The browser refused (no user gesture, policy): the layout simply stays as it is.
  }
}

/** Shows the button only when the API works, toggles on click and keeps its label in sync. */
export function wireFullscreenButton(btn: HTMLButtonElement, el?: HTMLElement): void {
  if (!supported()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const sync = (): void => {
    const on = isFullscreen();
    const key: StringKey = on ? 'hud.exitFullscreen' : 'hud.fullscreen';
    btn.dataset.i18nLabel = key;
    btn.setAttribute('aria-label', t(key));
    btn.setAttribute('aria-pressed', String(on));
  };
  btn.addEventListener('click', () => void toggleFullscreen(el));
  document.addEventListener('fullscreenchange', sync);
  sync();
}
