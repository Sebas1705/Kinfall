// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSheet } from '../../src/view/sheet';

let app: HTMLElement;
let opener: HTMLButtonElement;
let open: { close(): void } | null;

function content(): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = '<button type="button" id="first">First</button><button type="button" id="last">Last</button>';
  return div;
}

function key(target: Element, k: string, shiftKey = false): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  document.body.innerHTML = `<div class="app" id="app" data-orientation="portrait">
    <main id="screens"><p data-announcer aria-live="polite"></p><button id="opener" type="button">Open</button></main>
  </div>`;
  app = document.getElementById('app')!;
  opener = document.getElementById('opener') as HTMLButtonElement;
  open = null;
});
afterEach(() => {
  open?.close();
  document.body.innerHTML = '';
});

describe('openSheet', () => {
  it('opens as a dialog and inerts the screens', () => {
    open = openSheet({ title: 'Team', content: content(), opener });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)!.textContent).toBe('Team');
    expect(document.getElementById('screens')!.hasAttribute('inert')).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialog.dataset.orientation).toBe('portrait');
    // The live region stays outside the inert subtree.
    const live = document.querySelector('[data-announcer]')!;
    expect(live.closest('[inert]')).toBeNull();
    open.close();
    expect(document.getElementById('screens')!.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('uses the drawer form in landscape', () => {
    app.dataset.orientation = 'landscape';
    open = openSheet({ title: 'Team', content: content(), opener });
    expect(document.querySelector<HTMLElement>('[role="dialog"]')!.dataset.orientation).toBe('landscape');
  });

  it('has a Close button of at least 44 px that closes it', () => {
    let closed = 0;
    open = openSheet({ title: 'Team', content: content(), opener, onClose: () => closed++ });
    const btn = document.querySelector<HTMLButtonElement>('[data-sheet-close]')!;
    expect(btn.textContent).toBe('Close');
    btn.click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(closed).toBe(1);
    open.close();
    expect(closed).toBe(1);
  });

  it('Escape closes and returns focus to the opener', () => {
    opener.focus();
    open = openSheet({ title: 'Team', content: content(), opener });
    key(document.querySelector('[role="dialog"]')!, 'Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Tab wraps inside the sheet', () => {
    open = openSheet({ title: 'Team', content: content(), opener });
    const close = document.querySelector<HTMLButtonElement>('[data-sheet-close]')!;
    const first = document.getElementById('first')!;
    const last = document.getElementById('last')!;
    // Close is last in tab order: Tab from it reaches the first focusable.
    close.focus();
    expect(key(close, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    // Shift+Tab from the first focusable reaches Close.
    expect(key(first, 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    last.focus();
    expect(key(last, 'Tab').defaultPrevented).toBe(false);
  });

  it('a second open closes the first', () => {
    let firstClosed = 0;
    openSheet({ title: 'One', content: content(), opener, onClose: () => firstClosed++ });
    open = openSheet({ title: 'Two', content: content(), opener });
    expect(firstClosed).toBe(1);
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Two');
    expect(document.getElementById('screens')!.hasAttribute('inert')).toBe(true);
  });
});
