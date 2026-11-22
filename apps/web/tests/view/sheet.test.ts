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
    <header id="chrome"><button id="chrome-btn" type="button">Settings</button></header>
    <p data-announcer aria-live="polite"></p>
    <main id="screens"><section id="old" data-screen="map" inert hidden></section><button id="opener" type="button">Open</button></main>
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
    expect(document.getElementById('chrome')!.hasAttribute('inert')).toBe(true);
    open.close();
    expect(document.getElementById('screens')!.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('chrome')!.hasAttribute('inert')).toBe(false);
    // The router's own marks survive.
    expect(document.getElementById('old')!.hasAttribute('inert')).toBe(true);
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

  it('Escape on body closes the sheet', () => {
    open = openSheet({ title: 'Team', content: content(), opener });
    (document.activeElement as HTMLElement).blur();
    key(document.body, 'Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Tab with focus on body moves focus into the sheet', () => {
    open = openSheet({ title: 'Team', content: content(), opener });
    (document.activeElement as HTMLElement).blur();
    expect(key(document.body, 'Tab').defaultPrevented).toBe(true);
    expect(document.querySelector('[role="dialog"]')!.contains(document.activeElement)).toBe(true);
  });

  it('a Close-only sheet keeps Tab and Shift+Tab on Close', () => {
    open = openSheet({ title: 'Team', content: document.createElement('div'), opener });
    const close = document.querySelector<HTMLButtonElement>('[data-sheet-close]')!;
    expect(document.activeElement).toBe(close);
    key(close, 'Tab');
    expect(document.activeElement).toBe(close);
    key(close, 'Tab', true);
    expect(document.activeElement).toBe(close);
  });

  it('falls back to #screens when the opener is gone', () => {
    open = openSheet({ title: 'Team', content: content(), opener });
    opener.remove();
    open.close();
    expect(document.activeElement).toBe(document.getElementById('screens'));
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

describe('openSheet: scrolling body', () => {
  it('a body that fits adds no tab stop', () => {
    open = openSheet({ title: 'Team', content: content(), opener });
    const body = document.querySelector<HTMLElement>('.sheet__body')!;
    expect(body.hasAttribute('tabindex')).toBe(false);
    expect(body.hasAttribute('role')).toBe(false);
  });

  it('a body that scrolls is a named, focusable region (updated on resize)', () => {
    const proto = HTMLElement.prototype;
    const sh = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    const ch = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 500 });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 200 });
    try {
      open = openSheet({ title: 'Team', content: content(), opener });
      const body = document.querySelector<HTMLElement>('.sheet__body')!;
      expect(body.tabIndex).toBe(0);
      expect(body.getAttribute('role')).toBe('region');
      const titleId = document.querySelector('.sheet__title')!.id;
      expect(body.getAttribute('aria-labelledby')).toBe(titleId);
      Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 100 });
      window.dispatchEvent(new Event('resize'));
      expect(body.hasAttribute('tabindex')).toBe(false);
    } finally {
      if (sh) Object.defineProperty(proto, 'scrollHeight', sh);
      else delete (proto as unknown as Record<string, unknown>).scrollHeight;
      if (ch) Object.defineProperty(proto, 'clientHeight', ch);
      else delete (proto as unknown as Record<string, unknown>).clientHeight;
    }
  });
});
