// Decorates the run's DOM screens with the scene art, loaded lazily after the first paint so the
// main bundle stays small. It watches the screen sections and, after each render, adds:
//   title: an animated zone hero with the chosen starter on its platform and the KINFALL wordmark
//          (the only labelled art: an image named after the game);
//   map:   a zone banner and pixel node icons (the node text stays the accessible name);
//   event: the event's vignette (recruit camp, shrine, cache, mystery);
//   end:   the zone scene with the victory or defeat flourish.
// Everything added is decorative (aria-hidden), never focusable and never carries information
// that is not also in text. Without this module the screens work exactly the same.
import { CONTENT } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { eventVignette, iconForNodeType, nodeIcon, wordmark, zoneIdOf, type VignetteKind } from '@kinfall/core/art/scene';
import { t } from '@kinfall/core/platform/i18n';
import type { NodeType } from '@kinfall/core/sim/run/types';
import { gridBitmap } from './canvas2d';
import { currentZone, installFrames } from './frames';
import { onMotionChange } from './motion';
import { createScenePlayer, wakeScenes, type ScenePlayer } from './scenePlayer';

const VIGNETTES: readonly string[] = ['recruit', 'shrine', 'cache', 'mystery'];
const ART = 'data-art';

/** The run seed the screens are drawn with (set by the run page on <body>). */
function currentSeed(doc: Document): string {
  return doc.body.dataset.seed || 'kinfall';
}

/** A crisp copy of a grid at a whole-number scale (decorative). */
export function pixelCanvas(doc: Document, grid: { width: number; height: number }, bitmap: CanvasImageSource, scale: number, cls: string): HTMLCanvasElement {
  const c = doc.createElement('canvas');
  c.className = cls;
  c.setAttribute('aria-hidden', 'true');
  c.width = grid.width * scale;
  c.height = grid.height * scale;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  }
  return c;
}

/**
 * Whole-number scale of the wordmark for a hero `width` CSS px wide: at least the core's phone
 * scale, at most 70% of the hero's width, never more than 6.
 */
export function logoScale(width: number): number {
  const wm = wordmark();
  const min = wm.scales[0] ?? 2;
  return Math.max(min, Math.min(6, Math.floor((width * 0.7) / wm.grid.width)));
}

/** The KINFALL wordmark as an image named after the game. */
export function logoCanvas(doc: Document, width: number): HTMLCanvasElement {
  const wm = wordmark();
  const scale = logoScale(width);
  const c = pixelCanvas(doc, wm.grid, gridBitmap(wm.grid), scale, 'title-logo');
  c.removeAttribute('aria-hidden');
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', t(wm.labelKey));
  return c;
}

/** Whole-number scale of a 64-pixel vignette: about 3/4 of the width, up to a 560 px column, 2x to 6x. */
export function vignetteScale(width: number): number {
  return Math.max(2, Math.min(6, Math.floor((Math.min(width, 560) * 0.75) / 64)));
}

const players = new Map<HTMLElement, ScenePlayer[]>();
const keep = (section: HTMLElement, list: ScenePlayer[]) => {
  for (const p of players.get(section) ?? []) if (!list.includes(p)) p.dispose();
  players.set(section, list);
};

function decorateTitle(section: HTMLElement): void {
  const doc = section.ownerDocument;
  const existing = section.querySelector<HTMLElement>(':scope > .title-hero');
  if (existing) {
    // Re-rendered for a language change: refresh the logo's name.
    existing.querySelector('.title-logo')?.setAttribute('aria-label', t(wordmark().labelKey));
    return;
  }
  const species = (id: string | undefined) => (id ? lookup(CONTENT).species(id) : null);
  const chosen = () => section.querySelector<HTMLInputElement>('input[name="starter"]:checked')?.value ?? CONTENT.starters[0];
  const foe = CONTENT.species[(CONTENT.species.length * 2) / 3 | 0] ?? CONTENT.species[0]!;
  const lead = species(chosen());
  const player = createScenePlayer(doc, {
    zone: 0,
    seed: 'kinfall',
    className: 'scene-art title-scene',
    stage: { player: lead ? { species: lead } : null, enemy: { species: foe, silhouette: true } },
  });
  const width = section.clientWidth || doc.defaultView?.innerWidth || 320;
  const hero = doc.createElement('div');
  hero.className = 'title-hero';
  hero.setAttribute(ART, '');
  let logo = logoCanvas(doc, width);
  hero.append(player.canvas, logo);
  section.prepend(hero);
  // Keep the logo at a whole-number scale for the hero's current width.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const w = hero.clientWidth;
      if (w > 0 && logoScale(w) * wordmark().grid.width !== logo.width) {
        const next = logoCanvas(doc, w);
        logo.replaceWith(next);
        logo = next;
      }
    }).observe(hero);
  }
  keep(section, [player]);
  section.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.name !== 'starter') return;
    const sp = species(input.value);
    player.setCreature('player', sp ? { species: sp } : null);
  });
}

