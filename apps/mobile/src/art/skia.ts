// Skia helpers for the scene art (@kinfall/core/art/scene): pixel grids become cached
// nearest-neighbour images, particle masks are tinted with a colour-filter paint, nine-slice frames
// are drawn as nine image rects. Everything degrades to "draw nothing" when Skia has no native side
// (Jest), so the screens still render their real text and controls.
import type { PixelGrid } from '@kinfall/core/art/palette';
import { rgba, type NineSlice } from '@kinfall/core/art/scene';
import {
  AlphaType,
  BlendMode,
  ColorType,
  FilterMode,
  matchFont,
  MipmapMode,
  Skia,
  type SkCanvas,
  type SkFont,
  type SkImage,
  type SkPaint,
  type SkPicture,
} from '@shopify/react-native-skia';
import { PixelRatio } from 'react-native';

let available: boolean | null = null;

/** True when Skia can make images on this platform (false under Jest, where it is a stub). */
export function artAvailable(): boolean {
  if (available !== null) return available;
  try {
    const data = Skia.Data.fromBytes(new Uint8Array([0, 0, 0, 0]));
    const img = Skia.Image.MakeImage({ width: 1, height: 1, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }, data, 4);
    available = img !== null && img !== undefined;
  } catch {
    available = false;
  }
  return available;
}

/** Test hook: pretend Skia is (un)available, or reset to detection with `null`. */
export function setArtAvailableForTests(value: boolean | null): void {
  available = value;
}

const images = new WeakMap<PixelGrid, SkImage>();

