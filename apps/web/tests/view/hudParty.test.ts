// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '@kinfall/core/platform/i18n';
import { setHudParty } from '../../src/view/hudParty';

afterEach(() => setLang('en'));

const host = () => {
  const el = document.createElement('div');
  document.body.replaceChildren(el);
  return el;
};

describe('setHudParty', () => {
  it('renders one chip per member and the souls, as a labelled list', () => {
    const el = host();
    setHudParty(el, [{ name: 'Cindermite', hp: 12, maxHp: 14 }, { name: 'Skirrow', hp: 3, maxHp: 9 }], 4);
    const list = el.querySelector('ul')!;
    expect(list.getAttribute('aria-label')).toBe('Party');
    const chips = [...list.querySelectorAll('li')];
    expect(chips).toHaveLength(3);
    expect(chips[0]!.textContent).toContain('Cindermite');
    expect(chips[0]!.textContent).toContain('12/14');
    expect(chips[2]!.textContent).toContain('Souls');
    expect(chips[2]!.textContent).toContain('4');
  });

  it('low HP is a class on top of the HP text, never colour alone', () => {
    const el = host();
    setHudParty(el, [{ name: 'Skirrow', hp: 2, maxHp: 9 }], 0);
    expect(el.querySelector('li')!.classList.contains('hud-chip--low')).toBe(true);
    expect(el.querySelector('li')!.textContent).toContain('2/9');
  });

  it('null clears the chips', () => {
    const el = host();
    setHudParty(el, [{ name: 'A', hp: 1, maxHp: 1 }], 1);
    setHudParty(el, null);
    expect(el.childElementCount).toBe(0);
  });

  it('follows the language', () => {
    setLang('es');
    const el = host();
    setHudParty(el, [{ name: 'Cenizón', hp: 1, maxHp: 2 }], 2);
    expect(el.querySelector('ul')!.getAttribute('aria-label')).toBe('Equipo');
    expect(el.textContent).toContain('Almas');
  });
});
