// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, mapGamepad, mapKey, type GameAction } from '../../src/platform/input';

describe('mapKey', () => {
  const table: Array<[string, GameAction]> = [
    ['ArrowUp', 'up'], ['KeyW', 'up'],
    ['ArrowDown', 'down'], ['KeyS', 'down'],
    ['ArrowLeft', 'left'], ['KeyA', 'left'],
    ['ArrowRight', 'right'], ['KeyD', 'right'],
    ['Enter', 'confirm'], ['Space', 'confirm'], ['KeyZ', 'confirm'],
    ['Escape', 'back'], ['Backspace', 'back'], ['KeyX', 'back'],
    ['KeyQ', 'swap'],
  ];
  it.each(table)('%s -> %s', (code, action) => {
    expect(mapKey({ code })).toBe(action);
  });
  it('never captures Tab or unknown keys', () => {
    expect(mapKey({ code: 'Tab' })).toBeNull();
    expect(mapKey({ code: 'KeyP' })).toBeNull();
  });
  it('ignores key repeat', () => {
    expect(mapKey({ code: 'Enter', repeat: true })).toBeNull();
    expect(mapKey({ code: 'Enter', repeat: false })).toBe('confirm');
  });
  it('ignores modifier combos', () => {
    expect(mapKey({ code: 'KeyW', ctrlKey: true })).toBeNull();
    expect(mapKey({ code: 'KeyS', metaKey: true })).toBeNull();
    expect(mapKey({ code: 'ArrowLeft', altKey: true })).toBeNull();
  });
});

describe('mapGamepad', () => {
  const pad = (...on: number[]) => {
    const b = new Array<boolean>(16).fill(false);
    for (const i of on) b[i] = true;
    return b;
  };
  it('maps presses on the standard layout', () => {
    expect(mapGamepad(pad(), pad(12))).toBe('up');
    expect(mapGamepad(pad(), pad(13))).toBe('down');
    expect(mapGamepad(pad(), pad(14))).toBe('left');
    expect(mapGamepad(pad(), pad(15))).toBe('right');
    expect(mapGamepad(pad(), pad(0))).toBe('confirm');
    expect(mapGamepad(pad(), pad(1))).toBe('back');
    expect(mapGamepad(pad(), pad(3))).toBe('swap');
  });
  it('is edge triggered', () => {
    expect(mapGamepad(pad(0), pad(0))).toBeNull();
    expect(mapGamepad(pad(0), pad())).toBeNull();
    expect(mapGamepad(pad(), pad(2))).toBeNull();
  });
});

