// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLang, setLang } from '@kinfall/core/platform/i18n';
import { refreshSheetTexts, wireSettingsButton } from '../../src/view/settings';

beforeEach(() => {
  document.body.innerHTML = `<div class="app" id="app" data-orientation="portrait">
    <header class="hud"><button type="button" id="hud-settings">Settings</button></header>
    <p data-announcer aria-live="polite"></p>
    <main id="screens"></main>
    <div id="settings-store" hidden>
      <section class="settings" id="settings-panel">
        <select id="lang"><option value="en">English</option></select>
        <input type="checkbox" id="reduce-motion" />
        <input type="range" id="text-size" /><output id="text-size-value"></output>
      </section>
    </div>
  </div>`;
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('wireSettingsButton', () => {
  it('opens a sheet that holds #lang, #reduce-motion and #text-size, and gives them back on close', () => {
    const btn = document.getElementById('hud-settings') as HTMLButtonElement;
    wireSettingsButton(btn);
    btn.click();
    const sheet = document.querySelector('.sheet')!;
    expect(sheet.querySelector('#lang')).not.toBeNull();
    expect(sheet.querySelector('#reduce-motion')).not.toBeNull();
    expect(sheet.querySelector('#text-size')).not.toBeNull();
    (document.querySelector('[data-sheet-close]') as HTMLButtonElement).click();
    expect(document.querySelector('.sheet')).toBeNull();
    expect(document.getElementById('settings-store')!.contains(document.getElementById('lang'))).toBe(true);
    expect(document.activeElement).toBe(btn);
  });

  it('refreshSheetTexts retitles an open sheet after a language change', () => {
    const btn = document.getElementById('hud-settings') as HTMLButtonElement;
    wireSettingsButton(btn);
    const before = getLang();
    btn.click();
    setLang('es');
    refreshSheetTexts();
    expect(document.querySelector('.sheet__title')!.textContent).toBe('Ajustes');
    expect(document.querySelector('[data-sheet-close]')!.textContent).toBe('Cerrar');
    setLang(before);
  });

  it('can be reopened: the panel returns home and is lent again', () => {
    const btn = document.getElementById('hud-settings') as HTMLButtonElement;
    const store = document.getElementById('settings-store')!;
    wireSettingsButton(btn);
    btn.click();
    (document.querySelector('[data-sheet-close]') as HTMLButtonElement).click();
    expect(store.contains(document.getElementById('lang'))).toBe(true);
    btn.click();
    expect(document.querySelector('.sheet #lang')).not.toBeNull();
    (document.querySelector('[data-sheet-close]') as HTMLButtonElement).click();
    expect(store.contains(document.getElementById('lang'))).toBe(true);
    expect(document.querySelectorAll('.sheet')).toHaveLength(0);
  });
});
