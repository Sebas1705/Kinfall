import type { PixelGrid } from '../art/palette';

/** `#rrggbb` or `#rrggbbaa` to RGBA bytes. */
export function parseColor(hex: string): [number, number, number, number] {
  const n = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return [n(0), n(1), n(2), hex.length >= 9 ? n(3) : 255];
}

/**
 * Paints a pixel grid onto `canvas` at 1 canvas pixel per cell (sized to the grid);
 * `silhouette` paints every pixel white. Does nothing when no 2D context is available.
 */
export function paintGrid(canvas: HTMLCanvasElement, grid: PixelGrid, silhouette = false): void {
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(grid.width, grid.height);
  const colors = grid.palette.map(parseColor);
  for (let i = 0; i < grid.pixels.length; i++) {
    const idx = grid.pixels[i] ?? 0;
    if (idx === 0) continue;
    const c = silhouette ? ([255, 255, 255, 255] as const) : (colors[idx] ?? [0, 0, 0, 0]);
    img.data.set(c, i * 4);
  }
  ctx.putImageData(img, 0, 0);
}