describe('createInput', () => {
  let target: HTMLElement;
  let t: number;
  let frame: () => void;
  let stopPoll: ReturnType<typeof vi.fn>;
  let pads: Array<{ buttons: Array<{ pressed: boolean }> } | null>;
  let actions: GameAction[];
  let dispose: () => void;

  const setPad = (...on: number[]) => {
    pads = [{ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: on.includes(i) })) }];
  };
  const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent(type, { code, cancelable: true, ...init });
    window.dispatchEvent(e);
    return e;
  };
  const click = (sel: string) => target.querySelector<HTMLButtonElement>(sel)!.click();

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="t"><button data-action="confirm">OK</button><button data-action="up">U</button><button data-action="bogus">x</button><button>none</button></div>';
    target = document.getElementById('t')!;
    t = 1000;
    stopPoll = vi.fn();
    pads = [];
    actions = [];
    ({ dispose } = createInput(target, (a) => actions.push(a), {
      now: () => t,
      poll: (cb) => {
        frame = cb;
        return stopPoll as unknown as () => void;
      },
      getGamepads: () => pads,
    }));
  });
  afterEach(() => dispose());

  it('emits on keydown, ignores repeat and holding', () => {
    key('keydown', 'Enter');
    t += 500;
    key('keydown', 'Enter', { repeat: true });
    t += 500;
    key('keydown', 'Enter'); // no repeat flag, but the key is still held
    expect(actions).toEqual(['confirm']);
  });

  it('allows a new press after keyup', () => {
    key('keydown', 'Enter');
    key('keyup', 'Enter');
    t += 200;
    key('keydown', 'Enter');
    expect(actions).toEqual(['confirm', 'confirm']);
  });

  it('blur clears pressed state; stray keyup emits nothing', () => {
    key('keydown', 'ArrowUp');
    window.dispatchEvent(new Event('blur'));
    key('keyup', 'ArrowUp');
    expect(actions).toEqual(['up']);
    t += 200;
    key('keyup', 'Enter');
    expect(actions).toEqual(['up']);
    key('keydown', 'ArrowUp');
    expect(actions).toEqual(['up', 'up']);
  });

  it('a gamepad button still held after blur is not a new press', () => {
    setPad(0);
    frame();
    window.dispatchEvent(new Event('blur'));
    t += 200;
    frame();
    expect(actions).toEqual(['confirm']);
  });

  it('releasing and pressing again after blur emits a new action', () => {
    setPad(0);
    frame();
    window.dispatchEvent(new Event('blur'));
    setPad();
    frame();
    t += 200;
    setPad(0);
    frame();
    expect(actions).toEqual(['confirm', 'confirm']);
  });

  it('gamepad polling keeps running when the callback throws', () => {
    dispose();
    const callbacks: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => callbacks.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let boom = true;
    const got: GameAction[] = [];
    const i = createInput(target, (a) => {
      got.push(a);
      if (boom) throw new Error('boom');
    }, { now: () => t, getGamepads: () => pads });
    setPad(0);
    callbacks.shift()!(); // throws inside onAction; must still schedule the next frame
    expect(callbacks.length).toBe(1);
    expect(err).toHaveBeenCalled();
    boom = false;
    setPad();
    callbacks.shift()!();
    t += 200;
    setPad(0);
    callbacks.shift()!();
    expect(got).toEqual(['confirm', 'confirm']);
    i.dispose();
    vi.unstubAllGlobals();
    err.mockRestore();
    ({ dispose } = createInput(target, () => {}, { poll: () => () => {}, getGamepads: () => [] }));
  });

  it('holding gamepad A for 10 frames emits one confirm; re-press emits another', () => {
    setPad(0);
    for (let i = 0; i < 10; i++) {
      t += 16;
      frame();
    }
    expect(actions).toEqual(['confirm']);
    setPad();
    frame();
    t += 100;
    setPad(0);
    frame();
    expect(actions).toEqual(['confirm', 'confirm']);
  });

  it('handles missing gamepads', () => {
    pads = [null];
    frame();
    expect(actions).toEqual([]);
  });

  it('Enter and gamepad A within 50 ms emit one confirm', () => {
    key('keydown', 'Enter');
    t += 16;
    setPad(0);
    frame();
    expect(actions).toEqual(['confirm']);
  });

  it('touch click and key of the same action within 50 ms emit once', () => {
    key('keydown', 'Enter');
    t += 10;
    click('[data-action="confirm"]');
    expect(actions).toEqual(['confirm']);
  });

  it('same action after the window emits again', () => {
    key('keydown', 'Enter');
    key('keyup', 'Enter');
    t += 50;
    click('[data-action="confirm"]');
    expect(actions).toEqual(['confirm', 'confirm']);
  });

  it('different actions within 50 ms both emit', () => {
    key('keydown', 'Enter');
    t += 5;
    click('[data-action="up"]');
    setPad(1);
    frame();
    expect(actions).toEqual(['confirm', 'up', 'back']);
  });

  it('simultaneous gamepad buttons in one frame both emit', () => {
    setPad(0, 12);
    frame();
    expect([...actions].sort()).toEqual(['confirm', 'up']);
  });

  it('click on invalid or missing data-action emits nothing', () => {
    click('[data-action="bogus"]');
    click('button:not([data-action])');
    expect(actions).toEqual([]);
  });

  it('preventDefault only for mapped keys; Tab and modifier combos untouched', () => {
    expect(key('keydown', 'Enter').defaultPrevented).toBe(true);
    key('keyup', 'Enter');
    expect(key('keydown', 'Tab').defaultPrevented).toBe(false);
    expect(key('keydown', 'KeyP').defaultPrevented).toBe(false);
    expect(key('keydown', 'KeyW', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(actions).toEqual(['confirm']);
  });

  describe('focused elements', () => {
    const keyOn = (el: Element, type: 'keydown' | 'keyup', code: string) => {
      const e = new KeyboardEvent(type, { code, cancelable: true, bubbles: true });
      el.dispatchEvent(e);
      return e;
    };
    const add = (html: string, parent: Element = document.body) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      const el = wrap.firstElementChild!;
      parent.appendChild(el);
      return el;
    };

    it.each(['input', 'textarea'])('typing in %s emits nothing and is not prevented', (tag) => {
      const el = add(`<${tag}></${tag}>`);
      for (const code of ['KeyW', 'KeyA', 'KeyZ', 'Space', 'Backspace', 'ArrowLeft', 'Enter', 'Escape']) {
        t += 100;
        expect(keyOn(el, 'keydown', code).defaultPrevented).toBe(false);
        keyOn(el, 'keyup', code);
      }
      expect(actions).toEqual([]);
    });

    it('select keys emit nothing and are not prevented', () => {
      const el = add('<select><option>a</option><option>b</option></select>');
      for (const code of ['ArrowDown', 'ArrowUp', 'Enter', 'Space', 'KeyA']) {
        t += 100;
        expect(keyOn(el, 'keydown', code).defaultPrevented).toBe(false);
        keyOn(el, 'keyup', code);
      }
      expect(actions).toEqual([]);
    });

    it('contenteditable and a[href] own every key', () => {
      const ce = add('<div contenteditable="true"><span id="in">x</span></div>');
      const a = add('<a href="#x">link</a>');
      expect(keyOn(ce.querySelector('#in')!, 'keydown', 'KeyW').defaultPrevented).toBe(false);
      expect(keyOn(a, 'keydown', 'Enter').defaultPrevented).toBe(false);
      expect(actions).toEqual([]);
    });

    it('Enter/Space + click on a focused data-action button emits exactly one own action', () => {
      const btn = target.querySelector<HTMLButtonElement>('[data-action="up"]')!;
      for (const code of ['Enter', 'Space']) {
        t += 200;
        expect(keyOn(btn, 'keydown', code).defaultPrevented).toBe(false);
        keyOn(btn, 'keyup', code);
        btn.click(); // the native click a browser fires
      }
      expect(actions).toEqual(['up', 'up']);
    });

    it('Enter on a non-game button outside target emits nothing', () => {
      const btn = add('<button>other</button>');
      expect(keyOn(btn, 'keydown', 'Enter').defaultPrevented).toBe(false);
      expect(actions).toEqual([]);
    });

    it('a repeated Enter/Space on a focused button is prevented; the first press is not', () => {
      const btn = target.querySelector<HTMLButtonElement>('[data-action="up"]')!;
      for (const code of ['Enter', 'NumpadEnter', 'Space']) {
        const first = new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true });
        btn.dispatchEvent(first);
        expect(first.defaultPrevented).toBe(false);
        const again = new KeyboardEvent('keydown', { code, repeat: true, cancelable: true, bubbles: true });
        btn.dispatchEvent(again);
        expect(again.defaultPrevented).toBe(true);
      }
      expect(actions).toEqual([]);
    });

    it('every key inside a role=log region is left to the browser', () => {
      const log = add('<div role="log" tabindex="0"><p id="line">x</p></div>');
      for (const code of ['ArrowUp', 'ArrowDown', 'PageDown', 'KeyW', 'Enter', 'Space', 'Escape']) {
        t += 100;
        expect(keyOn(log, 'keydown', code).defaultPrevented).toBe(false);
        keyOn(log, 'keyup', code);
        expect(keyOn(log.querySelector('#line')!, 'keydown', code).defaultPrevented).toBe(false);
        keyOn(log, 'keyup', code);
      }
      expect(actions).toEqual([]);
      t += 100;
      expect(keyOn(document.body, 'keydown', 'ArrowDown').defaultPrevented).toBe(true);
      expect(actions).toEqual(['down']);
    });

    it('ArrowDown on a focused button still emits down', () => {
      const btn = target.querySelector<HTMLButtonElement>('[data-action="up"]')!;
      expect(keyOn(btn, 'keydown', 'ArrowDown').defaultPrevented).toBe(true);
      expect(actions).toEqual(['down']);
    });

    it('a regular key on document.body still emits and is prevented', () => {
      expect(keyOn(document.body, 'keydown', 'KeyW').defaultPrevented).toBe(true);
      expect(actions).toEqual(['up']);
    });
  });

  it('dispose removes every listener and cancels polling', () => {
    dispose();
    expect(stopPoll).toHaveBeenCalledTimes(1);
    key('keydown', 'Enter');
    window.dispatchEvent(new Event('blur'));
    click('[data-action="up"]');
    expect(actions).toEqual([]);
  });

  it('dispose removes exactly the listeners that were added (spy check)', () => {
    dispose();
    const wAdd = vi.spyOn(window, 'addEventListener');
    const wRemove = vi.spyOn(window, 'removeEventListener');
    const tAdd = vi.spyOn(target, 'addEventListener');
    const tRemove = vi.spyOn(target, 'removeEventListener');
    const i = createInput(target, () => {}, { now: () => 0, poll: () => () => {}, getGamepads: () => [] });
    i.dispose();
    expect(wRemove.mock.calls.map((c) => c[0]).sort()).toEqual(wAdd.mock.calls.map((c) => c[0]).sort());
    expect(wAdd.mock.calls.length).toBeGreaterThan(0);
    expect(tRemove.mock.calls.map((c) => c[0])).toEqual(tAdd.mock.calls.map((c) => c[0]));
    expect(tAdd.mock.calls.map((c) => c[0])).toEqual(['click']);
    vi.restoreAllMocks();
  });
});
