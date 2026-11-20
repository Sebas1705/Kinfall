// Event vignettes: small 64x40 scenes shown above the text of an event screen (shrine, cache,
// mystery, recruit camp), lit by the zone's dusk palette. Decorative; the event text says it all.
import type { PixelGrid } from '../palette';
import { cosmeticRng } from './cosmeticRng';
import { easeIn, hypot, round, sin } from './fixedMath';
import { bayer, Grid } from './grid';
import { ZONE_PALETTES, type ZoneId } from './palettes';

export type VignetteKind = 'shrine' | 'cache' | 'mystery' | 'recruit';
export const VIGNETTE_KINDS: readonly VignetteKind[] = ['shrine', 'cache', 'mystery', 'recruit'];

export const VIGNETTE_WIDTH = 64;
export const VIGNETTE_HEIGHT = 40;

// Shared slots: 1-6 sky, 7 ground, 8 ground dark, 9 ground light, 10 outline,
// 11 object main, 12 object light, 13 object dark, 14 glow, 15 glow soft, 16 core.
const SKY0 = 1;
const GROUND = 7;
const GROUND_DARK = 8;
const GROUND_LIGHT = 9;
const OUT = 10;
const OBJ = 11;
const OBJ_L = 12;
const OBJ_D = 13;
const GLOW = 14;
const GLOW_SOFT = 15;
const CORE = 16;

const OBJECT_COLOURS: Record<VignetteKind, [string, string, string, string, string, string]> = {
  shrine: ['#8a8aa8', '#c8c8e0', '#4c4c6c', '#8ff0ff', '#8ff0ff55', '#f0ffff'],
  cache: ['#a8642c', '#e0a050', '#5a3218', '#ffd36b', '#ffd36b55', '#fff6d0'],
  mystery: ['#5a3a9a', '#a07ae0', '#2a1850', '#e48fb6', '#e48fb655', '#fff2f6'],
  recruit: ['#6a4a3a', '#a07050', '#3a2620', '#ff9d3a', '#ff9d3a55', '#fff1c4'],
};

function glowDisc(g: Grid, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d <= 1 && 1 - d > bayer(x, y) * 0.9 && g.get(x, y) < OUT) g.set(x, y, GLOW_SOFT);
    }
  }
}

