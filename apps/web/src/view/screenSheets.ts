// The HUD button of the run screens (title, map, event, end): it opens the details a screen keeps
// out of the console layout in a sheet. Each screen renders a `.sheet-store` (see screens/dom.ts)
// holding that content and naming the button and the sheet; this module lends the store of the
// visible screen to the sheet (and, on the run screens, the shared run log) and puts both back on
// close. The same nodes move, so ids, wiring and the run log's live region stay one thing.
//
// In the fallback layout everything stays inline (the stores are shown by CSS) and the button is
// hidden. In the console the run log is kept out of sight but in the accessibility tree, so its
// polite announcements still happen; it only takes keyboard focus where it is visible and scrolls.
import { openSheet } from './sheet';

export interface ScreenSheetOptions {
  button: HTMLButtonElement;
  /** The `<main>` holding the `[data-screen]` sections and the run log panel. */
  screens: HTMLElement;
  /** The element carrying `data-mode`. */
  app: HTMLElement;
  /** The run log panel (holds a `[role="log"]` region). */
  log: HTMLElement;
}

export interface ScreenSheetHandle {
  /** Re-reads the visible screen, the layout mode and the run log state. */
  sync(): void;
  dispose(): void;
}

export function wireScreenSheet(opts: ScreenSheetOptions): ScreenSheetHandle {
  const { button, screens, app, log } = opts;
  const logRegion = log.querySelector<HTMLElement>('[role="log"]');
  const logHome = log.parentElement;
  let open = false;
  /** Set while a sheet is open: closes it when the screen behind it changes (Abandon, a new screen). */
  let leave: (() => void) | null = null;

  const currentSection = () => screens.querySelector<HTMLElement>('[data-screen]:not([hidden])');
  const currentStore = () => currentSection()?.querySelector<HTMLElement>('.sheet-store') ?? null;

  const sync = () => {
    if (open) {
      leave?.();
      return;
    }
    const fallback = app.dataset.mode === 'fallback';
    const store = currentStore();
    button.hidden = !store || fallback;
    if (store) button.textContent = store.dataset.sheetButton ?? '';
    logRegion?.setAttribute('tabindex', fallback ? '0' : '-1');
  };

  const onClick = () => {
    const section = currentSection();
    const store = currentStore();
    if (!section || !store) return;
    const home = store.parentElement!;
    const lendLog = logRegion !== null && !log.hidden && section.dataset.screen !== 'title';
    open = true;
    if (lendLog) {
      store.append(log);
      logRegion!.setAttribute('tabindex', '0');
    }
    const handle = openSheet({
      title: store.dataset.sheetTitle ?? '',
      content: store,
      opener: button,
      onClose: () => {
        open = false;
        leave = null;
        // Detached here, so cancelling a pending confirmation cannot steal the focus.
        store.querySelector<HTMLButtonElement>('.confirm [data-action$="-no"], .confirm [data-action$="-cancel"]')?.click();
        if (lendLog) logHome?.append(log);
        if (home.isConnected && !home.querySelector(':scope > .sheet-store')) home.append(store);
        sync();
      },
    });
    leave = () => {
      if (currentSection() === section) return;
      // The run moved on while the sheet was open (Abandon, a new screen): close it and give the
      // focus to the new screen's heading, as a route change does.
      handle.close();
      currentSection()?.querySelector<HTMLElement>('[data-screen-heading]')?.focus();
    };
  };
  button.addEventListener('click', onClick);

  const observer = new MutationObserver(sync);
  observer.observe(screens, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  observer.observe(app, { attributes: true, attributeFilter: ['data-mode'] });
  sync();

  return {
    sync,
    dispose() {
      observer.disconnect();
      button.removeEventListener('click', onClick);
    },
  };
}
