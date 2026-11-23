// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '@kinfall/core/platform/i18n';
import { wireScreenSheet } from '../../src/view/screenSheets';

function build() {
  document.body.innerHTML = `
    <div class="app" id="app" data-orientation="landscape" data-mode="console">
      <header><button id="hud-run" type="button" hidden></button></header>
      <main id="screens">
        <section data-screen="title" id="screen-title"><div class="screen-primary"><h2 data-screen-heading tabindex="-1">Start</h2></div>
          <div class="sheet-store" data-sheet-title="New run options" data-sheet-button="Options"><input id="seed" /></div></section>
        <section data-screen="map" id="screen-map" hidden><div class="screen-primary"><h2>Map</h2></div>
          <div class="sheet-store" data-sheet-title="Run details" data-sheet-button="Run"><p id="party">party</p><div id="abandon-slot"><button id="abandon" type="button" data-action="abandon">Abandon</button></div></div></section>
        <section data-screen="battle" id="screen-battle" hidden></section>
        <section class="run-log-panel" id="run-log-panel"><h2 id="run-log-title">Run log</h2><div id="run-log" role="log" tabindex="0"><p>line</p></div></section>
      </main>
    </div>`;
  const app = document.getElementById('app')!;
  const screens = document.getElementById('screens')!;
  const button = document.getElementById('hud-run') as HTMLButtonElement;
  const log = document.getElementById('run-log-panel')!;
  const handle = wireScreenSheet({ button, screens, app, log });
  const show = (id: string) => {
    for (const s of screens.querySelectorAll<HTMLElement>('[data-screen]')) s.hidden = s.dataset.screen !== id;
  };
  return { app, screens, button, log, show, handle };
}

beforeEach(() => setLang('en'));
afterEach(() => {
  document.querySelectorAll('.sheet-backdrop').forEach((n) => n.remove());
  setLang('en');
});

describe('wireScreenSheet', () => {
  it('labels the button after the visible screen and hides it where there is nothing to open', () => {
    const { button, show, handle } = build();
    handle.sync();
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe('Options');
    show('map');
    handle.sync();
    expect(button.textContent).toBe('Run');
    show('battle');
    handle.sync();
    expect(button.hidden).toBe(true);
    handle.dispose();
  });

  it('hides the button in the fallback layout (the sheet content is inline there)', () => {
    const { app, button, handle } = build();
    app.dataset.mode = 'fallback';
    handle.sync();
    expect(button.hidden).toBe(true);
    handle.dispose();
  });

  it('follows the screen without a manual sync (observer on hidden)', async () => {
    const { button, show, handle } = build();
    show('map');
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(button.textContent).toBe('Run');
    handle.dispose();
  });

  it('opens a sheet with the store (and the run log on run screens) and puts both back on close', () => {
    const { button, show, handle, log, screens } = build();
    show('map');
    handle.sync();
    button.click();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('.sheet__title')!.textContent).toBe('Run details');
    expect(dialog.querySelector('#party')).not.toBeNull();
    expect(dialog.contains(log)).toBe(true);
    expect(dialog.querySelector('#run-log')!.getAttribute('tabindex')).toBe('0');
    dialog.querySelector<HTMLButtonElement>('[data-sheet-close]')!.click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.getElementById('screen-map')!.contains(document.getElementById('party'))).toBe(true);
    expect(log.parentElement).toBe(screens);
    expect(document.activeElement).toBe(button);
    handle.dispose();
  });

  it('the title sheet does not take the run log', () => {
    const { button, handle, log } = build();
    handle.sync();
    button.click();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('.sheet__title')!.textContent).toBe('New run options');
    expect(dialog.querySelector('#seed')).not.toBeNull();
    expect(dialog.contains(log)).toBe(false);
    handle.dispose();
  });

  it('an empty (hidden) run log stays home', () => {
    const { button, show, handle, log } = build();
    log.hidden = true;
    show('map');
    handle.sync();
    button.click();
    expect(document.querySelector('[role="dialog"]')!.contains(log)).toBe(false);
    handle.dispose();
  });

  it('closing the sheet drops a pending Abandon confirmation', () => {
    const { button, show, handle } = build();
    show('map');
    handle.sync();
    button.click();
    const slot = document.getElementById('abandon-slot')!;
    const abandon = document.getElementById('abandon')!;
    const confirm = document.createElement('div');
    confirm.className = 'confirm';
    const no = document.createElement('button');
    no.dataset.action = 'abandon-no';
    no.addEventListener('click', () => confirm.replaceWith(abandon));
    confirm.append(no);
    abandon.replaceWith(confirm);
    document.querySelector<HTMLButtonElement>('[data-sheet-close]')!.click();
    expect(slot.querySelector('.confirm')).toBeNull();
    expect(slot.querySelector('#abandon')).not.toBeNull();
    handle.dispose();
  });

  it('keeps the run log out of the tab order while it is not in a sheet in the console layout', () => {
    const { handle } = build();
    handle.sync();
    expect(document.getElementById('run-log')!.getAttribute('tabindex')).toBe('-1');
    handle.dispose();
  });

  it('keeps the run log focusable (it scrolls) in the fallback layout', () => {
    const { app, handle } = build();
    app.dataset.mode = 'fallback';
    handle.sync();
    expect(document.getElementById('run-log')!.getAttribute('tabindex')).toBe('0');
    handle.dispose();
  });

  it('closes when the screen behind it changes and the new screen heading takes the focus', async () => {
    const { button, show, handle } = build();
    show('map');
    handle.sync();
    button.click();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    show('title');
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('#screen-title h2'));
    expect(button.textContent).toBe('Options');
    handle.dispose();
  });
});
