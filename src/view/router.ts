// Screen router: exactly one `[data-screen]` section is visible at a time. The others are
// `hidden` and `inert`, so neither the keyboard nor assistive technology can reach them.
import { t } from '../platform/i18n';

export type ScreenId = 'title' | 'map' | 'battle' | 'event' | 'end';

export interface ShowOptions {
  /** Move focus into the new screen (default true). False for the first paint of the page. */
  focus?: boolean;
}

export interface Router {
  show(id: ScreenId, focusSelector?: string, options?: ShowOptions): void;
  current(): ScreenId;
  /** Re-renders the document title and announcement after a language change. */
  refreshTitle(): void;
}

const HEADING = '[data-screen-heading], h1, h2';

function sections(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-screen]')];
}

/** Shows the section `id` and hides the rest, without announcing or moving focus. */
export function isolateScreen(root: HTMLElement, id: ScreenId): HTMLElement | null {
  let shown: HTMLElement | null = null;
  for (const section of sections(root)) {
    const on = section.dataset.screen === id;
    section.hidden = !on;
    if (on) {
      section.removeAttribute('inert');
      shown = section;
    } else {
      section.setAttribute('inert', '');
    }
  }
  return shown;
}

function announcer(root: HTMLElement): HTMLElement {
  const found = root.querySelector<HTMLElement>('[data-announcer]');
  if (found) return found;
  const live = root.ownerDocument.createElement('p');
  live.className = 'sr-only';
  live.dataset.announcer = '';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  root.prepend(live);
  return live;
}

export function createRouter(root: HTMLElement): Router {
  const live = announcer(root);
  let currentId: ScreenId = 'title';

  const announce = () => {
    const name = t(`screen.${currentId}`);
    root.ownerDocument.title = `${name} · ${t('app.title')}`;
    live.textContent = name;
  };

  return {
    show(id, focusSelector, options) {
      currentId = id;
      const section = isolateScreen(root, id);
      announce();
      if (!section || options?.focus === false) return;
      const target = section.querySelector<HTMLElement>(focusSelector ?? HEADING) ?? section;
      if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus();
    },
    current: () => currentId,
    refreshTitle: announce,
  };
}
