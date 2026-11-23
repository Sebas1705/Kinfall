// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '@kinfall/core/platform/i18n';
import type { GameId } from '@kinfall/core/games/registry';
import { renderHub } from '../../src/view/screens/hub';
import type { HubProps } from '../../src/view/screens/hub';

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

function render(over: Partial<HubProps> = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const props: HubProps = { focused: 'kinfall', onPlay: vi.fn(), onFocus: vi.fn(), onSoon: vi.fn(), ...over };
  renderHub(root, props);
  return { root, props };
}

const cards = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.hub-card')];
const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('renderHub', () => {
  it('renders a radiogroup with three cards and the hub heading', () => {
    const { root } = render();
    expect(root.querySelector('h2')?.textContent).toBe('Choose a game');
    expect(root.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(cards(root)).toHaveLength(3);
    expect(cards(root).every((c) => c.getAttribute('role') === 'radio')).toBe(true);
  });

  it('shows names in English and Spanish', () => {
    const { root } = render();
    expect(cards(root).map((c) => c.textContent)).toEqual([
      expect.stringContaining('Kinfall'),
      expect.stringContaining('Simulator'),
      expect.stringContaining('Survival'),
    ]);
    setLang('es');
    renderHub(root, { focused: 'kinfall', onPlay: vi.fn(), onFocus: vi.fn(), onSoon: vi.fn() });
    expect(root.querySelector('h2')?.textContent).toBe('Elige un juego');
    expect(cards(root)[1]!.textContent).toContain('Simulador');
    expect(cards(root)[2]!.textContent).toContain('Supervivencia');
    expect(root.querySelector('#hub-play')?.textContent).toBe('Jugar');
  });

  it('roves tabindex and aria-checked on the focused card', () => {
    const { root } = render({ focused: 'simulator' });
    expect(cards(root).map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
    expect(cards(root).map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('marks soon cards aria-disabled', () => {
    const { root } = render();
    expect(cards(root).map((c) => c.getAttribute('aria-disabled'))).toEqual([null, 'true', 'true']);
  });

  it('moves focus with arrows, wrapping, and reports it', () => {
    const onFocus = vi.fn();
    const { root } = render({ onFocus });
    key(cards(root)[0]!, 'ArrowRight');
    expect(onFocus).toHaveBeenLastCalledWith('simulator');
    expect(document.activeElement).toBe(cards(root)[1]);
    key(cards(root)[1]!, 'ArrowDown');
    expect(onFocus).toHaveBeenLastCalledWith('survival');
    key(cards(root)[2]!, 'ArrowRight');
    expect(onFocus).toHaveBeenLastCalledWith('kinfall');
    key(cards(root)[0]!, 'ArrowLeft');
    expect(onFocus).toHaveBeenLastCalledWith('survival');
  });

  it('plays the playable game on Enter and Space', () => {
    const onPlay = vi.fn();
    const { root } = render({ onPlay });
    key(cards(root)[0]!, 'Enter');
    key(cards(root)[0]!, ' ');
    expect(onPlay).toHaveBeenCalledTimes(2);
    expect(onPlay).toHaveBeenCalledWith('kinfall');
  });

  it('announces a soon game and never plays it', () => {
    const onPlay = vi.fn();
    const onSoon = vi.fn();
    const { root } = render({ onPlay, onSoon });
    key(cards(root)[1]!, 'Enter');
    expect(onSoon).toHaveBeenCalledWith('Simulator');
    cards(root)[2]!.click();
    expect(onSoon).toHaveBeenCalledWith('Survival');
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('Play button plays the focused game, or announces a soon one', () => {
    const onPlay = vi.fn();
    const onSoon = vi.fn();
    const a = render({ onPlay, onSoon });
    a.root.querySelector<HTMLButtonElement>('#hub-play')!.click();
    expect(onPlay).toHaveBeenCalledWith('kinfall');
    const b = render({ focused: 'survival', onPlay, onSoon });
    b.root.querySelector<HTMLButtonElement>('#hub-play')!.click();
    expect(onSoon).toHaveBeenCalledWith('Survival');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('clicking a playable card focuses it without playing', () => {
    const onPlay = vi.fn();
    const onFocus = vi.fn();
    const { root } = render({ onPlay, onFocus, focused: 'simulator' });
    cards(root)[0]!.click();
    expect(onFocus).toHaveBeenCalledWith('kinfall' as GameId);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('keeps the focused game when re-rendered after a language change', () => {
    const { root } = render({ focused: 'survival' });
    setLang('es');
    renderHub(root, { focused: 'survival', onPlay: vi.fn(), onFocus: vi.fn(), onSoon: vi.fn() });
    expect(cards(root).map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(cards(root)[2]!.tabIndex).toBe(0);
  });
});