/** A 1:1 image of a grid (cached per grid object); null without Skia. */
export function gridImage(grid: PixelGrid): SkImage | null {
  const hit = images.get(grid);
  if (hit) return hit;
  if (!artAvailable()) return null;
  try {
    const bytes = new Uint8Array(grid.width * grid.height * 4);
    const colors = grid.palette.map((c) => rgba(c));
    for (let i = 0; i < grid.pixels.length; i++) {
      const idx = grid.pixels[i] ?? 0;
      if (idx === 0) continue;
      const c = colors[idx];
      if (!c) continue;
      bytes[i * 4] = c[0];
      bytes[i * 4 + 1] = c[1];
      bytes[i * 4 + 2] = c[2];
      bytes[i * 4 + 3] = c[3];
    }
    const img = Skia.Image.MakeImage(
      { width: grid.width, height: grid.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      Skia.Data.fromBytes(bytes),
      grid.width * 4,
    );
    if (!img) return null;
    images.set(grid, img);
    return img;
  } catch {
    return null;
  }
}

/** A Skia colour from `#rrggbb` / `#rrggbbaa`, with an extra opacity factor. */
export function skColor(hex: string, alpha = 1): Float32Array {
  const [r, g, b, a] = rgba(hex);
  return Float32Array.of(r / 255, g / 255, b / 255, (a / 255) * alpha);
}

let plainPaint: SkPaint | null = null;
/** A shared paint whose opacity is set per draw (recording copies the paint). */
export function alphaPaint(alpha: number): SkPaint {
  if (!plainPaint) plainPaint = Skia.Paint();
  plainPaint.setAlphaf(Math.max(0, Math.min(1, alpha)));
  return plainPaint;
}

const tintPaints = new Map<string, SkPaint>();
/** A paint that fills an image's opaque cells with one colour (masks, flashes, tints). */
export function tintPaint(hex: string, alpha: number): SkPaint {
  let p = tintPaints.get(hex);
  if (!p) {
    p = Skia.Paint();
    p.setColorFilter(Skia.ColorFilter.MakeBlend(skColor(hex), BlendMode.SrcIn));
    tintPaints.set(hex, p);
  }
  p.setAlphaf(Math.max(0, Math.min(1, alpha * (rgba(hex)[3] / 255))));
  return p;
}

const fillPaints = new Map<string, SkPaint>();
/** A solid fill paint (screen washes, letterbox bands). */
export function fillPaint(hex: string, alpha = 1): SkPaint {
  let p = fillPaints.get(hex);
  if (!p) {
    p = Skia.Paint();
    p.setColor(skColor(hex));
    p.setAntiAlias(false);
    fillPaints.set(hex, p);
  }
  p.setAlphaf(Math.max(0, Math.min(1, alpha * (rgba(hex)[3] / 255))));
  return p;
}

/**
 * Draws a whole image at (x, y) scaled by `scale`, nearest-neighbour; `flipX` mirrors it inside
 * its own box (the player's creature faces right).
 */
export function drawImage(canvas: SkCanvas, img: SkImage, x: number, y: number, scale: number, paint: SkPaint | null = null, flipX = false): void {
  const w = img.width();
  const h = img.height();
  const src = Skia.XYWHRect(0, 0, w, h);
  if (!flipX) {
    canvas.drawImageRectOptions(img, src, Skia.XYWHRect(x, y, w * scale, h * scale), FilterMode.Nearest, MipmapMode.None, paint);
    return;
  }
  canvas.save();
  canvas.translate(x + w * scale, y);
  canvas.scale(-1, 1);
  canvas.drawImageRectOptions(img, src, Skia.XYWHRect(0, 0, w * scale, h * scale), FilterMode.Nearest, MipmapMode.None, paint);
  canvas.restore();
}

/**
 * Draws a nine-slice frame filling (0, 0, width, height) device px, with `cell` device px per
 * grid cell (a whole number): corners as they are, edges stretched along one axis, the centre both.
 */
export function drawNineSlice(canvas: SkCanvas, frame: NineSlice, width: number, height: number, cell: number, paint: SkPaint | null = null): void {
  const img = gridImage(frame.grid);
  if (!img) return;
  const gw = frame.grid.width;
  const gh = frame.grid.height;
  const { left: l, top: t, right: r, bottom: b } = frame.slice;
  const xs = [0, l, gw - r, gw];
  const ys = [0, t, gh - b, gh];
  const dx = [0, l * cell, Math.max(l * cell, width - r * cell), width];
  const dy = [0, t * cell, Math.max(t * cell, height - b * cell), height];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const sw = xs[i + 1]! - xs[i]!;
      const sh = ys[j + 1]! - ys[j]!;
      const dw = dx[i + 1]! - dx[i]!;
      const dh = dy[j + 1]! - dy[j]!;
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
      canvas.drawImageRectOptions(img, Skia.XYWHRect(xs[i]!, ys[j]!, sw, sh), Skia.XYWHRect(dx[i]!, dy[j]!, dw, dh), FilterMode.Nearest, MipmapMode.None, paint);
    }
  }
}

/** Records a picture of `width` x `height` dp drawn in device pixels (the callback gets px sizes). */
export function recordPicture(width: number, height: number, draw: (canvas: SkCanvas, pxWidth: number, pxHeight: number, ratio: number) => void): SkPicture | null {
  if (!artAvailable() || width <= 0 || height <= 0) return null;
  try {
    const ratio = PixelRatio.get();
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    canvas.save();
    canvas.scale(1 / ratio, 1 / ratio);
    draw(canvas, Math.round(width * ratio), Math.round(height * ratio), ratio);
    canvas.restore();
    return rec.finishRecordingAsPicture();
  } catch {
    return null;
  }
}

/** Whole device pixels per art cell for a target size in dp (at least 1). */
export function cellPx(dp: number): number {
  return Math.max(1, Math.round(dp * PixelRatio.get()));
}

const fonts = new Map<number, SkFont | null>();
/** A bold system font for floating numbers and result titles (null when unavailable). */
export function artFont(sizePx: number): SkFont | null {
  const key = Math.round(sizePx);
  if (fonts.has(key)) return fonts.get(key) ?? null;
  let font: SkFont | null = null;
  try {
    font = matchFont({ fontFamily: 'sans-serif', fontSize: key, fontWeight: 'bold' }) ?? null;
  } catch {
    font = null;
  }
  fonts.set(key, font);
  return font;
}
