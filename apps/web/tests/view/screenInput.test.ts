// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { GameAction } from '../../src/platform/input';
import { createRouter } from '../../src/view/router';
import type { ScreenId } from '../../src/view/router';
import { bindScreenInput } from '../../src/view/screenInput';

let dispose: () => void = () => {};
afterEach(() => dispose());

function setup() {
  document.body.innerHTML = `
    <main id="screens">
      ${['title', 'map', 'battle', 'event', 'end']
        .map((s) => `<section data-screen="${s}"><h2>${s}</h2><button type="button">b</button></section>`)
        .join('')}
    </main>`;
  const root = document.getElementById('screens')!;
  const router = createRouter(root);
  const actions: GameAction[] = [];
  const battle = root.querySelector<HTMLElement>('[data-screen="battle"]')!;
  ({ dispose } = bindScreenInput(battle, router, 'battle', (a) => actions.push(a), { poll: () => () => {}, getGamepads: () => [] }));
  return { root, router, actions };
}

/** Keydown dispatched from `from` (heading, button or body), like a real key press. */
function press(from: Element, code: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true });
  from.dispatchEvent(e);
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  return e;
}

const SCROLL_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'];

describe('bindScreenInput (run page battle input)', () => {

  it.each<ScreenId>(['title', 'map', 'event', 'end'])('on the %s screen, scroll keys keep their default', (screen) => {
    const { root, router, actions } = setup();
    router.show(screen);
    const section = root.querySelector(`[data-screen="${screen}"]`)!;
    for (const from of [section.querySelector('h2')!, document.body]) {
      for (const code of SCROLL_KEYS) expect(press(from, code).defaultPrevented, `${screen} ${code}`).toBe(false);
    }
    expect(press(section.querySelector('h2')!, 'Escape').defaultPrevented).toBe(false);
    expect(actions).toEqual([]);
  });

  it('on the battle screen the keys are handled and prevented', () => {
    const { root, router, actions } = setup();
    router.show('battle');
    const heading = root.querySelector('[data-screen="battle"] h2')!;
    expect(press(heading, 'ArrowDown').defaultPrevented).toBe(true);
    expect(press(heading, 'Space').defaultPrevented).toBe(true);
    expect(press(document.body, 'ArrowUp').defaultPrevented).toBe(true);
    expect(actions).toEqual(['down', 'confirm', 'up']);
  });
});
