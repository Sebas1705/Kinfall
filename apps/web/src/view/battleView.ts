// PixiJS battle scene (presentation side). It draws what the sim's state and events say and never
// writes anything back: animation timing only changes visuals. Every animation also has a timeout
// fallback, and a hidden tab finishes them at once, so `play` always resolves.
//
// Look: the zone's parallax backdrop with a slow camera sway, ground platforms and shadows, the
// creatures at the stage anchors (player mirrored), ambient life, and the battle events' effects
// (element moves, hits, super effective or resisted, heals, faints, victory/defeat) sampled from
// @kinfall/core/art/scene. The HUD is DOM: two pixel plates with the names, elements, HP and Focus
// bars, status and the enemy's intent. Canvas and plates are decorative (aria-hidden): the same
// facts are in the summary, the log and the menu. Reduced motion: no sway, drift, shake or flash;
// effects and ambient life use the samplers' static variants.
import { Application, CanvasSource, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { generateCreature } from '@kinfall/core/art/creatureGen';
import { elementIcon } from '@kinfall/core/art/elementIcon';
import type { PixelGrid } from '@kinfall/core/art/palette';
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  STAGE,
  effectsForBattleEvent,
  particleSprites,
  prepareAmbient,
  sampleAmbient,
  sceneForZone,
  stageAnchors,
  type BackdropLayer,
  type DrawParticle,
  type ParticleSpriteId,
  type PreparedAmbient,
  type ZoneScene,
} from '@kinfall/core/art/scene';
import { CONTENT } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import type { StatusId } from '@kinfall/core/content';
import { speciesName, t } from '@kinfall/core/platform/i18n';
import type { BattleEvent, BattleState, Combatant, Side } from '@kinfall/core/sim/state';
import { intentText } from '@kinfall/core/models/menu';
import type { BattleScene } from '@kinfall/core/models/battleController';
import { layerShift } from '../art/canvas2d';
import { installFrames } from '../art/frames';
import { createFx, type FxFrame } from '../art/fx';
import { onMotionChange, reducedMotion } from '../art/motion';
import { cameraSway, sceneKeyOf, stageFrame, type StageFrame } from '../art/stageLayout';
import { createAnimator } from './animator';
import type { PlayContext } from './animator';
import { paintGrid } from './pixelCanvas';

export interface BattleView extends BattleScene {
  render(state: BattleState): void;
  play(events: BattleEvent[], opts: { reducedMotion: boolean }): Promise<void>;
  destroy(): void;
}

/** Ambient-only frames (sway, embers, fireflies) run at this rate; effects use the display rate. */
const AMBIENT_FPS = 30;
/** Sky rows hidden on narrow views (the enemy's head is at row 52, the victory title at 40). */
const NARROW_SKY_CROP = 26;
/** The most sky the console layout may trim to fit a short stage (the enemy's head is at row 52). */
const MAX_SKY_CROP = 50;
/** Fallback layout (the page scrolls): windows shorter than this (landscape phones) crop the sky as well. */
const SHORT_WINDOW_PX = 560;
/**
 * Console layout: the same crop, decided from the stage rect (the primary region the layout contract
 * plans for the scene) instead of the window. A region shorter than this cannot hold the whole
 * 144-row scene at 2x with its plates, so the top of the sky goes.
 */
const SHORT_STAGE_PX = 420;

/** Tiny status icons (shape and colour differ; the status name is always shown next to them). */
const STATUS_SHAPES: Record<StatusId, { color: string; rows: string[] }> = {
  scorch: { color: '#f08a3c', rows: ['..#..', '.##..', '.###.', '#####', '.###.'] },
  stun: { color: '#f2d14b', rows: ['...##', '..##.', '.####', '.##..', '##...'] },
};

function statusGrid(id: StatusId): PixelGrid {
  const { color, rows } = STATUS_SHAPES[id];
  const pixels = new Uint8Array(25);
  rows.forEach((row, y) => {
    for (let x = 0; x < 5; x++) if (row[x] === '#') pixels[y * 5 + x] = 1;
  });
  return { width: 5, height: 5, pixels, palette: ['#00000000', color] };
}

