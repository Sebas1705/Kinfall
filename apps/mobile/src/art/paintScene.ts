// Draws one frame of a zone scene into a Skia canvas in device pixels, in the order of the spec
// (section 4): back layers, back ambient particles, platforms, shadows, creatures, front layers,
// front ambient particles, effect particles, the screen wash, then the decorative numbers and the
// result title. Positions are whole scene pixels times a whole-number scale, sampled nearest.
import type { PixelGrid } from '@kinfall/core/art/palette';
import {
  ICON_OUTLINE,
  STAGE,
  particleSprites,
  sampleAmbient,
  stageAnchors,
  type DrawParticle,
  type PreparedAmbient,
  type ZoneScene,
} from '@kinfall/core/art/scene';
import type { Side } from '@kinfall/core/sim/state';
import type { SkCanvas } from '@shopify/react-native-skia';

import type { BodyFx, FxFrame } from './fx';
import { alphaPaint, artFont, drawImage, fillPaint, gridImage, tintPaint } from './skia';
import { cameraSway, layerShift, tileStarts, type StageFrame } from './stageLayout';

const SPRITES = particleSprites();

export interface SceneCreature {
  grid: PixelGrid;
  /** Drawn as a dark silhouette (an unknown foe on the title). */
  silhouette?: boolean;
}

/** Extra motion of a creature from the turn animator, in scene px (whole numbers after rounding). */
export interface CreaturePose {
  dx: number;
  dy: number;
  alpha: number;
}

export interface PaintInput {
  scene: ZoneScene;
  ambient: PreparedAmbient;
  frame: StageFrame;
  /** Scene clock (ms); 0 with reduced motion. */
  tMs: number;
  reducedMotion: boolean;
  /** Platforms and creatures are drawn when true. */
  staged: boolean;
  creatures: Partial<Record<Side, SceneCreature | null>>;
  poses?: Partial<Record<Side, CreaturePose>>;
  fx?: FxFrame | null;
  /** Drop ambient life (the frame budget fell behind). */
  dropAmbient?: boolean;
}

function drawGridAt(canvas: SkCanvas, grid: PixelGrid, x: number, y: number, s: number, alpha = 1): void {
  const img = gridImage(grid);
  if (!img) return;
  drawImage(canvas, img, Math.round(x) * s, Math.round(y) * s, s, alpha < 1 ? alphaPaint(alpha) : null);
}

export function drawParticles(canvas: SkCanvas, particles: readonly DrawParticle[], s: number): void {
  for (const p of particles) {
    if (p.alpha <= 0) continue;
    const sprite = SPRITES[p.sprite];
    const img = sprite ? gridImage(sprite) : null;
    if (!sprite || !img) continue;
    const x = Math.round(p.x - (sprite.width * p.size) / 2) * s;
    const y = Math.round(p.y - (sprite.height * p.size) / 2) * s;
    drawImage(canvas, img, x, y, s * p.size, tintPaint(p.color, p.alpha));
  }
}

function drawBackdrop(canvas: SkCanvas, sc: ZoneScene, depth: 'back' | 'front', s: number, camX: number, tMs: number, fromX: number, toX: number): void {
  for (const layer of sc.backdrop.layers) {
    if (layer.depth !== depth) continue;
    const shift = layerShift(layer.parallax, layer.driftPxPerSec, camX, tMs);
    if (!layer.tileX) {
      drawGridAt(canvas, layer.grid, layer.x + shift, layer.y, s);
      continue;
    }
    for (const x of tileStarts(layer.x, shift, layer.grid.width, fromX, toX)) drawGridAt(canvas, layer.grid, x, layer.y, s);
  }
}

function drawCreature(canvas: SkCanvas, side: Side, c: SceneCreature, s: number, body: BodyFx | null, pose: CreaturePose | undefined): void {
  const img = gridImage(c.grid);
  if (!img) return;
  const a = stageAnchors(side);
  const k = STAGE.spriteScale;
  const dx = Math.round((pose?.dx ?? 0) + (body?.offset.x ?? 0));
  const dy = Math.round((pose?.dy ?? 0) + (body?.offset.y ?? 0));
  const x = (a.feet.x - (c.grid.width * k) / 2 + dx) * s;
  const y = (a.feet.y - (c.grid.height - 1) * k + dy) * s;
  const alpha = Math.max(0, Math.min(1, (pose?.alpha ?? 1) * (body?.alpha ?? 1)));
  if (alpha <= 0) return;
  const flip = side === 'player';
  if (c.silhouette) {
    drawImage(canvas, img, x, y, s * k, tintPaint(ICON_OUTLINE, 0.85 * alpha), flip);
    return;
  }
  drawImage(canvas, img, x, y, s * k, alpha < 1 ? alphaPaint(alpha) : null, flip);
  if (body?.tint && body.tint.alpha > 0) drawImage(canvas, img, x, y, s * k, tintPaint(body.tint.color, body.tint.alpha * alpha), flip);
  if (body && body.flash > 0) drawImage(canvas, img, x, y, s * k, tintPaint('#ffffff', body.flash * alpha), flip);
}

