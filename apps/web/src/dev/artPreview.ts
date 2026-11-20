// Dev-only art preview (apps/web/art-preview.html, `npm run dev` then open /art-preview.html):
// every zone scene with parallax, platforms and ambient life, each effect looping, the HUD frames
// as real DOM buttons and plates (CSS border-image), node icons, event vignettes, floating numbers
// and the logo, on the dusk (dark) and parchment (light) themes. Query: ?seed=, ?scale=, ?zone=.
import { CONTENT } from '@kinfall/core/content';
import { generateCreature } from '@kinfall/core/art/creatureGen';
import type { PixelGrid } from '@kinfall/core/art/palette';
import {
  BUTTON_STATES,
  EFFECT_IDS,
  FLOATING_NUMBER_KINDS,
  NODE_ICON_KINDS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  UI_PALETTES,
  VIGNETTE_KINDS,
  ZONE_IDS,
  barFill,
  barStyle,
  buttonFrame,
  effectFor,
  eventVignette,
  floatingNumberStyle,
  keyAt,
  nodeIcon,
  particleSprites,
  plateFrame,
  prepareAmbient,
  prepareEffect,
  sampleAmbient,
  sampleEffect,
  sceneForZone,
  stageAnchors,
  wordmark,
  type EffectId,
  type NineSlice,
  type PreparedEffect,
  type UiTheme,
  type ZoneId,
  type ZoneScene,
} from '@kinfall/core/art/scene';
import { drawBackdrop, drawGrid, drawParticles, gridBitmap, tint } from './artRender';

const root = document.getElementById('art')!;
const params = new URLSearchParams(location.search);
const SCALE = Math.max(1, Math.min(6, Number(params.get('scale') ?? 3) || 3));
const onlyZone = params.get('zone');
const only = params.get('only');
const seed = params.get('seed') ?? 'preview';
const SPRITES = particleSprites();

let reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ---------------------------------------------------------------- page chrome

const style = document.createElement('style');
style.textContent = `
  :root { color-scheme: dark; --page: ${UI_PALETTES.dusk.page}; --text: ${UI_PALETTES.dusk.text}; }
  body { margin: 0; background: var(--page); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
  #art { padding: 16px; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 20px; } h2 { font-size: 17px; margin: 28px 0 8px; } h3 { font-size: 14px; margin: 12px 0 6px; }
  canvas { image-rendering: pixelated; max-width: 100%; display: block; }
  .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
  .cell { display: flex; flex-direction: column; gap: 4px; align-items: center; font-size: 12px; }
  .theme { padding: 16px; border-radius: 4px; }
  .theme.dusk { background: ${UI_PALETTES.dusk.page}; color: ${UI_PALETTES.dusk.text}; }
  .theme.parchment { background: ${UI_PALETTES.parchment.page}; color: ${UI_PALETTES.parchment.text}; }
  .px-btn, .px-plate { box-sizing: border-box; border-style: solid; image-rendering: pixelated; font: 600 15px/1.2 system-ui, sans-serif; }
  .px-btn { min-height: 44px; min-width: 120px; padding: 0 8px; cursor: pointer; background: none; }
  .px-btn:focus { outline: none; }
  .px-plate { padding: 4px; width: 260px; }
  .bar { position: relative; height: 21px; width: 200px; box-sizing: border-box; border-style: solid; image-rendering: pixelated; }
  .bar > i { position: absolute; inset: 0; right: auto; display: block; }
  .controls { position: sticky; top: 0; z-index: 2; background: var(--page); padding: 8px 0; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .num { font: 800 24px/1 ui-monospace, monospace; }
`;
document.head.append(style);

const h1 = document.createElement('h1');
h1.textContent = 'Kinfall art preview (dev only)';
root.append(h1);

const controls = document.createElement('div');
controls.className = 'controls';
controls.innerHTML = `<label><input type="checkbox" id="rm"> Reduce motion</label><span>seed <code>${seed}</code>, scale ${SCALE}</span>`;
root.append(controls);
const rm = controls.querySelector<HTMLInputElement>('#rm')!;
rm.checked = reduced;
rm.addEventListener('change', () => {
  reduced = rm.checked;
});

function section(title: string, id: string): HTMLElement | null {
  if (only !== null && only !== id) return null;
  const s = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = title;
  s.append(h);
  root.append(s);
  return s;
}

function canvasFor(parent: HTMLElement, w: number, h: number, scale = SCALE): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  c.setAttribute('aria-hidden', 'true');
  parent.append(c);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function caption(parent: HTMLElement, text: string): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'cell';
  parent.append(cell);
  const label = document.createElement('span');
  label.textContent = text;
  cell.append(label);
  return cell;
}

const loops: ((t: number) => void)[] = [];

// ---------------------------------------------------------------- creature drawing

