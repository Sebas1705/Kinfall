// Canvas 2D scene for the DOM screens (title hero, map banner, end scene): the zone backdrop with
// camera sway, cloud drift and ambient life, optional creatures on the platforms and an optional
// one-shot effect (victory / defeat). One shared frame loop runs at 30 fps only while a scene is on
// screen, the tab is visible and motion is allowed; with reduced motion each scene is drawn once,
// still, from the samplers' static variants. The canvases are decorative (aria-hidden).
import { generateCreature } from '@kinfall/core/art/creatureGen';
import type { PixelGrid } from '@kinfall/core/art/palette';
import {
  STAGE,
  particleSprites,
  prepareAmbient,
  sampleAmbient,
  sceneForZone,
  stageAnchors,
  type EffectId,
  type PreparedAmbient,
  type ZoneScene,
} from '@kinfall/core/art/scene';
import type { SpeciesDef } from '@kinfall/core/content';
import type { Side } from '@kinfall/core/sim/state';
import { drawBackdrop, drawGrid, drawParticles, gridBitmap, tint } from './canvas2d';
import { createFx, type Fx } from './fx';
import { reducedMotion } from './motion';
import { cameraSway, stageFrame, type StageFrame } from './stageLayout';

const FRAME_MS = 1000 / 30;
const SPRITES = particleSprites();

export interface SceneCreature {
  species: SpeciesDef;
  /** Drawn as a dark silhouette (an unknown foe). */
  silhouette?: boolean;
}

export interface ScenePlayerOptions {
  zone: number;
  seed: string;
  className: string;
  /** Scene rows to skip at the top and rows to show (a banner shows a slice of the scene). */
  cropTop?: number;
  rows?: number;
  /** Platforms (and creatures on them) are drawn when this is set. */
  stage?: Partial<Record<Side, SceneCreature | null>>;
  /** A one-shot effect on the whole screen, with its real-text title. */
  effect?: { id: EffectId; title: string };
}

export interface ScenePlayer {
  canvas: HTMLCanvasElement;
  /** Replaces the creature on one side (title screen: the chosen starter). */
  setCreature(side: Side, creature: SceneCreature | null): void;
  /** Draws the current frame now. */
  draw(): void;
  dispose(): void;
}

interface Live {
  player: ScenePlayer;
  visible: boolean;
  frame(now: number): void;
}

const live = new Set<Live>();
let raf = 0;
let last = 0;

function loop(now: number): void {
  raf = 0;
  if (!shouldRun()) return;
  if (now - last >= FRAME_MS - 1) {
    last = now;
    for (const l of live) if (l.visible) l.frame(now);
  }
  raf = requestAnimationFrame(loop);
}

function shouldRun(): boolean {
  if (typeof document === 'undefined' || document.hidden || reducedMotion(document)) return false;
  for (const l of live) if (l.visible) return true;
  return false;
}

/** Starts or stops the shared loop after a visibility, motion or membership change. */
export function wakeScenes(): void {
  if (shouldRun()) {
    if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
  } else if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  // Still scenes (reduced motion, hidden tab) are drawn once in their current state.
  if (!raf) for (const l of live) if (l.visible) l.player.draw();
}

/** Number of scenes currently registered (tests and diagnostics). */
export function sceneCount(): number {
  return live.size;
}

/** True while the shared frame loop is scheduled. */
export function scenesAnimating(): boolean {
  return raf !== 0;
}

const sceneCache = new Map<string, ZoneScene>();
function cachedScene(zone: number, seed: string): ZoneScene {
  const key = `${zone}|${seed}`;
  let sc = sceneCache.get(key);
  if (!sc) {
    sc = sceneForZone(zone, seed);
    // Keep the last few scenes only (a run visits three zones).
    if (sceneCache.size >= 4) sceneCache.delete(sceneCache.keys().next().value!);
    sceneCache.set(key, sc);
  }
  return sc;
}

