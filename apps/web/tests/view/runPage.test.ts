// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_GAME_KEY } from '@kinfall/core/games/registry';
import { setLang } from '@kinfall/core/platform/i18n';
import { startRunPage } from '../../src/view/runPage';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1]!.replace(/<script[\s\S]*?<\/script>/g, '');

const shown = () => [...document.querySelectorAll<HTMLElement>('[data-screen]')].filter((s) => !s.hidden).map((s) => s.dataset.screen);
const gamesBtn = () => document.getElementById('hud-games') as HTMLButtonElement;

beforeEach(() => {
  setLang('en');
  localStorage.clear();
  document.body.innerHTML = body;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  setLang('en');
});

describe('startRunPage', () => {
  it('opens the hub by default with Games hidden', () => {
    startRunPage('hub');
    expect(shown()).toEqual(['hub']);
    expect(gamesBtn().hidden).toBe(true);
    expect(document.querySelectorAll('.hub-card')).toHaveLength(3);
  });

  it('Play opens Kinfall title, remembers the game and shows Games', () => {
    startRunPage('hub');
    document.getElementById('hub-play')!.click();
    expect(shown()).toEqual(['title']);
    expect(localStorage.getItem(LAST_GAME_KEY)).toBe('kinfall');
    expect(gamesBtn().hidden).toBe(false);
  });

  it('Games returns to the hub', () => {
    startRunPage('hub');
    document.getElementById('hub-play')!.click();
    gamesBtn().click();
    expect(shown()).toEqual(['hub']);
    expect(gamesBtn().hidden).toBe(true);
  });

  it('entry kinfall starts on the title directly', () => {
    startRunPage('kinfall');
    expect(shown()).toEqual(['title']);
    expect(gamesBtn().hidden).toBe(false);
  });

  it('a soon game announces in the live region and stays on the hub', () => {
    startRunPage('hub');
    document.querySelector<HTMLElement>('.hub-card[data-game="simulator"]')!.click();
    expect(document.querySelector('[data-announcer]')!.textContent).toBe('Simulator is coming soon.');
    expect(shown()).toEqual(['hub']);
  });

  it('a language change re-renders the hub keeping the focused game', () => {
    startRunPage('hub');
    document.querySelector<HTMLElement>('.hub-card[data-game="survival"]')!.click();
    const lang = document.getElementById('lang') as HTMLSelectElement;
    lang.value = 'es';
    lang.dispatchEvent(new Event('change'));
    expect(document.querySelector('#screen-hub h2')!.textContent).toBe('Elige un juego');
    expect(document.querySelector('.hub-card[data-game="survival"]')!.getAttribute('aria-checked')).toBe('true');
    expect(gamesBtn().textContent).toBe('Juegos');
  });

  it('starts with the last game played focused', () => {
    localStorage.setItem(LAST_GAME_KEY, 'kinfall');
    startRunPage('hub');
    expect(document.querySelector('.hub-card[data-game="kinfall"]')!.getAttribute('aria-checked')).toBe('true');
  });
});