interface Fx {
  flash: number;
  alpha: number;
  offset: { x: number; y: number };
  tint: { color: string; alpha: number } | null;
}
const NO_FX: Fx = { flash: 0, alpha: 1, offset: { x: 0, y: 0 }, tint: null };

/** Creature at STAGE.spriteScale, bottom-centred on the feet point; mirrored for the player. */
function drawCreature(ctx: CanvasRenderingContext2D, id: string, grid: PixelGrid, fx: number, fy: number, mirror: boolean, scale: number, sc: ZoneScene, f: Fx = NO_FX): void {
  const s = sc.stage.spriteScale;
  const x = (fx + f.offset.x - (grid.width * s) / 2) * scale;
  // Sprites keep one empty bottom row; sink by that row so the feet touch the platform.
  const y = (fy + f.offset.y - (grid.height - 1) * s) * scale;
  const w = grid.width * s * scale;
  const h = grid.height * s * scale;
  ctx.save();
  if (mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
  } else ctx.translate(x, y);
  ctx.globalAlpha = f.alpha;
  ctx.drawImage(gridBitmap(grid), 0, 0, w, h);
  if (f.tint && f.tint.alpha > 0) {
    ctx.globalAlpha = f.alpha * f.tint.alpha;
    ctx.drawImage(tint(`c:${id}`, grid, f.tint.color), 0, 0, w, h);
  }
  if (f.flash > 0) {
    ctx.globalAlpha = f.alpha * f.flash;
    ctx.drawImage(tint(`c:${id}`, grid, '#ffffff'), 0, 0, w, h);
  }
  ctx.restore();
}