/** Text with an 8-way outline and a drop shadow, centred on (cx, cy) in device px. */
function outlinedText(canvas: SkCanvas, text: string, cx: number, cy: number, sizePx: number, fill: string, outline: string, shadow: string, alpha: number, stroke: number): void {
  const font = artFont(sizePx);
  if (!font || alpha <= 0) return;
  const w = font.getTextWidth(text);
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy + sizePx * 0.35);
  canvas.drawText(text, x, y + stroke * 2, fillPaint(shadow, alpha), font);
  for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const) {
    canvas.drawText(text, x + ox * stroke, y + oy * stroke, fillPaint(outline, alpha), font);
  }
  canvas.drawText(text, x, y, fillPaint(fill, alpha), font);
}

/** Paints one frame. The canvas is in device px; (0, 0) is the top-left of the stage box. */
export function paintScene(canvas: SkCanvas, input: PaintInput, ratio: number): void {
  const { scene: sc, frame, fx } = input;
  const s = frame.scale;
  const reduced = input.reducedMotion;
  const t = reduced ? 0 : input.tMs;
  const shake = fx?.shake ?? { x: 0, y: 0 };
  // Sky colour behind everything, so rounding at the edges never shows the page.
  canvas.drawRect({ x: 0, y: 0, width: frame.widthPx, height: frame.heightPx }, fillPaint(sc.palette.sky[0] ?? '#000000'));
  canvas.save();
  canvas.translate((-frame.originX + shake.x) * s, (-frame.originY + shake.y) * s);
  const cam = cameraSway(t, reduced);
  const from = frame.originX - 4;
  const to = frame.originX + frame.viewWidth + 4;
  drawBackdrop(canvas, sc, 'back', s, cam, t, from, to);
  const ambient = input.dropAmbient ? [] : sampleAmbient(input.ambient, t, reduced);
  drawParticles(canvas, ambient.filter((p) => p.depth === 'back'), s);
  if (input.staged) {
    for (const side of ['enemy', 'player'] as const) {
      const pl = sc.platforms[side];
      const a = stageAnchors(side);
      drawGridAt(canvas, pl.grid, a.feet.x - pl.anchor.x, a.feet.y - pl.anchor.y, s);
      const c = input.creatures[side];
      if (!c) continue;
      const pose = input.poses?.[side];
      const body = fx?.bodies[side] ?? null;
      const alpha = Math.max(0, Math.min(1, (pose?.alpha ?? 1) * (body?.alpha ?? 1)));
      drawGridAt(canvas, pl.shadow, a.feet.x - Math.floor(pl.shadow.width / 2), a.feet.y - Math.floor(pl.shadow.height / 2), s, alpha);
      drawCreature(canvas, side, c, s, body, pose);
    }
  }
  drawBackdrop(canvas, sc, 'front', s, cam, t, from, to);
  drawParticles(canvas, ambient.filter((p) => p.depth === 'front'), s);
  if (fx) {
    drawParticles(canvas, fx.particles, s);
    if (fx.screen && fx.screen.alpha > 0) {
      canvas.drawRect(
        { x: (frame.originX - 8) * s, y: (frame.originY - 8) * s, width: (frame.viewWidth + 16) * s, height: (frame.viewHeight + 16) * s },
        fillPaint(fx.screen.color, fx.screen.alpha),
      );
    }
    for (const n of fx.numbers) {
      // At least 16dp (20dp emphasised), so the numbers stay readable on small scales.
      const size = Math.round(Math.max(n.style.sizePx * s, (n.style.sizePx >= 10 ? 20 : 16) * ratio) * n.scale);
      outlinedText(canvas, n.text, n.x * s, n.y * s, size, n.style.fill, n.style.outline, n.style.shadow, n.alpha, Math.max(1, Math.round(s / 2)));
    }
    if (fx.title && fx.title.alpha > 0) {
      // Victory / defeat: the localized words (never baked into art), placed by the title track.
      const size = Math.round(Math.max(24 * ratio, 16 * s));
      const ty = (Math.max(frame.originY + 24, 46) + fx.title.offsetY) * s;
      const cx = (frame.originX + frame.viewWidth / 2) * s;
      outlinedText(canvas, fx.title.text, cx, ty, size, '#fff6dc', '#120a14', '#000000', fx.title.alpha, Math.max(2, Math.round(s * 0.75)));
    }
  }
  canvas.restore();
}
