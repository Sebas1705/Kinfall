// Canvas 2D renderer for the scene art data (@kinfall/core/art/scene): grids become cached
// nearest-neighbour bitmaps, backdrop layers scroll by parallax and tile, particles are tinted
// masks. Used by the DOM screens (title, map, events, end) and the dev art preview; the battle
// scene draws the same data with PixiJS (src/view/battleView.ts).
import type { PixelGrid } from '@kinfall/core/art/palette';
import type { ZoneBackdrop } from '@kinfall/core/art/scene/backdrop';
import type { DrawParticle } from '@kinfall/core/art/scene/sampler';
import { parseColor } from '../view/pixelCanvas';

const cache = new WeakMap<PixelGrid, HTMLCanvasElement>();

/** A 1:1 bitmap of a grid (cached per grid object). */
export function gridBitmap(grid: PixelGrid): HTMLCanvasElement {
  const hit = cache.get(grid);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(grid.width, grid.height);
    const colors = grid.palette.map(parseColor);
    for (let i = 0; i < grid.pixels.length; i++) {
      const idx = grid.pixels[i] ?? 0;
      if (idx !== 0) img.data.set(colors[idx] ?? [0, 0, 0, 0], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }
  cache.set(grid, canvas);
  return canvas;
}

/** Draws a grid at scene coordinates (x, y) with an integer scale. */
export function drawGrid(ctx: CanvasRenderingContext2D, grid: PixelGrid, x: number, y: number, scale: number, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.drawImage(gridBitmap(grid), Math.round(x) * scale, Math.round(y) * scale, grid.width * scale, grid.height * scale);
  ctx.globalAlpha = 1;
}

/** Horizontal shift of a layer in whole scene pixels for a camera offset and a drift clock. */
export function layerShift(parallax: number, driftPxPerSec: number, camX: number, tMs: number): number {
  return Math.round(-camX * parallax - (driftPxPerSec * tMs) / 1000);
}

/**
 * Draws the backdrop layers of one depth. `camX` is the camera offset in scene pixels (idle sway),
 * `tMs` drives cloud drift (pass 0 with reduced motion). Tiled layers cover scene x from `fromX`
 * to `toX` (wider or narrower views than the 256-pixel scene).
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  bd: ZoneBackdrop,
  depth: 'back' | 'front',
  scale: number,
  camX: number,
  tMs: number,
  toX = bd.width,
  fromX = 0,
): void {
  for (const layer of bd.layers) {
    if (layer.depth !== depth) continue;
    const shift = layerShift(layer.parallax, layer.driftPxPerSec, camX, tMs);
    if (!layer.tileX) {
      drawGrid(ctx, layer.grid, layer.x + shift, layer.y, scale);
      continue;
    }
    const w = layer.grid.width;
    let x = fromX + ((((layer.x + shift - fromX) % w) + w) % w);
    if (x > fromX) x -= w;
    for (; x < toX; x += w) drawGrid(ctx, layer.grid, x, layer.y, scale);
  }
}

/** Draws sampler particles (scene coordinates, already rounded) as tinted sprite masks. */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: DrawParticle[], scale: number, sprites: Record<string, PixelGrid>): void {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    const sprite = sprites[p.sprite];
    if (sprite) {
      const tinted = tint(p.sprite, sprite, p.color);
      const s = scale * p.size;
      ctx.drawImage(tinted, Math.round(p.x - (sprite.width * p.size) / 2) * scale, Math.round(p.y - (sprite.height * p.size) / 2) * scale, sprite.width * s, sprite.height * s);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - p.size / 2) * scale, Math.round(p.y - p.size / 2) * scale, p.size * scale, p.size * scale);
    }
  }
  ctx.globalAlpha = 1;
}

const tintCache = new Map<string, HTMLCanvasElement>();
/** A grid's shape filled with one colour (flash and tint overlays, particle masks); cached by `id`. */
export function tint(id: string, sprite: PixelGrid, color: string): HTMLCanvasElement {
  const key = `${id}|${color}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = sprite.width;
  c.height = sprite.height;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.drawImage(gridBitmap(sprite), 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  tintCache.set(key, c);
  return c;
}