/** Canvas texture of a pixel grid with nearest-neighbour sampling; `silhouette` paints every pixel white. */
function gridTexture(grid: PixelGrid, silhouette = false): Texture {
  const canvas = document.createElement('canvas');
  paintGrid(canvas, grid, silhouette);
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) });
}

/** `#rrggbb[aa]` to the 0xrrggbb number Pixi tints take. */
const hexNum = (hex: string) => parseInt(hex.slice(1, 7), 16);

interface Shown {
  speciesId: string;
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  status: StatusId | null;
  fainted: boolean;
}

function shownOf(c: Combatant): Shown {
  return {
    speciesId: c.speciesId,
    hp: c.hp,
    maxHp: c.maxHp,
    focus: c.focus,
    maxFocus: c.maxFocus,
    status: c.status?.id ?? null,
    fainted: c.fainted,
  };
}

/** The DOM plate of one side (aria-hidden: the summary and log carry the same facts). */
interface Plate {
  root: HTMLElement;
  name: HTMLElement;
  tag: HTMLElement;
  elements: HTMLElement;
  hpLabel: HTMLElement;
  hpBar: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  focusLabel: HTMLElement;
  focusFill: HTMLElement;
  focusText: HTMLElement;
  status: HTMLElement;
  intent: HTMLElement | null;
}

interface SideView {
  shown: Shown | null;
  /** Moved by the animator (lunges, swaps, faints). */
  body: Container;
  /** Moved and faded by effects, inside `body`. */
  fx: Container;
  sprite: Sprite;
  tint: Sprite;
  flash: Sprite;
  platform: Sprite;
  shadow: Sprite;
  plate: Plate;
}

