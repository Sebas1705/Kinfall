// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '@webgames/core/platform/i18n';
import { createRouter, isolateScreen } from '../../src/view/router';

function setup(): HTMLElement {
  document.body.innerHTML = `
    <main id="screens">
      <p data-announcer aria-live="polite"></p>
      <section data-screen="title"><h2>Start</h2><button id="go">Go</button></section>
      <section data-screen="map"><h2>Map heading</h2><button id="node">Node</button></section>
      <section data-screen="battle"><div id="menu"><button id="move">Move</button></div></section>
      <section data-screen="event"><h2>Event</h2></section>
      <section data-screen="end"><h2>End</h2></section>
    </main>`;
  return document.getElementById('screens')!;
}

const sections = () => [...document.querySelectorAll<HTMLElement>('[data-screen]')];
const visible = () => sections().filter((s) => !s.hidden).map((s) => s.dataset.screen);

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

describe('createRouter', () => {
  it('shows exactly one screen; the others are hidden and inert', () => {
    const router = createRouter(setup());
    router.show('map');
    expect(visible()).toEqual(['map']);
    expect(router.current()).toBe('map');
    for (const s of sections()) {
      const shown = s.dataset.screen === 'map';
      expect(s.hidden).toBe(!shown);
      expect(s.hasAttribute('inert')).toBe(!shown);
    }
    router.show('title');
    expect(visible()).toEqual(['title']);
    expect(document.querySelector('[data-screen="map"]')!.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('[data-screen="title"]')!.hasAttribute('inert')).toBe(false);
  });

  it('moves focus to the new screen heading, made focusable', () => {
    const router = createRouter(setup());
    router.show('map');
    const heading = document.querySelector('[data-screen="map"] h2') as HTMLElement;
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('moves focus to the given selector when there is one', () => {
    const router = createRouter(setup());
    router.show('battle', '#move');
    expect(document.activeElement).toBe(document.getElementById('move'));
  });

  it('can show a screen without moving focus (first paint)', () => {
    const router = createRouter(setup());
    (document.getElementById('go') as HTMLButtonElement).focus();
    router.show('title', undefined, { focus: false });
    expect(document.activeElement).toBe(document.getElementById('go'));
    expect(visible()).toEqual(['title']);
  });

  it('announces the screen name in the live region and the document title', () => {
    const root = setup();
    const router = createRouter(root);
    router.show('map');
    const live = root.querySelector('[data-announcer]')!;
    expect(live.textContent).toBe('Map');
    expect(document.title).toBe('Map · Echo battle');
    router.show('end');
    expect(live.textContent).toBe('Run over');
    expect(document.title).toBe('Run over · Echo battle');
  });

  it('creates a polite live region when the page has none', () => {
    document.body.innerHTML = '<main id="r"><section data-screen="title"><h2>T</h2></section></main>';
    const root = document.getElementById('r')!;
    createRouter(root).show('title');
    const live = root.querySelector('[data-announcer]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Start');
  });

  it('refreshTitle re-renders the title and announcement in the current language', () => {
    const root = setup();
    const router = createRouter(root);
    router.show('map');
    setLang('es');
    router.refreshTitle();
    expect(document.title).toBe('Mapa · Combate de ecos');
  });
});

describe('isolateScreen', () => {
  it('reveals one screen without announcing or moving focus', () => {
    const root = setup();
    (document.getElementById('go') as HTMLButtonElement).focus();
    document.title = 'unchanged';
    isolateScreen(root, 'battle');
    expect(visible()).toEqual(['battle']);
    expect(document.title).toBe('unchanged');
    expect(root.querySelector('[data-announcer]')!.textContent).toBe('');
  });
});
