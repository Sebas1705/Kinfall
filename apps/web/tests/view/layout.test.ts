// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLayout } from '../../src/view/layout';

function setWindow(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  setWindow(640, 360);
});
afterEach(() => root.remove());

describe('startLayout', () => {
  it('sets orientation and mode from the window and the text scale', () => {
    const handle = startLayout(root, { screen: () => 'map', textScale: () => 1 });
    expect(root.dataset.orientation).toBe('landscape');
    expect(root.dataset.mode).toBe('console');
    handle.stop();
  });

  it('follows resize events', () => {
    const handle = startLayout(root, { screen: () => 'map', textScale: () => 1 });
    setWindow(360, 640);
    window.dispatchEvent(new Event('resize'));
    expect(root.dataset.orientation).toBe('portrait');
    expect(root.dataset.mode).toBe('console');
    handle.stop();
  });

  it('falls back when the text scale is too large for the window', () => {
    const handle = startLayout(root, { screen: () => 'map', textScale: () => 2 });
    expect(root.dataset.mode).toBe('fallback');
    handle.stop();
  });

  it('reads the screen and text scale on every refresh', () => {
    let scale = 1;
    const handle = startLayout(root, { screen: () => 'battle', textScale: () => scale });
    expect(root.dataset.mode).toBe('console');
    scale = 2;
    handle.refresh();
    expect(root.dataset.mode).toBe('fallback');
    handle.stop();
  });

  it('re-runs on fullscreenchange', () => {
    const handle = startLayout(root, { screen: () => 'map', textScale: () => 1 });
    setWindow(360, 640);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(root.dataset.orientation).toBe('portrait');
    handle.stop();
  });

  it('exposes the region sizes as custom properties', () => {
    const handle = startLayout(root, { screen: () => 'map', textScale: () => 1 });
    expect(root.style.getPropertyValue('--hud-h')).toBe('28px');
    expect(root.style.getPropertyValue('--rail-w')).toBe('205px');
    expect(root.style.getPropertyValue('--stage-h')).toBe('332px');
    setWindow(360, 640);
    handle.refresh();
    expect(root.style.getPropertyValue('--rail-w')).toBe('0px');
    expect(root.style.getPropertyValue('--stage-h')).toBe(`${Math.round(0.41 * 640)}px`);
    handle.stop();
  });

  it('listens to visualViewport resizes', () => {
    const listeners = new Map<string, EventListener>();
    const vv = {
      addEventListener: (type: string, fn: EventListener) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    vi.stubGlobal('visualViewport', vv);
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    const handle = startLayout(root, { screen: () => 'map', textScale: () => 1 });
    setWindow(360, 640);
    listeners.get('resize')!(new Event('resize'));
    expect(root.dataset.orientation).toBe('portrait');
    handle.stop();
    expect(listeners.size).toBe(0);
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  });

  it('stop() removes the listeners', () => {
    const handle = startLayout(root, { screen: () => 'map', textScale: () => 1 });
    handle.stop();
    setWindow(360, 640);
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(root.dataset.orientation).toBe('landscape');
  });
});