/** A 64x40 vignette of an event kind, in a zone's light. Pure per (kind, zone, seed). */
export function eventVignette(kind: VignetteKind, zone: ZoneId, seed: string | number): PixelGrid {
  const p = ZONE_PALETTES[zone];
  const rng = cosmeticRng(`vignette|${kind}|${zone}|${seed}`);
  const W = VIGNETTE_WIDTH;
  const H = VIGNETTE_HEIGHT;
  const g = new Grid(W, H, ['#00000000', ...p.sky, p.floor[0], p.floor[1], p.floor[2], '#0c0814', ...OBJECT_COLOURS[kind]]);
  const horizon = 26;
  // Sky: the zone's bands, dithered.
  for (let y = 0; y < horizon; y++) {
    const t = easeIn(y / (horizon - 1)) * 5;
    const b = Math.min(5, Math.floor(t));
    const cover = Math.max(0, (t - b - 0.55) / 0.45);
    for (let x = 0; x < W; x++) g.set(x, y, SKY0 + (cover > bayer(x, y) && b < 5 ? b + 1 : b));
  }
  // A few stars.
  for (let i = 0; i < 8; i++) g.set(rng.int(W), rng.int(12), SKY0 + 5);
  // Ground with a lit rim and a darker front.
  for (let y = horizon; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = (y - horizon) / (H - horizon);
      g.set(x, y, y === horizon ? GROUND_LIGHT : v > 0.55 && v - 0.55 > bayer(x, y) * 0.45 ? GROUND_DARK : GROUND);
    }
  }
  // Distant silhouette bumps on the horizon.
  for (let x = 0; x < W; x++) {
    const hgt = Math.floor(2 + 2 * sin(x * 0.19 + rng.next() * 0.2) + (x % 11 === 0 ? 2 : 0));
    for (let y = horizon - hgt; y < horizon; y++) g.set(x, y, GROUND_DARK);
  }
  const cx = W / 2;
  switch (kind) {
    case 'shrine': {
      glowDisc(g, cx, 17, 13);
      // Standing stone with a rounded top and a glowing rune.
      const sg = new Grid(W, H, []);
      sg.rect(cx - 5, 10, 10, 22, 1);
      sg.ellipse(cx, 10, 5, 5, 1);
      for (let i = 0; i < W * H; i++) if (sg.pixels[i]) g.pixels[i] = OBJ;
      for (let y = 6; y < 32; y++) g.set(cx - 5, y, OBJ_L);
      for (let y = 6; y < 32; y++) g.set(cx + 4, y, OBJ_D);
      g.vline(cx, 12, 26, GLOW);
      g.set(cx - 2, 15, GLOW);
      g.set(cx + 2, 15, GLOW);
      g.set(cx - 1, 19, GLOW);
      g.set(cx + 2, 21, GLOW);
      g.set(cx, 18, CORE);
      // Base slab and two candles.
      g.rect(cx - 9, 31, 18, 3, OBJ_D);
      for (const dx of [-12, 11]) {
        g.rect(cx + dx, 29, 2, 4, OBJ_L);
        g.set(cx + dx, 27, GLOW);
        g.set(cx + dx, 28, CORE);
        g.set(cx + dx + 1, 28, GLOW);
      }
      break;
    }
    case 'cache': {
      glowDisc(g, cx, 22, 12);
      // Dotted rays of gold fanning out of the gap under the lid.
      for (const dx of [-10, -5, 0, 5, 10]) {
        for (let i = 0; i < 10; i += 2) {
          const t = i / 10;
          g.set(round(cx + dx * (0.3 + t)), round(16 - i), i < 4 ? CORE : GLOW);
        }
      }
      // Body with two iron bands.
      g.rect(cx - 10, 24, 20, 9, OBJ);
      g.rect(cx - 10, 31, 20, 2, OBJ_D);
      g.rect(cx - 7, 24, 2, 9, OBJ_D);
      g.rect(cx + 5, 24, 2, 9, OBJ_D);
      // Arched lid lifted a crack: rounded top, lit front edge.
      g.rect(cx - 10, 18, 20, 4, OBJ_L);
      g.hline(cx - 9, cx + 8, 17, OBJ_L);
      g.hline(cx - 7, cx + 6, 16, OBJ_L);
      g.hline(cx - 10, cx + 9, 21, OBJ);
      g.rect(cx - 7, 16, 2, 6, OBJ_D);
      g.rect(cx + 5, 16, 2, 6, OBJ_D);
      // Light spilling out of the gap.
      g.hline(cx - 10, cx + 9, 22, GLOW);
      g.hline(cx - 9, cx + 8, 23, CORE);
      g.rect(cx - 1, 25, 2, 3, GLOW);
      // Coins on the ground.
      for (let i = 0; i < 5; i++) g.set(cx + rng.between(-16, 16), rng.between(33, 37), GLOW);
      break;
    }
    case 'mystery': {
      // A swirling rift: nested rings of colour with a bright eye.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = (x + 0.5 - cx) / 12;
          const dy = (y + 0.5 - 19) / 15;
          const d = hypot(dx, dy);
          if (d > 1) continue;
          // Diamond angle (0-1 around the centre): an exact stand-in for atan2.
          const s = Math.abs(dx) + Math.abs(dy);
          const turn = s === 0 ? 0 : (dy >= 0 ? 1 - dx / s : 3 + dx / s) / 4;
          const swirl = (turn + d * 1.6) % 1;
          const band = swirl < 0.33 ? OBJ : swirl < 0.66 ? OBJ_L : OBJ_D;
          g.set(x, y, d > 0.92 ? GLOW : band);
        }
      }
      g.ellipse(cx, 19, 3, 2, CORE);
      g.set(cx, 19, OUT);
      for (let i = 0; i < 6; i++) g.set(cx + rng.between(-22, 22), rng.between(6, 34), GLOW);
      break;
    }
    case 'recruit': {
      glowDisc(g, cx + 6, 26, 12);
      // A small tent on the left.
      for (let i = 0; i < 12; i++) g.hline(cx - 20 + i, cx - 4 - i, 32 - i, OBJ_D);
      for (let i = 0; i < 12; i++) g.set(cx - 20 + i, 32 - i, OBJ_L);
      g.vline(cx - 12, 26, 32, OUT);
      // Campfire: crossed logs and a stacked flame.
      g.line(cx + 1, 33, cx + 11, 30, OBJ);
      g.line(cx + 1, 30, cx + 11, 33, OBJ_L);
      g.ellipse(cx + 6, 27, 3, 4, GLOW);
      g.ellipse(cx + 6, 28, 1.6, 2.4, CORE);
      g.set(cx + 6, 22, GLOW);
      g.set(cx + 5, 20, GLOW_SOFT);
      // Sparks rising.
      for (let i = 0; i < 4; i++) g.set(cx + 6 + rng.between(-4, 4), rng.between(10, 20), GLOW);
      break;
    }
  }
  return g.toPixelGrid();
}