function decorateMap(section: HTMLElement): void {
  const doc = section.ownerDocument;
  for (const button of section.querySelectorAll<HTMLElement>('.map-node')) {
    const slot = button.querySelector<HTMLElement>('.map-node-icon');
    if (!slot || slot.querySelector('canvas')) continue;
    const kind = iconForNodeType(button.dataset.type as NodeType);
    const grid = nodeIcon(kind);
    const icon = pixelCanvas(doc, grid, gridBitmap(grid), 2, 'node-icon');
    icon.dataset.icon = kind;
    slot.replaceChildren(icon);
  }
  const heading = section.querySelector<HTMLElement>(':scope > .screen-heading');
  const old = section.querySelector<HTMLElement>(':scope > .scene-banner');
  const zone = currentZone(doc);
  const seed = currentSeed(doc);
  const key = `${zone}|${seed}`;
  if (old && old.dataset.key === key) return;
  const player = createScenePlayer(doc, { zone, seed, className: 'scene-art', cropTop: 24, rows: 76 });
  const banner = doc.createElement('div');
  banner.className = 'scene-banner';
  banner.dataset.key = key;
  banner.setAttribute(ART, '');
  banner.append(player.canvas);
  if (old) old.replaceWith(banner);
  else heading?.after(banner);
  section.dataset.zone = String(zoneIdOf(zone));
  keep(section, [player]);
}

function decorateEvent(section: HTMLElement): void {
  const doc = section.ownerDocument;
  const kind = doc.body.dataset.phase ?? '';
  if (!VIGNETTES.includes(kind)) return;
  const zone = zoneIdOf(currentZone(doc));
  const seed = currentSeed(doc);
  const key = `${kind}|${zone}|${seed}`;
  const old = section.querySelector<HTMLElement>(':scope > .event-vignette');
  if (old && old.dataset.key === key) return;
  const grid = eventVignette(kind as VignetteKind, zone, seed);
  const frame = doc.createElement('div');
  frame.className = 'event-vignette';
  frame.dataset.key = key;
  frame.setAttribute(ART, '');
  frame.setAttribute('aria-hidden', 'true');
  frame.append(pixelCanvas(doc, grid, gridBitmap(grid), vignetteScale(section.clientWidth || 360), 'vignette-art'));
  if (old) old.replaceWith(frame);
  else section.querySelector(':scope > .screen-heading')?.after(frame);
}

function decorateEnd(section: HTMLElement): void {
  const doc = section.ownerDocument;
  const heading = section.querySelector<HTMLElement>(':scope > .screen-heading');
  if (!heading || section.querySelector(':scope > .end-scene')) return;
  const won = heading.classList.contains('win');
  const player = createScenePlayer(doc, {
    zone: currentZone(doc),
    seed: currentSeed(doc),
    className: 'scene-art',
    cropTop: 8,
    rows: 120,
    effect: { id: won ? 'victory' : 'defeat', title: t(won ? 'result.victory' : 'result.defeat') },
  });
  const box = doc.createElement('div');
  box.className = 'end-scene';
  box.setAttribute(ART, '');
  box.append(player.canvas);
  heading.after(box);
  keep(section, [player]);
}

const DECORATORS: Record<string, (section: HTMLElement) => void> = {
  title: decorateTitle,
  map: decorateMap,
  event: decorateEvent,
  end: decorateEnd,
};

/** Wires the decorations once; safe to call again. */
let installed = false;
export function installScreenArt(doc: Document = document): void {
  if (installed) return;
  installed = true;
  installFrames(doc);
  const run = (section: HTMLElement) => {
    const decorate = DECORATORS[section.dataset.screen ?? ''];
    if (!decorate) return;
    try {
      decorate(section);
    } catch (err) {
      console.warn('screen art unavailable', err);
    }
  };
  const sections = [...doc.querySelectorAll<HTMLElement>('section.screen[data-screen]')];
  const observer = new MutationObserver((records) => {
    const touched = new Set<HTMLElement>();
    for (const r of records) {
      const section = (r.target as HTMLElement).closest<HTMLElement>('section.screen[data-screen]');
      if (section) touched.add(section);
    }
    for (const s of touched) run(s);
    wakeScenes();
  });
  for (const s of sections) {
    run(s);
    observer.observe(s, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  }
  wakeScenes();
  doc.addEventListener('visibilitychange', wakeScenes);
  onMotionChange(doc, wakeScenes);
}

// The run page imports this chunk without calling into it (src/main.ts), which keeps the main
// bundle's hook to one line; unit tests call installScreenArt themselves.
if (typeof document !== 'undefined' && document.getElementById('screen-title')) installScreenArt();
