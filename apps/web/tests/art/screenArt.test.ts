// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONTENT } from '@kinfall/core/content';
import { NODE_ICON_KINDS, iconForNodeType, wordmark } from '@kinfall/core/art/scene';
import { setLang } from '@kinfall/core/platform/i18n';
import { startRun } from '@kinfall/core/sim/run/run';
import type { RunPhase } from '@kinfall/core/sim/run/types';
import { buildEndModel } from '@kinfall/core/models/end';
import { buildEventModel } from '@kinfall/core/models/event';
import { buildMapModel } from '@kinfall/core/models/map';
import { installScreenArt, logoScale } from '../../src/art/screenArt';
import { sceneCount } from '../../src/art/scenePlayer';
import { renderEnd } from '../../src/view/screens/end';
import { renderEvent } from '../../src/view/screens/event';
import { renderMap } from '../../src/view/screens/map';
import { renderTitle } from '../../src/view/screens/title';

const settle = () => new Promise((r) => setTimeout(r, 0));
const section = (id: string) => document.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;
const decorative = (node: Element) => node.closest('[aria-hidden="true"]') !== null;

beforeAll(() => {
  // jsdom has no 2D canvas: the art must cope with a null context (and draw nothing).
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  document.body.innerHTML = ['title', 'map', 'event', 'end'].map((id) => `<section class="screen" data-screen="${id}"></section>`).join('');
  installScreenArt(document);
});
afterEach(() => setLang('en'));

describe('screen art', () => {
  it('installs the pixel frames on <html>', () => {
    expect(document.documentElement.classList.contains('art-frames')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--k-btn')).toMatch(/^url\(/);
    // Vitest does not process CSS, so only the injected <style> is checked here (e2e checks the look).
    expect(document.getElementById('kinfall-art')?.tagName).toBe('STYLE');
  });

  it('title: a decorative hero and the logo as an image named after the game', async () => {
    renderTitle(section('title'), {
      content: CONTENT,
      seed: 'abc',
      save: { kind: 'none' },
      onStart: () => {},
      onContinue: () => {},
      onDiscard: () => {},
    });
    await settle();
    const hero = section('title').querySelector('.title-hero')!;
    expect(hero).not.toBeNull();
    const logo = hero.querySelector<HTMLCanvasElement>('.title-logo')!;
    expect(logo.getAttribute('role')).toBe('img');
    expect(logo.getAttribute('aria-label')).toBe('Kinfall');
    expect(decorative(logo)).toBe(false);
    expect(hero.querySelector('.title-scene')!.getAttribute('aria-hidden')).toBe('true');
    // Nothing added is focusable.
    expect(hero.querySelectorAll('[tabindex], button, a, input')).toHaveLength(0);
    // The screen's own heading still comes first among headings.
    expect(section('title').querySelector('h2')!.textContent).toBe('Start');
  });

  it('title: re-rendering keeps one hero and the logo name follows the language', async () => {
    setLang('es');
    renderTitle(section('title'), { content: CONTENT, seed: 'abc', save: { kind: 'none' }, onStart: () => {}, onContinue: () => {}, onDiscard: () => {} });
    await settle();
    expect(section('title').querySelectorAll('.title-hero')).toHaveLength(1);
    expect(section('title').querySelector('.title-logo')!.getAttribute('aria-label')).toBe('Kinfall');
  });

  it('logo scale is whole, at least the phone scale and at most 6', () => {
    const wm = wordmark();
    for (const w of [200, 320, 360, 768, 1024, 4000]) {
      const s = logoScale(w);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(wm.scales[0]!);
      expect(s).toBeLessThanOrEqual(6);
    }
  });

  it('map: a zone banner and one hidden pixel icon per node, matching its type', async () => {
    const run = startRun('art-test', 'cindermite', CONTENT);
    Object.assign(document.body.dataset, { zone: 1, seed: run.seed, phase: 'map' });
    renderMap(section('map'), buildMapModel(run, CONTENT), () => {});
    await settle();
    const map = section('map');
    expect(map.querySelector('.scene-banner canvas')!.getAttribute('aria-hidden')).toBe('true');
    const kinds = new Set<string>();
    for (const button of map.querySelectorAll<HTMLElement>('button.map-node')) {
      const icon = button.querySelector<HTMLCanvasElement>('.map-node-icon canvas')!;
      expect(icon.dataset.icon).toBe(iconForNodeType(button.dataset.type as never));
      expect(decorative(icon)).toBe(true);
      expect(icon.width).toBe(32);
      kinds.add(icon.dataset.icon!);
    }
    expect(kinds.size).toBeGreaterThan(2);
    expect([...kinds].every((k) => NODE_ICON_KINDS.includes(k as never))).toBe(true);
    // The accessible name is still the text label.
    const first = map.querySelector('button.map-node')!;
    expect(first.getAttribute('aria-label')).toMatch(/^Wild creature/);
  });

  for (const kind of ['recruit', 'shrine', 'cache', 'mystery'] as const) {
    it(`event: the ${kind} vignette, decorative, under the heading`, async () => {
      const run = startRun('art-test', 'cindermite', CONTENT);
      const phase: RunPhase = kind === 'recruit' ? { kind, speciesId: 'skirrow', hp: 5 } : ({ kind } as RunPhase);
      run.phase = phase;
      Object.assign(document.body.dataset, { zone: 0, seed: run.seed, phase: kind });
      renderEvent(section('event'), buildEventModel(run, CONTENT)!, () => {});
      await settle();
      const vignette = section('event').querySelector<HTMLElement>('.event-vignette')!;
      expect(vignette.getAttribute('aria-hidden')).toBe('true');
      expect(vignette.dataset.key!.startsWith(kind)).toBe(true);
      expect(vignette.previousElementSibling!.tagName).toBe('H2');
    });
  }

  it('end: the zone scene with the result flourish', async () => {
    const run = startRun('art-test', 'cindermite', CONTENT);
    run.phase = { kind: 'ended', result: 'won' };
    Object.assign(document.body.dataset, { zone: 2, seed: run.seed, phase: 'ended' });
    const before = sceneCount();
    renderEnd(section('end'), buildEndModel(run, CONTENT)!, () => {});
    await settle();
    const scene = section('end').querySelector('.end-scene canvas')!;
    expect(scene.getAttribute('aria-hidden')).toBe('true');
    expect(sceneCount()).toBe(before + 1);
    // Re-rendering replaces the scene instead of piling up players.
    renderEnd(section('end'), buildEndModel(run, CONTENT)!, () => {});
    await settle();
    expect(section('end').querySelectorAll('.end-scene')).toHaveLength(1);
    expect(sceneCount()).toBe(before + 1);
  });
});
