// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isFullscreen, toggleFullscreen, wireFullscreenButton } from '../../src/view/fullscreen';

type Doc = Record<string, unknown>;
const doc = document as unknown as Doc;

function setApi(on: boolean, element: Element | null = null): { exit: ReturnType<typeof vi.fn> } {
  const exit = vi.fn(() => Promise.resolve());
  Object.defineProperty(doc, 'fullscreenEnabled', { configurable: true, value: on });
  Object.defineProperty(doc, 'fullscreenElement', { configurable: true, value: element });
  Object.defineProperty(doc, 'exitFullscreen', { configurable: true, value: on ? exit : undefined });
  return { exit };
}

afterEach(() => {
  for (const k of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) delete doc[k];
  document.body.innerHTML = '';
});

describe('toggleFullscreen', () => {
  it('requests fullscreen on the element when not fullscreen', async () => {
    setApi(true, null);
    const el = document.createElement('div');
    const request = vi.fn(() => Promise.resolve());
    (el as unknown as Doc).requestFullscreen = request;
    await toggleFullscreen(el);
    expect(request).toHaveBeenCalledOnce();
  });

  it('exits fullscreen when it is already on', async () => {
    const { exit } = setApi(true, document.documentElement);
    expect(isFullscreen()).toBe(true);
    await toggleFullscreen();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('resolves without error where the API is missing', async () => {
    setApi(false);
    expect(isFullscreen()).toBe(false);
    await expect(toggleFullscreen()).resolves.toBeUndefined();
  });
});

describe('wireFullscreenButton', () => {
  let btn: HTMLButtonElement;
  beforeEach(() => {
    btn = document.createElement('button');
    btn.hidden = true;
    document.body.append(btn);
  });

  it('hides the button when the API is missing', () => {
    setApi(false);
    wireFullscreenButton(btn);
    expect(btn.hidden).toBe(true);
  });

  it('shows the button and flips its label on fullscreenchange', () => {
    setApi(true, null);
    wireFullscreenButton(btn);
    expect(btn.hidden).toBe(false);
    expect(btn.dataset.i18nLabel).toBe('hud.fullscreen');
    setApi(true, document.documentElement);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(btn.dataset.i18nLabel).toBe('hud.exitFullscreen');
    expect(btn.getAttribute('aria-label')).toBe('Exit fullscreen');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