/** 0 -> 1 -> 0 over p in [0, 1]. */
const there = (p: number) => (p < 0.5 ? p * 2 : (1 - p) * 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makePlate(doc: Document, side: Side): Plate {
  const root = el(doc, 'div', `hud-plate hud-plate--${side}`);
  root.setAttribute('aria-hidden', 'true');
  const head = el(doc, 'div', 'hud-head');
  const name = el(doc, 'span', 'hud-name');
  const tag = el(doc, 'span', 'hud-tag');
  const elements = el(doc, 'span', 'hud-els');
  head.append(name, elements, tag);
  const bar = (kind: 'hp' | 'focus') => {
    const row = el(doc, 'div', 'hud-row');
    const label = el(doc, 'span', 'hud-label');
    const track = el(doc, 'span', `hud-bar hud-bar--${kind}`);
    const fill = el(doc, 'i', '');
    track.append(fill);
    const num = el(doc, 'span', 'hud-num');
    row.append(label, track, num);
    return { row, label, track, fill, num };
  };
  const hp = bar('hp');
  const focus = bar('focus');
  const status = el(doc, 'div', 'hud-status');
  const intent = side === 'enemy' ? el(doc, 'p', 'hud-intent') : null;
  const bars = el(doc, 'div', 'hud-bars');
  bars.append(hp.row, focus.row);
  root.append(head, bars, status);
  if (intent) root.append(intent);
  return {
    root, name, tag, elements, hpLabel: hp.label, hpBar: hp.track, hpFill: hp.fill, hpText: hp.num,
    focusLabel: focus.label, focusFill: focus.fill, focusText: focus.num, status, intent,
  };
}

/** A small decorative canvas of a pixel grid at 1:1 (CSS scales it crisply). */
function iconCanvas(doc: Document, grid: PixelGrid, cls: string): HTMLCanvasElement {
  const c = el(doc, 'canvas', cls);
  c.setAttribute('aria-hidden', 'true');
  paintGrid(c, grid);
  return c;
}

export async function createBattleView(host: HTMLElement): Promise<BattleView> {
  const doc = host.ownerDocument;
  installFrames(doc);
  const app = new Application();
  await app.init({
    width: Math.max(1, host.clientWidth),
    height: SCENE_HEIGHT,
    background: 0x140f1e,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1))),
    roundPixels: true,
    preference: ['webgl', 'canvas'],
    autoStart: false,
  });
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.classList.add('scene-canvas');
  host.classList.add('scene--art');

  const textures = new Map<string, Texture>();
  const texture = (key: string, make: () => PixelGrid, silhouette = false): Texture => {
    const k = `${key}${silhouette ? ':white' : ''}`;
    let tex = textures.get(k);
    if (!tex) {
      tex = gridTexture(make(), silhouette);
      textures.set(k, tex);
    }
    return tex;
  };
  const creatureTex = (id: string, white = false) =>
    texture(`creature:${id}`, () => generateCreature(lookup(CONTENT).species(id)), white);
  const masks = particleSprites();
  const particleTex = (id: ParticleSpriteId) => texture(`particle:${id}`, () => masks[id]);

  // ---- display tree: world (scaled to scene px, shaken) holds everything but text ----
  const world = new Container();
  const backLayers = new Container();
  const backAmbient = new Container();
  const actors = new Container();
  const frontLayers = new Container();
  const frontAmbient = new Container();
  const fxParticles = new Container();
  const wash = new Graphics();
  world.addChild(backLayers, backAmbient, actors, frontLayers, frontAmbient, fxParticles, wash);
  const overlay = new Container();
  app.stage.addChild(world, overlay);

  const makeSide = (side: Side): SideView => {
    const platform = new Sprite(Texture.EMPTY);
    const shadow = new Sprite(Texture.EMPTY);
    const body = new Container();
    const fx = new Container();
    const sprite = new Sprite(Texture.EMPTY);
    const tint = new Sprite(Texture.EMPTY);
    const flash = new Sprite(Texture.EMPTY);
    for (const s of [sprite, tint, flash]) {
      s.anchor.set(0.5, 1);
      // Sprites keep one empty bottom row: sink by it so the feet touch the platform.
      s.position.set(0, STAGE.spriteScale);
      s.scale.set(side === 'player' ? -STAGE.spriteScale : STAGE.spriteScale, STAGE.spriteScale);
    }
    tint.alpha = 0;
    flash.alpha = 0;
    fx.addChild(sprite, tint, flash);
    body.addChild(fx);
    actors.addChild(platform, shadow, body);
    return { shown: null, body, fx, sprite, tint, flash, platform, shadow, plate: makePlate(doc, side) };
  };
  const sides: Record<Side, SideView> = { enemy: makeSide('enemy'), player: makeSide('player') };
  // DOM order: enemy plate, canvas, player plate (CSS places them).
  host.append(sides.enemy.plate.root, canvas, sides.player.plate.root);

  // ---- scene art (per zone and run seed) ----
  let scene: ZoneScene | null = null;
  let sceneKey = '';
  let ambient: PreparedAmbient | null = null;
  let layerNodes: { layer: BackdropLayer; node: Sprite | TilingSprite }[] = [];
  let frame: StageFrame = stageFrame(Math.max(1, host.clientWidth));
  let fx = createFx('battle');

  const useScene = (state: BattleState) => {
    const key = sceneKeyOf(state.seed);
    const id = `${key.zone}|${key.seed}`;
    if (id === sceneKey) return;
    sceneKey = id;
    for (const { node } of layerNodes) node.destroy();
    layerNodes = [];
    for (const [k, tex] of textures) {
      if (k.startsWith('scene:')) {
        tex.destroy(true);
        textures.delete(k);
      }
    }
    scene = sceneForZone(key.zone, key.seed);
    ambient = prepareAmbient(scene.ambient, key.seed);
    fx = createFx(key.seed);
    app.renderer.background.color = hexNum(scene.palette.sky[0] ?? '#140f1e');
    scene.backdrop.layers.forEach((layer, i) => {
      const tex = texture(`scene:${id}:layer${i}`, () => layer.grid);
      const node = layer.tileX ? new TilingSprite({ texture: tex, width: layer.grid.width, height: layer.grid.height }) : new Sprite(tex);
      (layer.depth === 'front' ? frontLayers : backLayers).addChild(node);
      layerNodes.push({ layer, node });
    });
    for (const side of ['player', 'enemy'] as const) {
      const v = sides[side];
      const pl = scene.platforms[side];
      const a = stageAnchors(side);
      v.platform.texture = texture(`scene:${id}:platform:${side}`, () => pl.grid);
      v.platform.position.set(a.feet.x - pl.anchor.x, a.feet.y - pl.anchor.y);
      v.shadow.texture = texture(`scene:${id}:shadow:${side}`, () => pl.shadow);
      v.shadow.position.set(a.feet.x - Math.floor(pl.shadow.width / 2), a.feet.y - Math.floor(pl.shadow.height / 2));
    }
    host.dataset.zone = String(scene.zone);
  };

  let lastState: BattleState | null = null;
  let destroyed = false;
  let clock = 0;
  let onScreen = true;
  let reduced = reducedMotion(doc);

  // ---- per-frame drawing ----
  const pools = new Map<Container, Sprite[]>();
  const drawParticles = (layer: Container, list: DrawParticle[]) => {
    let pool = pools.get(layer);
    if (!pool) pools.set(layer, (pool = []));
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      let s = pool[i];
      if (!s) {
        s = new Sprite(Texture.EMPTY);
        layer.addChild(s);
        pool.push(s);
      }
      const mask = masks[p.sprite];
      s.texture = particleTex(p.sprite);
      s.tint = hexNum(p.color);
      s.alpha = p.alpha;
      s.scale.set(p.size);
      s.position.set(Math.round(p.x - (mask.width * p.size) / 2), Math.round(p.y - (mask.height * p.size) / 2));
      s.visible = true;
    }
    for (let i = list.length; i < pool.length; i++) pool[i]!.visible = false;
  };

  const texts: Text[] = [];
  const textAt = (i: number): Text => {
    let txt = texts[i];
    if (!txt) {
      txt = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: 12, fill: 0xffffff } });
      txt.anchor.set(0.5);
      overlay.addChild(txt);
      texts.push(txt);
    }
    return txt;
  };

  const applyFx = (f: FxFrame) => {
    const s = frame.scale;
    for (const side of ['player', 'enemy'] as const) {
      const v = sides[side];
      const b = f.bodies[side];
      v.fx.position.set(b.offset.x, b.offset.y);
      v.fx.alpha = b.alpha;
      v.flash.alpha = b.flash;
      v.tint.alpha = b.tint ? b.tint.alpha : 0;
      if (b.tint) v.tint.tint = hexNum(b.tint.color);
    }
    drawParticles(fxParticles, f.particles);
    wash.clear();
    if (f.screen && f.screen.alpha > 0) {
      wash.rect(frame.originX - 4, -4, frame.viewWidth + 8, SCENE_HEIGHT + 8).fill({ color: hexNum(f.screen.color), alpha: f.screen.alpha });
    }
    world.position.set((-frame.originX + f.shake.x) * s, (-frame.originY + f.shake.y) * s);
    let n = 0;
    if (f.title && f.title.alpha > 0) {
      const txt = textAt(n++);
      txt.text = f.title.text;
      txt.style.fontSize = Math.max(22, 16 * s);
      txt.style.fill = 0xfff6dc;
      txt.style.stroke = { color: 0x120a14, width: Math.max(3, s * 2), join: 'round' };
      txt.style.dropShadow = { color: 0x000000, distance: s, angle: Math.PI / 2, blur: 0, alpha: 1 };
      txt.alpha = f.title.alpha;
      txt.scale.set(1);
      txt.position.set((128 - frame.originX) * s, (Math.max(frame.originY + 16, 40) - frame.originY + f.title.offsetY) * s);
      txt.visible = true;
    }
    for (const num of f.numbers) {
      const txt = textAt(n++);
      txt.text = num.text;
      txt.style.fontSize = Math.max(12, num.style.sizePx * s);
      txt.style.fill = hexNum(num.style.fill);
      txt.style.stroke = { color: hexNum(num.style.outline), width: Math.max(2, s * 2), join: 'round' };
      txt.style.dropShadow = { color: hexNum(num.style.shadow), distance: Math.max(1, s), angle: Math.PI / 2, blur: 0, alpha: 1 };
      txt.alpha = num.alpha;
      txt.scale.set(Math.max(1, Math.round(num.scale * 4) / 4));
      txt.position.set((num.x - frame.originX) * s, (num.y - frame.originY) * s);
      txt.visible = true;
    }
    for (let i = n; i < texts.length; i++) texts[i]!.visible = false;
  };

  /** Draws everything at the scene clock (no render; the ticker or `redraw` renders). */
  const update = () => {
    if (!scene || !ambient) return;
    const cam = cameraSway(clock, reduced);
    for (const { layer, node } of layerNodes) {
      const shift = layerShift(layer.parallax, reduced ? 0 : layer.driftPxPerSec, cam, reduced ? 0 : clock);
      if (node instanceof TilingSprite) node.tilePosition.x = layer.x + shift - node.x;
      else node.x = layer.x + shift;
    }
    const parts = sampleAmbient(ambient, clock, reduced);
    drawParticles(backAmbient, parts.filter((p) => p.depth === 'back'));
    drawParticles(frontAmbient, parts.filter((p) => p.depth === 'front'));
    applyFx(fx.frame(clock));
  };

  // ---- ticker: runs while something animates or the scene is alive on screen ----
  const wantsFrames = () => !destroyed && !doc.hidden && onScreen && (animator.active > 0 || fx.busy(clock) || !reduced);
  const updateTicker = () => {
    const effects = animator.active > 0 || fx.busy(clock);
    app.ticker.maxFPS = effects ? 0 : AMBIENT_FPS;
    const want = wantsFrames();
    host.dataset.motion = reduced ? 'reduced' : 'full';
    host.dataset.ticker = want ? 'running' : 'stopped';
    if (want && !app.ticker.started) app.ticker.start();
    else if (!want && app.ticker.started) {
      app.ticker.stop();
      redraw();
    }
  };

  // Frames drive the animator only while something animates; idle reduced-motion scenes are drawn on demand.
  const animator = createAnimator({
    fallbackMs: 150,
    onStart: () => updateTicker(),
    onIdle: () => {
      updateTicker();
      redraw();
    },
  });

  const redraw = () => {
    if (destroyed || app.ticker.started) return;
    update();
    app.render();
  };

  // The primary region the scene lives in: only in the console layout, where it is a fixed rect.
  // `chrome` is what the stacked HUD plates and the canvas border take of its height; on wide
  // stages the plates float over the sky and take none.
  const stageEl = host.parentElement;
  const stageRegion = (): { height: number; chrome: number } | null => {
    const appEl = doc.querySelector<HTMLElement>('.app');
    if (!stageEl || appEl?.dataset.mode !== 'console') return null;
    const hostStyle = getComputedStyle(host);
    const stacked = getComputedStyle(sides.enemy.plate.root).position !== 'absolute';
    let chrome = 4; // the canvas border, top and bottom
    if (stacked) {
      const gap = parseFloat(hostStyle.rowGap) || 0;
      for (const side of ['enemy', 'player'] as const) {
        const root = sides[side].plate.root;
        if (!root.hidden) chrome += root.offsetHeight + gap;
      }
    }
    return { height: stageEl.clientHeight, chrome };
  };

  // The one-line log message floats over the canvas's bottom edge, wherever the stacked plates put
  // the canvas: publish that edge (px from the stage's top) for the CSS.
  const anchorMessage = (on: boolean) => {
    const battleEl = stageEl?.parentElement;
    if (!battleEl || !stageEl) return;
    if (!on) {
      battleEl.style.removeProperty('--scene-bottom');
      return;
    }
    const edge = canvas.getBoundingClientRect().bottom - stageEl.getBoundingClientRect().top;
    battleEl.style.setProperty('--scene-bottom', `${Math.round(edge)}px`);
  };

  // Metrics recomputed by layout().
  const layout = () => {
    // The canvas may bleed into the page padding on phones (negative margins in art.css): its
    // width is the host's plus that bleed, minus its own border.
    const cs = getComputedStyle(canvas);
    const px = (v: string) => parseFloat(v) || 0;
    const extra = -px(cs.marginLeft) - px(cs.marginRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth);
    const W = Math.max(1, Math.floor((host.clientWidth || 320) + extra));
    // Phones (a view narrower than the scene, or a short landscape window) trim the top of the sky
    // so the menu stays close.
    const region = stageRegion();
    const full = stageFrame(W);
    const short = region ? region.height < SHORT_STAGE_PX : (doc.defaultView?.innerHeight ?? 1000) < SHORT_WINDOW_PX;
    const cropped = full.viewWidth < SCENE_WIDTH || short;
    let crop = cropped ? NARROW_SKY_CROP : 0;
    // In the console layout the picture must fit the stage rect: when even 1x does not fit, more sky
    // goes (never more than MAX_SKY_CROP, so the heads stay in view); then the largest whole-number
    // scale whose rows (plus the stacked plates, if any) still fit its height.
    if (region) crop = Math.min(MAX_SKY_CROP, Math.max(crop, SCENE_HEIGHT - Math.floor(region.height - region.chrome)));
    const rawScale = region ? (region.height - region.chrome) / (SCENE_HEIGHT - crop) : Number.POSITIVE_INFINITY;
    const maxScale = Number.isFinite(rawScale) || rawScale === Number.POSITIVE_INFINITY ? rawScale : Number.POSITIVE_INFINITY;
    frame = cropped || region ? stageFrame(W, crop, undefined, maxScale) : full;
    const H = frame.viewHeight * frame.scale;
    app.renderer.resize(W, H);
    anchorMessage(region !== null);
    world.scale.set(frame.scale);
    for (const { layer, node } of layerNodes) {
      if (node instanceof TilingSprite) {
        node.position.set(frame.originX - 1, layer.y);
        node.width = frame.viewWidth + 2;
      } else node.y = layer.y;
    }
    for (const side of ['player', 'enemy'] as const) {
      const v = sides[side];
      const a = stageAnchors(side);
      v.body.position.set(a.feet.x, a.feet.y);
      setCreature(side);
      resetBody(side);
      drawHud(side);
    }
  };

  // What the frame depends on: the host width and, in the console layout, the stage rect.
  const fitKey = (): string => {
    const region = stageRegion();
    return `${Math.round(host.clientWidth)}|${region ? `${region.height}|${region.chrome}` : '-'}`;
  };
  let fit = '';
  const tick = () => {
    clock += app.ticker.deltaMS;
    animator.tick(app.ticker.deltaMS);
    update();
    const fps = animator.active > 0 || fx.busy(clock) ? 0 : AMBIENT_FPS;
    if (app.ticker.maxFPS !== fps) app.ticker.maxFPS = fps;
    // Effects finished and nothing else moves (reduced motion): stop asking for frames.
    if (!wantsFrames()) queueMicrotask(updateTicker);
  };
  app.ticker.add(tick);

  // ---- HUD (DOM plates) ----
  const setPct = (fill: HTMLElement, value: number, max: number) => {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    fill.style.width = `${pct}%`;
    return pct;
  };

  const drawHud = (side: Side, barsOnly = false) => {
    const v = sides[side];
    const s = v.shown;
    const p = v.plate;
    p.root.hidden = s === null;
    v.body.visible = s !== null;
    if (!s) return;
    const hp = Math.round(s.hp);
    const pct = setPct(p.hpFill, hp, s.maxHp);
    p.hpBar.dataset.level = pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low';
    p.hpText.textContent = `${hp}/${s.maxHp}`;
    const focus = Math.round(s.focus);
    setPct(p.focusFill, focus, s.maxFocus);
    p.focusText.textContent = `${focus}/${s.maxFocus}`;
    if (barsOnly) return;
    const sp = lookup(CONTENT).species(s.speciesId);
    p.name.textContent = speciesName(sp);
    p.tag.textContent = t(side === 'player' ? 'hud.player' : 'hud.enemy');
    p.hpLabel.textContent = t('hud.hp');
    p.focusLabel.textContent = t('hud.focus');
    p.elements.replaceChildren(
      ...sp.elements.flatMap((e) => [iconCanvas(doc, elementIcon(e), 'hud-icon'), el(doc, 'span', 'hud-el', t(`element.${e}`))]),
    );
    if (s.status) p.status.replaceChildren(iconCanvas(doc, statusGrid(s.status), 'hud-icon'), el(doc, 'span', '', t(`status.${s.status}`)));
    else p.status.replaceChildren();
    p.status.hidden = s.status === null;
    if (p.intent) {
      const text = lastState ? intentText(lastState, CONTENT) : null;
      p.intent.textContent = text === null ? '' : `» ${text}`;
      p.intent.hidden = text === null;
    }
  };

  const setCreature = (side: Side) => {
    const v = sides[side];
    if (!v.shown) return;
    v.sprite.texture = creatureTex(v.shown.speciesId);
    v.tint.texture = creatureTex(v.shown.speciesId, true);
    v.flash.texture = creatureTex(v.shown.speciesId, true);
  };

  const resetBody = (side: Side) => {
    const v = sides[side];
    const a = stageAnchors(side);
    v.body.position.set(a.feet.x, a.feet.y);
    v.body.alpha = v.shown?.fainted ? 0 : 1;
  };

  // ---- visibility, motion setting, resize ----
  const onVisibility = () => {
    // A hidden tab gets no frames: finish now and play the rest of this turn instantly.
    if (doc.hidden) {
      animator.setInstant(true);
      animator.finishAll();
    }
    updateTicker();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  const stopMotionWatch = onMotionChange(doc, () => {
    if (destroyed) return;
    reduced = reducedMotion(doc);
    updateTicker();
    redraw();
  });

  const intersection =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          onScreen = entries.some((e) => e.isIntersecting);
          updateTicker();
        });
  intersection?.observe(canvas);

  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (destroyed) return;
          if (fitKey() !== fit) {
            fit = fitKey();
            layout();
            redraw();
          }
        });
  observer?.observe(host);
  // The stage rect (console layout) and the plates stacked around the canvas change the room it has.
  if (stageEl) observer?.observe(stageEl);
  observer?.observe(sides.enemy.plate.root);
  observer?.observe(sides.player.plate.root);

  // ---- event animations -------------------------------------------------------------------------
  const tweenHp = (ctx: PlayContext, side: Side, to: number) => {
    const s = sides[side].shown;
    if (!s) return Promise.resolve();
    const from = s.hp;
    const target = Math.max(0, Math.min(s.maxHp, to));
    return ctx.animate(380, (p) => {
      s.hp = lerp(from, target, p);
      drawHud(side, true);
    });
  };

  /** Starts the decorative effects of an event (they never delay the turn). */
  const startEffects = (e: BattleEvent, instant: boolean) => {
    if (instant && doc.hidden) return;
    const motionOff = reduced || instant;
    for (const eff of effectsForBattleEvent(e, CONTENT)) {
      const end = eff.effect === 'victory' || eff.effect === 'defeat';
      fx.add(eff.effect, clock, {
        target: eff.target,
        ...(eff.source ? { source: eff.source } : {}),
        reducedMotion: motionOff,
        particlesOnly: eff.effect === 'faint',
        ...(end ? { title: t(eff.effect === 'victory' ? 'result.victory' : 'result.defeat'), hold: true } : {}),
      });
    }
    if (e.type === 'damage') {
      const kind = e.effectiveness >= 200 ? 'superEffective' : e.effectiveness <= 50 ? 'resisted' : 'damage';
      fx.number(kind, e.amount, e.side, clock, motionOff);
    } else if (e.type === 'heal') fx.number('heal', e.amount, e.side, clock, motionOff);
    updateTicker();
  };

  /** Animates one event. After every await it checks `ctx.live()` so a cancelled play stops touching the scene. */
  const playEvent = async (e: BattleEvent, ctx: PlayContext) => {
    startEffects(e, animator.isInstant());
    switch (e.type) {
      case 'move': {
        const v = sides[e.side];
        const a = stageAnchors(e.side);
        const reach = 8;
        const dir = e.side === 'player' ? 1 : -1;
        await ctx.animate(260, (p) => {
          const k = p >= 1 ? 0 : there(p);
          v.body.position.set(Math.round(a.feet.x + dir * reach * k), Math.round(a.feet.y - dir * (reach / 2) * k));
        });
        return;
      }
      case 'damage': {
        const s = sides[e.side].shown;
        if (!s) return;
        await tweenHp(ctx, e.side, s.hp - e.amount);
        return;
      }
      case 'heal': {
        const s = sides[e.side].shown;
        if (!s) return;
        await tweenHp(ctx, e.side, s.hp + e.amount);
        return;
      }
      case 'status': {
        const s = sides[e.side].shown;
        if (s) s.status = e.status;
        drawHud(e.side);
        await ctx.animate(220, () => {});
        return;
      }
      case 'skip': {
        const s = sides[e.side].shown;
        if (s && s.status === 'stun') s.status = null;
        drawHud(e.side);
        await ctx.animate(300, () => {});
        return;
      }
      case 'swap': {
        const v = sides[e.side];
        const next = lastState?.teams[e.side][e.toIndex];
        if (!next) return;
        const from = v.body.alpha;
        await ctx.animate(160, (p) => {
          v.body.alpha = from * (1 - p);
        });
        if (!ctx.live()) return;
        v.shown = shownOf(next);
        setCreature(e.side);
        drawHud(e.side);
        await ctx.animate(160, (p) => {
          v.body.alpha = p;
        });
        if (!ctx.live()) return;
        resetBody(e.side);
        return;
      }
      case 'fainted': {
        const v = sides[e.side];
        const a = stageAnchors(e.side);
        if (v.shown) {
          v.shown.hp = 0;
          v.shown.fainted = true;
          v.shown.status = null;
        }
        drawHud(e.side);
        await ctx.animate(360, (p) => {
          v.body.alpha = lerp(1, 0, p);
          v.body.position.set(a.feet.x, a.feet.y + Math.round(10 * p));
        });
        return;
      }
      default:
        return;
    }
  };

  const view: BattleView = {
    render(state: BattleState) {
      if (destroyed) return;
      // The real state wins: a play still running is cancelled before the scene is rebuilt.
      animator.cancel();
      // A different battle (new seed or an earlier turn) drops the old battle's effects.
      if (lastState && (lastState.seed !== state.seed || state.turn < lastState.turn)) fx.clear();
      lastState = state;
      // The page may sync its reduce-motion toggle after creating the view (no change event).
      reduced = reducedMotion(doc);
      useScene(state);
      for (const side of ['player', 'enemy'] as const) {
        const c = state.teams[side][state.active[side]];
        sides[side].shown = c ? shownOf(c) : null;
      }
      fit = fitKey();
      layout();
      updateTicker();
      redraw();
    },
    async play(events: BattleEvent[], opts: { reducedMotion: boolean }) {
      if (destroyed) return;
      reduced = reducedMotion(doc) || opts.reducedMotion;
      try {
        await animator.play(events, playEvent, opts.reducedMotion || doc.hidden);
      } finally {
        updateTicker();
        redraw();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      animator.dispose();
      doc.removeEventListener('visibilitychange', onVisibility);
      stopMotionWatch();
      observer?.disconnect();
      intersection?.disconnect();
      app.ticker.remove(tick);
      app.destroy({ removeView: true }, { children: true });
      for (const tex of textures.values()) tex.destroy(true);
      textures.clear();
      sides.enemy.plate.root.remove();
      sides.player.plate.root.remove();
      host.classList.remove('scene--art');
    },
  };
  return view;
}