/** One stage: backdrop, platforms, creatures, ambient, an optional looping effect on the enemy. */
function stage(parent: HTMLElement, sc: ZoneScene, scale: number, effects: EffectId[] | null, label?: (text: string) => void): void {
  const ctx = canvasFor(parent, SCENE_WIDTH, SCENE_HEIGHT, scale);
  const player = CONTENT.species[(sc.zone * 2) % CONTENT.species.length]!;
  const enemy = CONTENT.species[(sc.zone * 2 + 5) % CONTENT.species.length]!;
  const sprites = { player: generateCreature(player), enemy: generateCreature(enemy) };
  const amb = prepareAmbient(sc.ambient, sc.seed);
  const anchors = { player: stageAnchors('player'), enemy: stageAnchors('enemy') };
  const prepared = new Map<EffectId, PreparedEffect>();
  const prep = (id: EffectId) => {
    let p = prepared.get(id);
    if (!p) prepared.set(id, (p = prepareEffect(effectFor(id), seed)));
    return p;
  };
  const SLOT = 2000;
  loops.push((t) => {
    const cam = reduced ? 0 : Math.round(Math.sin(t / 3000) * 6);
    let frame: ReturnType<typeof sampleEffect> | null = null;
    let fxTarget: 'player' | 'enemy' | null = null;
    if (effects && effects.length > 0) {
      const id = effects[Math.floor(t / SLOT) % effects.length]!;
      const target = id === 'heal' || id === 'levelUp' || id === 'soulGain' || id === 'evolve' || id === 'recruit' ? 'player' : 'enemy';
      const src = target === 'enemy' ? 'player' : 'enemy';
      frame = sampleEffect(prep(id), {
        tMs: t % SLOT,
        target: anchors[target].centre,
        ground: anchors[target].feet,
        source: anchors[src].centre,
        facing: anchors[src].facing,
        reducedMotion: reduced,
      });
      label?.(`${id}${reduced ? ' (reduced motion)' : ''}`);
      fxTarget = target;
    }
    const shakeX = frame ? frame.shake.x : 0;
    const shakeY = frame ? frame.shake.y : 0;
    ctx.save();
    ctx.translate(shakeX * scale, shakeY * scale);
    drawBackdrop(ctx, sc.backdrop, 'back', scale, cam, reduced ? 0 : t);
    const parts = sampleAmbient(amb, t, reduced);
    drawParticles(ctx, parts.filter((p) => p.depth === 'back'), scale, SPRITES);
    for (const side of ['player', 'enemy'] as const) {
      const pl = sc.platforms[side];
      const a = anchors[side];
      drawGrid(ctx, pl.grid, a.feet.x - pl.anchor.x, a.feet.y - pl.anchor.y, scale);
      drawGrid(ctx, pl.shadow, a.feet.x - Math.floor(pl.shadow.width / 2), a.feet.y - Math.floor(pl.shadow.height / 2), scale);
      drawCreature(ctx, side, sprites[side], a.feet.x, a.feet.y, side === 'player', scale, sc, frame && fxTarget === side ? frame : NO_FX);
    }
    drawBackdrop(ctx, sc.backdrop, 'front', scale, cam, reduced ? 0 : t);
    drawParticles(ctx, parts.filter((p) => p.depth === 'front'), scale, SPRITES);
    if (frame) drawParticles(ctx, frame.particles, scale, SPRITES);
    ctx.restore();
    if (frame?.screen && frame.screen.alpha > 0) {
      ctx.globalAlpha = frame.screen.alpha;
      ctx.fillStyle = frame.screen.color;
      ctx.fillRect(0, 0, SCENE_WIDTH * scale, SCENE_HEIGHT * scale);
      ctx.globalAlpha = 1;
    }
    if (frame?.title && frame.title.alpha > 0) {
      // Victory/defeat title: real text in the page font, positioned by the effect's track.
      ctx.globalAlpha = frame.title.alpha;
      ctx.font = `800 ${12 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#120a14';
      const tx = (SCENE_WIDTH / 2) * scale;
      const ty = (40 + frame.title.offsetY) * scale;
      ctx.fillText(frame.screen ? 'Defeat' : 'Victory', tx + scale, ty + scale);
      ctx.fillStyle = '#fff6dc';
      ctx.fillText(frame.screen ? 'Defeat' : 'Victory', tx, ty);
      ctx.globalAlpha = 1;
    }
  });
}

// ---------------------------------------------------------------- 1. zone scenes

const scenes = section('Zone scenes (parallax sway, platforms, ambient life, effects cycling)', 'scenes');
if (scenes) {
  for (const zone of ZONE_IDS) {
    if (onlyZone !== null && String(zone) !== onlyZone) continue;
    const sc = sceneForZone(zone, seed);
    const h = document.createElement('h3');
    h.textContent = `Zone ${zone}: ${sc.palette.slug}`;
    const now = document.createElement('p');
    now.style.margin = '0 0 4px';
    scenes.append(h, now);
    stage(scenes, sc, SCALE, [...EFFECT_IDS], (text) => {
      if (now.textContent !== text) now.textContent = `Now playing: ${text}`;
    });
  }
}

// ---------------------------------------------------------------- 2. effects gallery

const fxSec = section('Effects (each loops; the target flashes, shakes or fades per its tracks)', 'effects');
if (fxSec) {
  const row = document.createElement('div');
  row.className = 'row';
  fxSec.append(row);
  const sc = sceneForZone(onlyZone !== null ? Number(onlyZone) : 1, seed);
  for (const id of EFFECT_IDS) {
    const cell = caption(row, id);
    stage(cell, sc, 1, [id]);
    cell.querySelector('canvas')?.setAttribute('style', `width:${256 * Number(params.get('fxscale') ?? 1)}px`);
    cell.append(cell.firstChild!);
  }
}

// ---------------------------------------------------------------- 3. frames (real DOM text)

function nineSliceCss(el: HTMLElement, ns: NineSlice, scale: number): void {
  const url = gridBitmap(ns.grid).toDataURL();
  const { left, top, right, bottom } = ns.slice;
  el.style.borderImage = `url(${url}) ${top} ${right} ${bottom} ${left} fill / ${top * scale}px ${right * scale}px ${bottom * scale}px ${left * scale}px`;
  el.style.borderWidth = `${top * scale}px ${right * scale}px ${bottom * scale}px ${left * scale}px`;
  el.style.color = ns.textColor;
}

const frames = section('HUD frames (nine-slice as CSS border-image; text is real text)', 'frames');
if (frames) {
  const both = document.createElement('div');
  both.className = 'row';
  frames.append(both);
  for (const theme of ['dusk', 'parchment'] as UiTheme[]) {
    const box = document.createElement('div');
    box.className = `theme ${theme}`;
    both.append(box);
    const h = document.createElement('h3');
    h.textContent = theme === 'dusk' ? 'Dusk (dark)' : 'Parchment (light)';
    box.append(h);
    for (const zone of [0, 1, 2] as ZoneId[]) {
      const plate = document.createElement('div');
      plate.className = 'px-plate';
      nineSliceCss(plate, plateFrame({ theme, zone }), 2);
      plate.innerHTML = `<strong>Cindermite</strong> <span>Lv 4</span>`;
      const hp = barStyle('hp', { theme, zone });
      const fc = barStyle('focus', { theme, zone });
      for (const [style, pct, name] of [[hp, 72, 'HP'], [hp, 40, 'HP'], [hp, 15, 'HP'], [fc, 60, 'Focus']] as const) {
        const line = document.createElement('div');
        line.style.display = 'flex';
        line.style.gap = '8px';
        line.style.alignItems = 'center';
        line.style.marginTop = '4px';
        const lab = document.createElement('span');
        lab.textContent = `${name} ${pct}%`;
        lab.style.minWidth = '72px';
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.setAttribute('aria-hidden', 'true');
        nineSliceCss(bar, style.frame, 2);
        const fill = document.createElement('i');
        fill.style.width = `${pct}%`;
        fill.style.background = `linear-gradient(${style.shine} 0 2px, ${barFill(style, pct)} 2px)`;
        bar.append(fill);
        line.append(lab, bar);
        plate.append(line);
      }
      box.append(plate);
      const btns = document.createElement('div');
      btns.className = 'row';
      btns.style.margin = '8px 0 16px';
      for (const state of BUTTON_STATES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-btn';
        b.textContent = state === 'normal' ? 'Ember Bite' : state[0]!.toUpperCase() + state.slice(1);
        b.disabled = state === 'disabled';
        nineSliceCss(b, buttonFrame(state, { theme, zone }), 2);
        btns.append(b);
      }
      box.append(btns);
    }
  }
}

// ---------------------------------------------------------------- 4. icons, vignettes, logo, numbers

const icons = section('Node icons (1x, 2x, 3x)', 'icons');
if (icons) {
  const both = document.createElement('div');
  both.className = 'row';
  icons.append(both);
  for (const theme of ['dusk', 'parchment'] as UiTheme[]) {
    const box = document.createElement('div');
    box.className = `theme ${theme} row`;
    both.append(box);
    for (const kind of NODE_ICON_KINDS) {
      const cell = caption(box, kind);
      for (const s of [1, 2, 3]) drawGrid(canvasFor(cell, 16, 16, s), nodeIcon(kind), 0, 0, s);
      cell.append(cell.firstChild!);
    }
  }
}

const vig = section('Event vignettes (per zone)', 'vignettes');
if (vig) {
  for (const zone of ZONE_IDS) {
    const row = document.createElement('div');
    row.className = 'row';
    vig.append(row);
    for (const kind of VIGNETTE_KINDS) {
      const cell = caption(row, `${kind} · zone ${zone}`);
      drawGrid(canvasFor(cell, 64, 40, 4), eventVignette(kind, zone, seed), 0, 0, 4);
      cell.append(cell.firstChild!);
    }
  }
}

const logo = section('Wordmark (2x and 3x, labelled image)', 'logo');
if (logo) {
  const mark = wordmark();
  const both = document.createElement('div');
  both.className = 'row';
  logo.append(both);
  for (const theme of ['dusk', 'parchment'] as UiTheme[]) {
    const box = document.createElement('div');
    box.className = `theme ${theme}`;
    both.append(box);
    for (const s of [...mark.scales, 4]) {
      const ctx = canvasFor(box, mark.grid.width, mark.grid.height, s);
      ctx.canvas.removeAttribute('aria-hidden');
      ctx.canvas.setAttribute('role', 'img');
      ctx.canvas.setAttribute('aria-label', mark.label);
      ctx.canvas.style.margin = '8px 0';
      drawGrid(ctx, mark.grid, 0, 0, s);
    }
  }
}

const nums = section('Floating numbers (real text, aria-hidden in the game)', 'numbers');
if (nums) {
  const box = document.createElement('div');
  box.className = 'theme dusk row';
  box.style.background = '#2f183c';
  nums.append(box);
  const els: [HTMLElement, ReturnType<typeof floatingNumberStyle>][] = [];
  for (const kind of FLOATING_NUMBER_KINDS) {
    const st = floatingNumberStyle(kind);
    const cell = caption(box, kind);
    cell.style.height = '80px';
    cell.style.justifyContent = 'flex-end';
    const n = document.createElement('span');
    n.className = 'num';
    n.textContent = `${st.prefix}${kind === 'soul' ? 3 : 27}`;
    n.style.color = st.fill;
    n.style.fontSize = `${st.sizePx * 3}px`;
    const o = st.outline;
    n.style.textShadow = `2px 0 ${o}, -2px 0 ${o}, 0 2px ${o}, 0 -2px ${o}, 2px 2px ${o}, -2px -2px ${o}, 2px -2px ${o}, -2px 2px ${o}, 3px 4px ${st.shadow}`;
    cell.prepend(n);
    els.push([n, st]);
  }
  loops.push((t) => {
    for (const [n, st] of els) {
      const local = t % 1400;
      if (reduced) {
        n.style.transform = '';
        n.style.opacity = local < st.reducedHoldMs ? '1' : '0';
        continue;
      }
      n.style.transform = `translateY(${keyAt(st.offsetY, local) * 3}px) scale(${keyAt(st.scale, local, 1)})`;
      n.style.opacity = String(keyAt(st.alpha, local, 1));
    }
  });
}

// ?at=MS freezes the clock (screenshots of one moment of every effect).
const at = params.get('at');
const frame = (t: number) => {
  for (const l of loops) l(at !== null ? Number(at) : t);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
