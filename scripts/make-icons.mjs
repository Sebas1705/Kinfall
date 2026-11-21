// Generates the Kinfall launcher icons (pixel art, same palette and "K" letterform as the wordmark).
// Usage: node scripts/make-icons.mjs   (needs pngjs, already in the workspace)
// Outputs into apps/mobile/assets/ and apps/web/public/:
//   icon.png (1024, opaque, iOS and legacy), adaptive-icon.png (1024, transparent foreground),
//   adaptive-icon-monochrome.png (1024, white silhouette), favicon.png (64).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = 32; // grid cells per side; 1024 / 32 = 32 px per cell

const K = ['xx...xx', 'xx..xx.', 'xx.xx..', 'xxxx...', 'xxx....', 'xxxx...', 'xx.xx..', 'xx..xx.', 'xx...xx'];
const C = {
  cream: [0xff, 0xe6, 0xa6],
  ember: [0xff, 0x94, 0x40],
  red: [0xc2, 0x40, 0x2e],
  outline: [0x1a, 0x0c, 0x18],
  core: [0xff, 0xf8, 0xe4],
  glow: [0xff, 0xd3, 0x6b],
};

/** @returns {(Array<number>|null)[]} N*N cells, null = transparent. */
function foreground() {
  const cells = new Array(N * N).fill(null);
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < N && y < N) cells[y * N + x] = c;
  };
  const get = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : cells[y * N + x]);
  // The K at 2x scale, centred: 14 x 18 cells.
  const ox = 9;
  const oy = 7;
  K.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] !== 'x') continue;
      const c = gy < 3 ? C.cream : gy < 6 ? C.ember : C.red;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(ox + gx * 2 + dx, oy + gy * 2 + dy, c);
    }
  });
  // The falling star sits in the open right side of the K, trailing up and to the right.
  const sx = 21;
  const sy = 15;
  const star = [
    [0, 0, C.core],
    [-1, 0, C.glow], [1, 0, C.glow], [0, -1, C.glow], [0, 1, C.glow], [-2, 0, C.glow], [2, 0, C.glow], [0, -2, C.glow], [0, 2, C.glow],
    [1, -1, C.glow], [2, -2, C.glow], [4, -3, C.glow], [5, -4, C.glow],
  ];
  // Outline first (a one-cell ring around K and star), then the art on top.
  const mask = cells.map((c) => c !== null);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (mask[y * N + x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (mask[(y + dy) * N + (x + dx)] && y + dy >= 0 && y + dy < N && x + dx >= 0 && x + dx < N) near = true;
      }
      if (near) set(x, y, C.outline);
    }
  }
  for (const [dx, dy, c] of star) set(sx + dx, sy + dy, c);
  void get;
  return cells;
}

/** Dusk sky in hard pixel bands, top to bottom, with a few stars. */
function background() {
  const bands = [[0x2e, 0x14, 0x38], [0x26, 0x10, 0x30], [0x1f, 0x0d, 0x28], [0x18, 0x0a, 0x20], [0x12, 0x07, 0x18]];
  const cells = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cells.push(bands[Math.min(bands.length - 1, Math.floor((y / N) * bands.length))]);
  const dots = [[3, 3], [27, 5], [5, 24], [28, 26], [13, 2], [2, 14], [29, 15], [23, 29]];
  for (const [x, y] of dots) cells[y * N + x] = [0xff, 0xd3, 0x6b];
  return cells;
}

function write(file, size, pick) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = pick(Math.floor((x / size) * N), Math.floor((y / size) * N));
      const i = (y * size + x) * 4;
      png.data[i] = c ? c[0] : 0;
      png.data[i + 1] = c ? c[1] : 0;
      png.data[i + 2] = c ? c[2] : 0;
      png.data[i + 3] = c ? 255 : 0;
    }
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
  console.log('wrote', file);
}

const fg = foreground();
const bg = background();
const mobile = join(root, 'apps/mobile/assets');
write(join(mobile, 'icon.png'), 1024, (x, y) => fg[y * N + x] ?? bg[y * N + x]);
write(join(mobile, 'adaptive-icon.png'), 1024, (x, y) => fg[y * N + x]);
write(join(mobile, 'adaptive-icon-monochrome.png'), 1024, (x, y) => (fg[y * N + x] && fg[y * N + x] !== C.outline ? [255, 255, 255] : null));
write(join(root, 'apps/web/public/favicon.png'), 64, (x, y) => fg[y * N + x] ?? bg[y * N + x]);