export function createScenePlayer(doc: Document, opts: ScenePlayerOptions): ScenePlayer {
  const canvas = doc.createElement('canvas');
  canvas.className = opts.className;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  const sc = cachedScene(opts.zone, opts.seed);
  const ambient: PreparedAmbient = prepareAmbient(sc.ambient, sc.seed);
  const creatures: Partial<Record<Side, { grid: PixelGrid; id: string; silhouette: boolean } | null>> = {};
  const setCreature = (side: Side, c: SceneCreature | null | undefined) => {
    creatures[side] = c ? { grid: generateCreature(c.species), id: c.species.id, silhouette: c.silhouette === true } : null;
  };
  for (const side of ['player', 'enemy'] as const) setCreature(side, opts.stage?.[side]);

  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  let fx: Fx | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  if (opts.effect) {
    fx = createFx(opts.seed);
    const still = reducedMotion(doc);
    fx.add(opts.effect.id, 0, { target: 'screen', reducedMotion: still, title: opts.effect.title, hold: true });
    // A still effect shows its frozen frame for a moment, then only the held title stays.
    if (still) holdTimer = setTimeout(() => entry.player.draw(), 1300);
  }

  let frame: StageFrame = stageFrame(320, opts.cropTop ?? 0, opts.rows);
  let dpr = 1;
  let cssWidth = 0;

  const resize = (): boolean => {
    const parent = canvas.parentElement;
    const w = Math.floor(parent?.clientWidth ?? 0);
    if (w <= 0 || w === cssWidth) return w > 0;
    cssWidth = w;
    dpr = Math.min(3, Math.max(1, Math.round(doc.defaultView?.devicePixelRatio || 1)));
    frame = stageFrame(w, opts.cropTop ?? 0, opts.rows);
    canvas.width = w * dpr;
    canvas.height = frame.viewHeight * frame.scale * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${frame.viewHeight * frame.scale}px`;
    return true;
  };

  const drawCreature = (side: Side) => {
    const c = creatures[side];
    if (!ctx || !c) return;
    const s = frame.scale * dpr;
    const a = stageAnchors(side);
    const k = STAGE.spriteScale;
    const x = (a.feet.x - (c.grid.width * k) / 2) * s;
    const y = (a.feet.y - (c.grid.height - 1) * k) * s;
    const w = c.grid.width * k * s;
    const h = c.grid.height * k * s;
    ctx.save();
    if (side === 'player') {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
    } else ctx.translate(x, y);
    const img = c.silhouette ? tint(`c:${c.id}`, c.grid, '#140e1c') : gridBitmap(c.grid);
    ctx.globalAlpha = c.silhouette ? 0.85 : 1;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const render = (now: number) => {
    if (!ctx || !resize()) return;
    const reduced = reducedMotion(doc);
    const t = reduced ? 0 : now - started;
    const s = frame.scale * dpr;
    const f = fx?.frame(now - started) ?? null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate((-frame.originX + (f?.shake.x ?? 0)) * s, (-frame.originY + (f?.shake.y ?? 0)) * s);
    const cam = cameraSway(t, reduced);
    const from = frame.originX - 1;
    const to = frame.originX + frame.viewWidth + 1;
    drawBackdrop(ctx, sc.backdrop, 'back', s, cam, t, to, from);
    const parts = sampleAmbient(ambient, t, reduced);
    drawParticles(ctx, parts.filter((p) => p.depth === 'back'), s, SPRITES);
    if (opts.stage) {
      for (const side of ['player', 'enemy'] as const) {
        const pl = sc.platforms[side];
        const a = stageAnchors(side);
        drawGrid(ctx, pl.grid, a.feet.x - pl.anchor.x, a.feet.y - pl.anchor.y, s);
        drawGrid(ctx, pl.shadow, a.feet.x - Math.floor(pl.shadow.width / 2), a.feet.y - Math.floor(pl.shadow.height / 2), s);
        drawCreature(side);
      }
    }
    drawBackdrop(ctx, sc.backdrop, 'front', s, cam, t, to, from);
    drawParticles(ctx, parts.filter((p) => p.depth === 'front'), s, SPRITES);
    if (f) {
      drawParticles(ctx, f.particles, s, SPRITES);
      if (f.screen && f.screen.alpha > 0) {
        ctx.globalAlpha = f.screen.alpha;
        ctx.fillStyle = f.screen.color;
        ctx.fillRect((frame.originX - 4) * s, (frame.originY - 4) * s, (frame.viewWidth + 8) * s, (frame.viewHeight + 8) * s);
        ctx.globalAlpha = 1;
      }
      if (f.title && f.title.alpha > 0) {
        // Victory / defeat: real (localized) text, positioned by the effect's title track.
        const size = Math.max(22 * dpr, 16 * s);
        ctx.globalAlpha = f.title.alpha;
        ctx.font = `800 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = 128 * s;
        const ty = (Math.max(frame.originY + 24, 46) + f.title.offsetY) * s;
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, s * 2);
        ctx.strokeStyle = '#120a14';
        ctx.fillStyle = '#000000';
        ctx.fillText(f.title.text, tx, ty + s);
        ctx.strokeText(f.title.text, tx, ty);
        ctx.fillStyle = '#fff6dc';
        ctx.fillText(f.title.text, tx, ty);
        ctx.globalAlpha = 1;
      }
    }
  };

  const entry: Live = {
    visible: false,
    frame: render,
    player: {
      canvas,
      setCreature(side, c) {
        setCreature(side, c);
        entry.player.draw();
      },
      draw: () => render(typeof performance !== 'undefined' ? performance.now() : 0),
      dispose() {
        clearTimeout(holdTimer);
        live.delete(entry);
        io?.disconnect();
        ro?.disconnect();
        wakeScenes();
      },
    },
  };

  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          entry.visible = entries.some((e) => e.isIntersecting);
          wakeScenes();
        });
  io?.observe(canvas);
  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (canvas.isConnected) entry.player.draw();
        });
  queueMicrotask(() => {
    if (canvas.parentElement) ro?.observe(canvas.parentElement);
    entry.player.draw();
  });
  if (!io) entry.visible = true;
  live.add(entry);
  return entry.player;
}
