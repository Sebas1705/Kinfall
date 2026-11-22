// Modal sheet: a bottom sheet in portrait and a side drawer in landscape (`data-orientation` of
// `.app`). While it is open the rest of the app (every direct child of `.app`, except the live region) is `inert`, Escape closes it, focus moves into it and
// returns to the opener, and Tab wraps inside it.
import { t } from '@kinfall/core/platform/i18n';

export interface SheetOptions {
  title: string;
  content: HTMLElement;
  /** The control that opened the sheet; it gets the focus back on close. */
  opener: HTMLElement;
  onClose?: () => void;
}

export interface SheetHandle {
  close(): void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let nextId = 0;
let active: SheetHandle | null = null;

export function openSheet(opts: SheetOptions): SheetHandle {
  active?.close();

  const doc = opts.opener.ownerDocument;
  const app = doc.querySelector<HTMLElement>('.app') ?? doc.body;
  const screens = doc.getElementById('screens');
  const orientation = app.dataset.orientation === 'landscape' ? 'landscape' : 'portrait';
  const titleId = `sheet-title-${++nextId}`;

  const backdrop = doc.createElement('div');
  backdrop.className = 'sheet-backdrop';

  const dialog = doc.createElement('div');
  dialog.className = 'sheet';
  dialog.dataset.orientation = orientation;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.tabIndex = -1;

  const title = doc.createElement('h2');
  title.className = 'sheet__title';
  title.id = titleId;
  title.textContent = opts.title;

  const body = doc.createElement('div');
  body.className = 'sheet__body';
  body.append(opts.content);

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sheet__close secondary';
  closeBtn.dataset.sheetClose = '';
  closeBtn.textContent = t('sheet.close');

  dialog.append(title, body, closeBtn);
  backdrop.append(dialog);

  let closed = false;
  // Only the elements this sheet made inert; the router's own inert marks must survive a close.
  const inerted: HTMLElement[] = [];
  const handle: SheetHandle = {
    close() {
      if (closed) return;
      closed = true;
      if (active === handle) active = null;
      doc.removeEventListener('keydown', onKeydown, true);
      backdrop.remove();
      for (const el of inerted) el.removeAttribute('inert');
      if (opts.opener.isConnected && !opts.opener.closest('[hidden]')) {
        opts.opener.focus();
      } else if (screens) {
        if (!screens.hasAttribute('tabindex')) screens.tabIndex = -1;
        screens.focus();
      }
      opts.onClose?.();
    },
  };

  const onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      handle.close();
      return;
    }
    if (ev.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      ev.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const current = doc.activeElement;
    if (!current || !dialog.contains(current)) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
    } else if (ev.shiftKey && (current === first || current === dialog)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && current === last) {
      ev.preventDefault();
      first.focus();
    }
  };
  doc.addEventListener('keydown', onKeydown, true);
  // A tap on the dim area outside the sheet closes it too.
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) handle.close();
  });
  closeBtn.addEventListener('click', () => handle.close());

  for (const child of [...app.children] as HTMLElement[]) {
    if (child.hasAttribute('data-announcer') || child.hasAttribute('inert')) continue;
    child.setAttribute('inert', '');
    inerted.push(child);
  }
  app.append(backdrop);
  active = handle;
  const firstInside = body.querySelector<HTMLElement>(FOCUSABLE);
  (firstInside ?? closeBtn).focus();
  return handle;
}
