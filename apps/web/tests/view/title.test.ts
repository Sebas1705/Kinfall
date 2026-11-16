// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '@webgames/core/content';
import { setLang } from '@webgames/core/platform/i18n';
import type { LoadResult } from '@webgames/core/platform/runStorage';
import { startRun } from '@webgames/core/sim/run/run';
import { initialSeed, randomSeed, renderTitle, SEED_ALPHABET } from '../../src/view/screens/title';
import type { TitleProps } from '../../src/view/screens/title';

beforeEach(() => {
  // jsdom has no 2D canvas; the title screen must cope with a null context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  setLang('en');
});

function render(save: LoadResult, over: Partial<TitleProps> = {}) {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const props: TitleProps = {
    content: CONTENT,
    seed: 'abc123',
    save,
    onStart: vi.fn(),
    onContinue: vi.fn(),
    onDiscard: vi.fn(),
    ...over,
  };
  renderTitle(host, props);
  return { host, props };
}

const q = <T extends Element>(host: HTMLElement, sel: string) => host.querySelector<T>(sel)!;
const okSave = (): LoadResult => ({ kind: 'ok', run: startRun('s', 'cindermite', CONTENT) });

describe('initialSeed', () => {
  it('uses the trimmed ?seed= value', () => {
    expect(initialSeed('?seed=%20hello%20')).toBe('hello');
    expect(initialSeed('?mode=x&seed=abc')).toBe('abc');
  });

  it('caps the URL seed at 32 characters', () => {
    expect(initialSeed(`?seed=${'x'.repeat(50)}`)).toBe('x'.repeat(32));
  });

  it('falls back to a random code when the seed is missing or blank', () => {
    const random = vi.fn(() => 'RANDOM88');
    expect(initialSeed('', random)).toBe('RANDOM88');
    expect(initialSeed('?seed=%20%20', random)).toBe('RANDOM88');
    expect(initialSeed('?seed=', random)).toBe('RANDOM88');
    expect(random).toHaveBeenCalledTimes(3);
  });
});

describe('randomSeed', () => {
  it('is 8 characters from an unambiguous alphabet', () => {
    expect(SEED_ALPHABET).not.toMatch(/[01ILOilo]/);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const s = randomSeed();
      expect(s).toMatch(new RegExp(`^[${SEED_ALPHABET}]{8}$`));
      seen.add(s);
    }
    expect(seen.size).toBeGreaterThan(45);
  });
});

describe('renderTitle', () => {
  it('has a focusable screen heading', () => {
    const { host } = render({ kind: 'none' });
    expect(q(host, 'h2').textContent).toBe('Start');
  });

  it('"Continue" is disabled without a save and enabled with one', () => {
    const none = render({ kind: 'none' });
    expect(q<HTMLButtonElement>(none.host, '[data-action="continue"]').disabled).toBe(true);
    const ok = render(okSave());
    const btn = q<HTMLButtonElement>(ok.host, '[data-action="continue"]');
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(ok.props.onContinue).toHaveBeenCalledTimes(1);
  });

  it('prefills the seed field with the given seed, limited to 32 characters', () => {
    const { host } = render({ kind: 'none' });
    const input = q<HTMLInputElement>(host, 'input[name="seed"]');
    expect(input.value).toBe('abc123');
    expect(input.maxLength).toBe(32);
    expect(q(host, `label[for="${input.id}"]`).textContent).toBe('Seed');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('offers the three starters as radio cards with a hidden canvas, name, element and hint', () => {
    const { host } = render({ kind: 'none' });
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"][name="starter"]')];
    expect(radios.map((r) => r.value)).toEqual(CONTENT.starters);
    expect(radios[0]!.checked).toBe(true);
    const cards = [...host.querySelectorAll('.starter-card')];
    expect(cards).toHaveLength(3);
    expect(cards[0]!.textContent).toContain('Cindermite');
    expect(cards[0]!.textContent).toContain('Ember');
    expect(cards[0]!.textContent).toContain('A fiery creature that scorches its foes.');
    expect(cards[1]!.textContent).toContain('Brambleback');
    expect(cards[1]!.textContent).toContain('Thorn');
    expect(cards[2]!.textContent).toContain('Tidewisp');
    expect(cards[2]!.textContent).toContain('Tide');
    for (const c of cards) expect(c.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true');
    expect(q(host, 'fieldset legend').textContent).toBe('Choose your starter');
  });

  it('"New run" starts with the seed field and the chosen starter', () => {
    const { host, props } = render({ kind: 'none' });
    q<HTMLInputElement>(host, 'input[name="seed"]').value = '  my seed ';
    q<HTMLInputElement>(host, 'input[value="tidewisp"]').checked = true;
    q<HTMLButtonElement>(host, '[data-action="new-run"]').click();
    expect(props.onStart).toHaveBeenCalledWith('my seed', 'tidewisp');
  });

  it('a blank seed gets a fresh random code', () => {
    const { host, props } = render({ kind: 'none' });
    const input = q<HTMLInputElement>(host, 'input[name="seed"]');
    input.value = '   ';
    q<HTMLButtonElement>(host, '[data-action="new-run"]').click();
    const [seed] = (props.onStart as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(seed).toMatch(/^[A-Z2-9]{8}$/);
    expect(input.value).toBe(seed);
  });

  it('always shows the saves-live-in-this-browser note', () => {
    const { host } = render({ kind: 'none' });
    expect(host.textContent).toContain('Saves live in this browser; clearing site data deletes them.');
  });

  it('a corrupt save shows the notice and a two-step "Discard save"', () => {
    const { host, props } = render({ kind: 'corrupt', error: 'bad checksum' });
    expect(host.textContent).toContain('Your saved run is damaged and cannot be loaded: bad checksum');
    expect(q<HTMLButtonElement>(host, '[data-action="continue"]').disabled).toBe(true);
    q<HTMLButtonElement>(host, '[data-action="discard"]').click();
    expect(props.onDiscard).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Discard your saved run? This cannot be undone.');
    const cancel = q<HTMLButtonElement>(host, '[data-action="discard-cancel"]');
    expect(document.activeElement).toBe(cancel);
    cancel.click();
    expect(host.querySelector('[data-action="discard-yes"]')).toBeNull();
    expect(document.activeElement).toBe(q(host, '[data-action="discard"]'));
    q<HTMLButtonElement>(host, '[data-action="discard"]').click();
    q<HTMLButtonElement>(host, '[data-action="discard-yes"]').click();
    expect(props.onDiscard).toHaveBeenCalledTimes(1);
  });

  it('unavailable storage behaves like no save plus a one-line notice', () => {
    const { host } = render({ kind: 'unavailable', error: 'blocked' });
    expect(q<HTMLButtonElement>(host, '[data-action="continue"]').disabled).toBe(true);
    expect(host.querySelector('[data-action="discard"]')).toBeNull();
    expect(host.textContent).toContain('This browser is not saving data right now, so this run will not be saved.');
  });

  it('keeps the typed seed and chosen starter when re-rendered with preserveInput', () => {
    const { host, props } = render({ kind: 'none' });
    q<HTMLInputElement>(host, 'input[name="seed"]').value = 'typed';
    q<HTMLInputElement>(host, 'input[value="brambleback"]').checked = true;
    setLang('es');
    renderTitle(host, { ...props, seed: 'other', preserveInput: true });
    expect(q<HTMLInputElement>(host, 'input[name="seed"]').value).toBe('typed');
    expect(q<HTMLInputElement>(host, 'input[value="brambleback"]').checked).toBe(true);
    expect(q(host, '[data-action="new-run"]').textContent).toBe('Nueva partida');
  });
});
