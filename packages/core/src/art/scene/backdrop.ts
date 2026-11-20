// Zone backdrops: a stack of tileable pixel layers (sky, stars, sun or moon, clouds, far, mid,
// floor, foreground fringe) with parallax factors. Pure and deterministic per (zone, seed); the
// cosmetic PRNG is used, never the simulation one.
import type { PixelGrid } from '../palette';
import { mix, withAlpha } from './color';
import { cosmeticRng, type CosmeticRng } from './cosmeticRng';
import { cos, easeIn, hypot, PI, round, sin, sqrt } from './fixedMath';
import { bayer, Grid, tileNoise } from './grid';
import { ZONE_PALETTES, type ZoneId, type ZonePalette } from './palettes';

/** Logical scene size in art pixels (16:9). Renderers scale it by a whole number. */
export const SCENE_WIDTH = 256;
export const SCENE_HEIGHT = 144;
/** Row where the sky meets the floor. */
export const HORIZON_Y = 84;
/** Most palette cells a whole backdrop may hold (all layers): a memory cap for low-end phones. */
export const SCENE_PIXEL_BUDGET = 100_000;

export type BackdropLayerId = 'sky' | 'stars' | 'light' | 'clouds' | 'far' | 'mid' | 'floor' | 'near';

export interface BackdropLayer {
  id: BackdropLayerId;
  grid: PixelGrid;
  /** Top-left of the layer in scene pixels (before parallax and tiling). */
  x: number;
  y: number;
  /**
   * Camera factor: a camera offset of `dx` scene pixels moves this layer by `-dx * parallax`.
   * 0 = fixed to the screen (sky), 1 = moves with the stage (floor fringe).
   */
  parallax: number;
  /** Repeat the grid horizontally to cover any scene width. */
  tileX: boolean;
  /** 'back' layers go behind the platforms and creatures, 'front' layers over them. */
  depth: 'back' | 'front';
  /** Slow automatic scroll in scene pixels per second (clouds); renderers use 0 with reduced motion. */
  driftPxPerSec: number;
}

export interface ZoneBackdrop {
  zone: ZoneId;
  seed: string;
  width: number;
  height: number;
  horizonY: number;
  /** Draw order: first is furthest back. */
  layers: BackdropLayer[];
}

// ---------------------------------------------------------------- sky

function skyLayer(p: ZonePalette): BackdropLayer {
  const h = HORIZON_Y + 4;
  const g = new Grid(4, h, ['#00000000', ...p.sky], true);
  const n = p.sky.length;
  for (let y = 0; y < h; y++) {
    // Bands get thinner towards the horizon, where the light changes fastest.
    const t = easeIn(y / (h - 1)) * (n - 1);
    const base = Math.min(n - 1, Math.floor(t));
    const frac = t - base;
    // Mostly flat bands; only the last 40% of each band dithers into the next one.
    const cover = Math.max(0, (frac - 0.6) / 0.4);
    for (let x = 0; x < 4; x++) g.set(x, y, 1 + (cover > bayer(x, y) && base < n - 1 ? base + 1 : base));
  }
  return { id: 'sky', grid: g.toPixelGrid(), x: 0, y: 0, parallax: 0, tileX: true, depth: 'back', driftPxPerSec: 0 };
}

// ---------------------------------------------------------------- stars

function starsLayer(p: ZonePalette, rng: CosmeticRng): BackdropLayer | null {
  if (p.stars.length === 0) return null;
  const h = Math.floor(HORIZON_Y * 0.62);
  const g = new Grid(SCENE_WIDTH, h, ['#00000000', ...p.stars.map((c) => withAlpha(c, 150)), ...p.stars], true);
  const count = p.zone === 0 ? 14 : 46;
  for (let i = 0; i < count; i++) {
    const x = rng.int(SCENE_WIDTH);
    // Denser near the top, fading out towards the horizon glow.
    const y = Math.floor(easeIn(rng.next()) * h);
    const tone = rng.int(p.stars.length);
    const bright = rng.chance(0.25);
    g.set(x, y, 1 + (bright ? p.stars.length : 0) + tone);
    if (bright && rng.chance(0.4) && p.zone !== 0) {
      // A small four-point twinkle.
      const dim = 1 + tone;
      g.set(x - 1, y, dim);
      g.set(x + 1, y, dim);
      g.set(x, y - 1, dim);
      g.set(x, y + 1, dim);
    }
  }
  return { id: 'stars', grid: g.toPixelGrid(), x: 0, y: 0, parallax: 0.02, tileX: true, depth: 'back', driftPxPerSec: 0 };
}

// ---------------------------------------------------------------- sun / moon

function lightLayer(p: ZonePalette, rng: CosmeticRng): BackdropLayer {
  const sun = p.light.kind === 'sun';
  const r = sun ? 15 : p.zone === 2 ? 12 : 9;
  const glowR = r + (sun ? 16 : 13);
  const size = glowR * 2 + 1;
  const [g1 = '#0000', g2 = '#0000'] = p.light.glow;
  // 1 core, 2 shade, 3 inner glow, 4 outer glow, 5 crater/detail
  const g = new Grid(size, size, ['#00000000', p.light.core, p.light.shade, g1, g2, mix(p.light.core, p.light.shade, 0.6)]);
  const c = glowR + 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = hypot(x + 0.5 - c, y + 0.5 - c);
      if (d <= r) {
        g.set(x, y, 1);
      } else if (d <= r + (glowR - r) * 0.45) {
        const f = 1 - (d - r) / ((glowR - r) * 0.45);
        g.set(x, y, f + 0.35 > bayer(x, y) ? 3 : 4);
      } else if (d <= glowR) {
        const f = 1 - (d - r - (glowR - r) * 0.45) / ((glowR - r) * 0.55);
        if (f > bayer(x, y)) g.set(x, y, 4);
      }
    }
  }
  if (sun) {
    // Lower part of the sun in the warmer shade, with a dithered seam: it is sinking into the haze.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (g.get(x, y) !== 1) continue;
        const v = (y + 0.5 - (c - r)) / (2 * r);
        if (v > 0.62 || (v > 0.48 && (v - 0.48) / 0.14 > bayer(x, y))) g.set(x, y, 2);
      }
    }
  } else {
    // Moon: a thin shaded crescent on the upper right limb (outside a circle shifted towards the
    // lower left), with a dithered terminator, and a few small soft maria.
    const ox = c - r * 0.22;
    const oy = c + r * 0.16;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (g.get(x, y) !== 1) continue;
        const d = hypot(x + 0.5 - ox, y + 0.5 - oy) / r;
        if (d > 1.1 || (d > 0.95 && (x + y) % 2 === 0)) g.set(x, y, 2);
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, PI * 2);
      const dist = rng.range(r * 0.15, r * 0.5);
      const cr = rng.range(1, Math.max(1.4, r * 0.2));
      const cx = c - r * 0.1 + cos(a) * dist;
      const cy = c + sin(a) * dist;
      for (let y = Math.floor(cy - cr); y <= cy + cr; y++) {
        for (let x = Math.floor(cx - cr); x <= cx + cr; x++) {
          const inside = hypot(x + 0.5 - cx, y + 0.5 - cy) <= cr;
          if (inside && g.get(x, y) === 1 && ((x + y) % 2 === 0 || cr > 1.8)) g.set(x, y, 5);
        }
      }
    }
  }
  const cx = sun ? 64 + rng.between(-8, 8) : p.light.side > 0 ? 196 + rng.between(-10, 10) : 60;
  const cy = sun ? HORIZON_Y - 9 : p.zone === 2 ? 24 : 20;
  return {
    id: 'light',
    grid: g.toPixelGrid(),
    x: cx - glowR,
    y: cy - glowR,
    parallax: 0.04,
    tileX: false,
    depth: 'back',
    driftPxPerSec: 0,
  };
}

// ---------------------------------------------------------------- clouds

function cloudLayer(p: ZonePalette, rng: CosmeticRng): BackdropLayer {
  const h = 40;
  const g = new Grid(SCENE_WIDTH, h, ['#00000000', p.cloud[0], p.cloud[1], withAlpha(p.cloud[0], 150)], true);
  const litBelow = p.light.kind === 'sun';
  const count = p.zone === 0 ? 7 : 5;
  for (let i = 0; i < count; i++) {
    const len = rng.between(26, 70);
    const x0 = rng.int(SCENE_WIDTH);
    const y0 = p.zone === 0 ? rng.between(14, h - 4) : rng.between(4, h - 10);
    const rows = rng.between(2, 4);
    for (let j = 0; j < rows; j++) {
      // Each row is shorter and offset, giving a long wispy stack.
      const inset = Math.floor((len * j) / (rows * 2.2)) + rng.between(0, 4);
      const rowLen = len - inset * 2 + rng.between(-4, 4);
      const y = y0 + (litBelow ? j : -j);
      for (let x = 0; x < rowLen; x++) {
        const edge = x < 3 || x > rowLen - 4;
        g.set(x0 + inset + x, y, edge ? 3 : 1);
      }
    }
    // Lit edge: the row nearest the light.
    for (let x = 0; x < len; x++) {
      const gx = x0 + x;
      const y = y0 + (litBelow ? rows - 1 : -(rows - 1));
      if (g.get(gx, y) === 1 && (x % 7 !== 3)) g.set(gx, y, 2);
    }
  }
  return {
    id: 'clouds',
    grid: g.toPixelGrid(),
    x: 0,
    // Under a moon the clouds sit below it, so they never bite into the disc.
    y: p.zone === 0 ? HORIZON_Y - 46 : 30,
    parallax: 0.08,
    tileX: true,
    depth: 'back',
    driftPxPerSec: 1.5,
  };
}

// ---------------------------------------------------------------- far silhouettes

function farLayer(p: ZonePalette, rng: CosmeticRng): BackdropLayer {
  const h = 40;
  const g = new Grid(SCENE_WIDTH, h, ['#00000000', p.far[0], p.far[1], mix(p.far[0], p.sky[5]!, 0.35)], true);
  const noise = tileNoise(() => rng.next(), SCENE_WIDTH, p.zone === 2 ? [2, 5, 11] : [2, 3, 7, 13]);
  for (let x = 0; x < SCENE_WIDTH; x++) {
    let top: number;
    if (p.zone === 0) top = h - 10 - noise[x]! * 7;
    else if (p.zone === 1) top = h - 14 - noise[x]! * 6;
    else top = h - 5 - Math.max(0, noise[x]!) * 4;
    for (let y = Math.floor(top); y < h; y++) g.set(x, y, 1);
  }
  if (p.zone === 1) {
    // A dense line of conifers on the far ridge: stepped triangles, tallest in clusters.
    for (let x = rng.int(4); x < SCENE_WIDTH; x += rng.between(4, 7)) {
      let ground = 0;
      while (ground < h && g.get(x, ground) === 0) ground++;
      const th = rng.between(9, 19);
      for (let j = 0; j < th; j++) {
        // Two-tier silhouette: the half-width grows, then steps back once (a layered pine).
        const t = j / th;
        const half = Math.floor(t < 0.5 ? t * 7 : (t - 0.25) * 7);
        for (let dx = -half; dx <= half; dx++) g.set(x + dx, ground - th + j + 1, 1);
      }
    }
  }
  if (p.zone === 2) {
    // Sea stacks and a distant headland rising out of the sea line.
    for (let i = 0; i < 4; i++) {
      const sx = rng.int(SCENE_WIDTH);
      const sw = rng.between(3, 8);
      const sh = rng.between(8, 20);
      for (let j = 0; j < sh; j++) {
        const lean = Math.floor((j * rng.range(-0.3, 0.3)) / 2);
        const w = sw - (j > sh - 3 ? 1 : 0);
        for (let dx = 0; dx < w; dx++) g.set(sx + dx + lean, h - j - 1, 1);
      }
    }
    const hx = rng.int(SCENE_WIDTH);
    for (let dx = 0; dx < 64; dx++) {
      const top = h - 4 - Math.floor(sqrt(sin((dx / 64) * PI)) * 14);
      for (let y = top; y < h; y++) g.set(hx + dx, y, 1);
    }
  }
  // Haze: the lower rows fade towards the horizon colour (one dithered row, then solid).
  for (let y = h - 4; y < h; y++) for (let x = 0; x < SCENE_WIDTH; x++) {
    if (g.get(x, y) === 1 && (y > h - 4 || (x + y) % 2 === 0)) g.set(x, y, 3);
  }
  g.rimTop(2, 1);
  if (p.light.kind === 'sun') g.rimSide(2, 1, p.light.side);
  return { id: 'far', grid: g.toPixelGrid(), x: 0, y: HORIZON_Y - h + 2, parallax: 0.15, tileX: true, depth: 'back', driftPxPerSec: 0 };
}

// ---------------------------------------------------------------- middle silhouettes

const MID_H = 78;
/** Indices of the mid layer palette. */
const M = { fill: 1, rim: 2, glow: 3, glowSoft: 4 } as const;

/** A leafless, twisted tree: recursive branches thinning out. */
function deadTree(g: Grid, rng: CosmeticRng, x: number, base: number, height: number): void {
  const branch = (bx: number, by: number, angle: number, len: number, width: number, depth: number): void => {
    const ex = bx + cos(angle) * len;
    const ey = by - sin(angle) * len;
    for (let w = 0; w < width; w++) g.line(bx + w, by, ex + w * 0.5, ey, M.fill);
    if (depth <= 0 || len < 3) return;
    const kids = depth > 2 ? 2 : rng.between(1, 3);
    for (let k = 0; k < kids; k++) {
      const turn = rng.range(0.25, 0.75) * (k % 2 === 0 ? 1 : -1);
      branch(ex, ey, angle + turn, len * rng.range(0.55, 0.75), Math.max(1, width - 1), depth - 1);
    }
  };
  branch(x, base, PI / 2 + rng.range(-0.15, 0.15), height * 0.45, 3, 4);
  // Roots flaring into the ground.
  g.line(x - 3, base, x, base - 3, M.fill);
  g.line(x + 5, base, x + 2, base - 3, M.fill);
}

/** A broken stone arch with warm light in its windows. */
function ruinArch(g: Grid, rng: CosmeticRng, x: number, base: number): void {
  const w = rng.between(26, 34);
  const ph = rng.between(26, 36);
  const pillar = 5;
  g.rect(x, base - ph, pillar, ph, M.fill);
  g.rect(x + w - pillar, base - ph + rng.between(6, 12), pillar, ph, M.fill);
  // Arch: half-ellipse between the pillars, broken off on one side.
  const cx = x + w / 2;
  const rx = w / 2;
  const top = base - ph;
  for (let i = 0; i <= w * 0.62; i++) {
    const xx = x + i;
    const t = (xx + 0.5 - cx) / rx;
    const ay = top - sqrt(Math.max(0, 1 - t * t)) * 9;
    g.rect(xx, Math.floor(ay), 1, 4, M.fill);
  }
  // Cracks and a glowing window in the left pillar.
  g.set(x + 2, base - ph + 8, M.glow);
  g.set(x + 2, base - ph + 9, M.glow);
  g.set(x + 1, base - ph + 9, M.glowSoft);
  g.set(x + 3, base - ph + 9, M.glowSoft);
  // Rubble.
  for (let i = 0; i < 6; i++) g.rect(x + w + rng.between(-2, 8), base - rng.between(1, 3), rng.between(2, 4), 3, M.fill);
}

/** A reed / cattail clump. */
function reeds(g: Grid, rng: CosmeticRng, x: number, base: number, n: number, tall: number): void {
  for (let i = 0; i < n; i++) {
    const rx = x + rng.between(-6, 6);
    const rh = rng.between(Math.floor(tall / 2), tall);
    const lean = rng.range(-0.25, 0.25);
    g.line(rx, base, rx + lean * rh, base - rh, M.fill);
    if (rng.chance(0.45)) g.rect(round(rx + lean * rh) - 1, base - rh, 2, 3, M.fill);
  }
}

/** A broad dusk tree with a layered canopy and thorny spurs. */
function thornTree(g: Grid, rng: CosmeticRng, x: number, base: number, height: number): void {
  const trunkW = rng.between(6, 8);
  const cx = x + trunkW / 2;
  // Trunk tapering towards the crown, with flaring buttress roots.
  for (let j = 0; j < height; j++) {
    const w = trunkW - Math.floor((j / height) * 2);
    g.rect(round(cx - w / 2), base - j, w, 1, M.fill);
  }
  for (let i = 1; i <= 5; i++) {
    g.rect(x - i, base - Math.max(0, 4 - i), 1, Math.max(1, 4 - i) + 1, M.fill);
    g.rect(x + trunkW - 1 + i, base - Math.max(0, 4 - i), 1, Math.max(1, 4 - i) + 1, M.fill);
  }
  // A rounded crown: one broad mass plus lumps along its upper edge.
  const cy = base - height - rng.between(2, 5);
  const rx = rng.range(17, 23);
  const ry = rng.range(11, 14);
  g.ellipse(cx, cy, rx, ry, M.fill);
  const lumps = rng.between(5, 8);
  for (let i = 0; i < lumps; i++) {
    const a = PI * (0.05 + (0.9 * i) / (lumps - 1));
    g.disc(cx + cos(a) * rx * 0.85, cy - sin(a) * ry * 0.75, rng.range(4, 7), M.fill);
  }
  // Two low side branches carrying smaller leaf clusters.
  for (const dir of [-1, 1]) {
    const bx = cx + dir * rng.range(rx * 0.7, rx * 1.05);
    const by = cy + ry * rng.range(0.4, 0.8);
    g.line(cx, cy + ry * 0.6 + 4, bx, by, M.fill);
    g.ellipse(bx, by - 1, rng.range(4, 7), rng.range(3, 4), M.fill);
  }
  // Thorny spurs sticking out of the crown edge.
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, PI * 2);
    const sx = cx + cos(a) * rx;
    const sy = cy + sin(a) * ry;
    g.line(sx, sy, sx + cos(a) * 3, sy + sin(a) * 3, M.fill);
  }
  // A side branch with a hanging lantern (the warm accent of the hollow).
  if (rng.chance(0.6)) {
    const dir = rng.chance(0.5) ? 1 : -1;
    const lx = x + (dir > 0 ? trunkW + 9 : -10);
    const ly = base - Math.floor(height * 0.45);
    g.line(x + (dir > 0 ? trunkW : 0), ly - 3, lx, ly - 5, M.fill);
    g.vline(lx, ly - 5, ly - 2, M.fill);
    g.rect(lx - 1, ly - 1, 3, 3, M.glow);
    g.set(lx, ly + 2, M.glowSoft);
  }
}

/** A mossy standing pillar, slightly broken at the top. */
function pillar(g: Grid, rng: CosmeticRng, x: number, base: number): void {
  const ph = rng.between(16, 26);
  g.rect(x, base - ph, 6, ph, M.fill);
  g.rect(x - 1, base - ph, 8, 2, M.fill);
  g.set(x + 6, base - ph - 1, M.fill);
  g.set(x + 2, base - ph + 6, M.glow);
  g.set(x + 3, base - ph + 6, M.glow);
}

/** A sea cliff with a ruined watchtower and a lit window. */
function cliff(g: Grid, rng: CosmeticRng, x: number, base: number, width: number): void {
  const noise = tileNoise(() => rng.next(), width, [1, 3, 7]);
  for (let i = 0; i < width; i++) {
    const edge = Math.min(i, width - 1 - i);
    const shoulder = Math.min(1, edge / 10);
    const top = base - (20 + noise[i]! * 6) * shoulder - 6;
    for (let y = Math.floor(top); y <= base; y++) g.set(x + i, y, M.fill);
  }
  const tx = x + Math.floor(width / 2) - 4;
  let ground = 0;
  while (ground < MID_H && g.get(tx + 4, ground) === 0) ground++;
  const th = rng.between(20, 28);
  g.rect(tx, ground - th, 9, th + 2, M.fill);
  // Broken crenellations.
  for (let i = 0; i < 9; i += 2) g.rect(tx + i, ground - th - 2, 1, i === 6 ? 1 : 2, M.fill);
  g.rect(tx + 3, ground - th + 6, 2, 3, M.glow);
  g.set(tx + 3, ground - th + 9, M.glowSoft);
  g.set(tx + 4, ground - th + 9, M.glowSoft);
  // An arched stone bridge stub reaching off the cliff.
  for (let i = 0; i < 18; i++) {
    const bx = x + width - 2 + i;
    const by = base - 16 + Math.floor(((i - 9) * (i - 9)) / 14);
    if (i < 14) g.rect(bx, base - 18, 1, Math.max(2, by - (base - 18)), M.fill);
  }
}

function midLayer(p: ZonePalette, rng: CosmeticRng): BackdropLayer {
  const g = new Grid(SCENE_WIDTH, MID_H, ['#00000000', p.mid[0], p.mid[1], p.mid[2], withAlpha(p.mid[2], 110)], true);
  const base = MID_H - 1;
  if (p.zone === 0) {
    const archX = rng.between(130, 170);
    ruinArch(g, rng, archX, base);
    const spots = [rng.between(10, 30), rng.between(70, 100), rng.between(200, 230)];
    spots.forEach((x, i) => deadTree(g, rng, x, base, rng.between(44, 70) - i * 6));
    for (let i = 0; i < 7; i++) reeds(g, rng, rng.int(SCENE_WIDTH), base, rng.between(3, 6), rng.between(6, 12));
    // Low mounds the trees stand on.
    const mound = tileNoise(() => rng.next(), SCENE_WIDTH, [3, 5, 9]);
    for (let x = 0; x < SCENE_WIDTH; x++) {
      const top = base - 2 - Math.max(0, mound[x]!) * 5;
      for (let y = Math.floor(top); y <= base; y++) g.set(x, y, M.fill);
    }
  } else if (p.zone === 1) {
    const trees = [rng.between(0, 20), rng.between(52, 76), rng.between(176, 196), rng.between(226, 244)];
    trees.forEach((x) => thornTree(g, rng, x, base, rng.between(28, 40)));
    pillar(g, rng, rng.between(110, 128), base);
    pillar(g, rng, rng.between(140, 156), base);
    const mound = tileNoise(() => rng.next(), SCENE_WIDTH, [2, 5, 11]);
    for (let x = 0; x < SCENE_WIDTH; x++) {
      const top = base - 4 - Math.max(-0.5, mound[x]!) * 4;
      for (let y = Math.floor(top); y <= base; y++) g.set(x, y, M.fill);
    }
  } else {
    cliff(g, rng, rng.between(0, 12), base, rng.between(62, 76));
    cliff(g, rng, rng.between(180, 196), base, rng.between(46, 58));
    // Low rocks along the shore line.
    for (let i = 0; i < 9; i++) g.ellipse(rng.int(SCENE_WIDTH), base, rng.range(3, 8), rng.range(2, 4), M.fill);
  }
  g.rimSide(M.rim, M.fill, p.light.side);
  if (p.light.kind === 'moon') g.rimTop(M.rim, M.fill);
  return { id: 'mid', grid: g.toPixelGrid(), x: 0, y: HORIZON_Y - MID_H + 6, parallax: 0.4, tileX: true, depth: 'back', driftPxPerSec: 0 };
}

// ---------------------------------------------------------------- floor

function floorLayer(p: ZonePalette, rng: CosmeticRng, lightX: number): BackdropLayer {
  const h = SCENE_HEIGHT - HORIZON_Y;
  const [base, dark, light, liquid, shine, speck] = p.floor;
  // 1 base, 2 dark, 3 light, 4 liquid, 5 shine, 6 speck
  const g = new Grid(SCENE_WIDTH, h, ['#00000000', base, dark, light, liquid, shine, speck], true);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < SCENE_WIDTH; x++) {
      // Lighter near the horizon (it catches the sky), darker towards the viewer.
      const v = y / h;
      let idx = 1;
      if (v < 0.2) idx = (0.2 - v) / 0.2 > bayer(x, y) ? 3 : 1;
      else if (v > 0.6) idx = (v - 0.6) / 0.4 > bayer(x, y) + 0.15 ? 2 : 1;
      g.set(x, y, idx);
    }
  }
  if (p.zone === 2) {
    // The sea fills the top rows, with a moonlit glitter path under the moon.
    const sea = 11;
    for (let y = 0; y < sea; y++) for (let x = 0; x < SCENE_WIDTH; x++) g.set(x, y, 4);
    for (let y = 0; y < sea; y++) {
      const spread = 3 + y * 1.8;
      for (let k = 0; k < 7; k++) {
        const sx = round(lightX + rng.range(-spread, spread));
        const len = rng.between(2, 5);
        if ((y + k) % 2 === 0 || y < 3) g.hline(sx, sx + len, y, 5);
      }
      for (let k = 0; k < 3; k++) {
        const sx = rng.int(SCENE_WIDTH);
        if (y % 3 === 1) g.hline(sx, sx + rng.between(3, 9), y, 3);
      }
    }
    // Ragged shore line.
    for (let x = 0; x < SCENE_WIDTH; x++) {
      const yy = sea + Math.floor(sin(x * 0.21 + rng.next()) * 1.4 + 1);
      g.vline(x, sea, yy, 4);
      if (x % 5 === 0) g.set(x, yy, 5);
    }
  }
  // Broad dithered patches break up the floor: lit ground and damp, darker hollows.
  for (let i = 0; i < 9; i++) {
    const px = rng.int(SCENE_WIDTH);
    const py = rng.between(p.zone === 2 ? 16 : 6, h - 6);
    const rx = rng.range(14, 36) * (0.6 + py / h);
    const ry = Math.max(2, rx * 0.14);
    const lit = i % 3 !== 0;
    for (let y = Math.floor(py - ry); y <= py + ry; y++) {
      for (let x = Math.floor(px - rx); x <= px + rx; x++) {
        const nx = (x + 0.5 - px) / rx;
        const ny = (y + 0.5 - py) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1 || g.get(x, y) === 4 || g.get(x, y) === 5) continue;
        // Dense in the middle, checkerboard at the rim.
        if (d < 0.45 || (x + y) % 2 === 0) g.set(x, y, lit ? 3 : 2);
      }
    }
  }
  // Pools (marsh water, dew ponds, tide pools) reflecting the sky light.
  const pools = p.zone === 1 ? 3 : 6;
  for (let i = 0; i < pools; i++) {
    const px = rng.int(SCENE_WIDTH);
    const py = rng.between(p.zone === 2 ? 18 : 8, h - 8);
    const rx = rng.range(8, p.zone === 0 ? 26 : 16) * (0.6 + py / h);
    const ry = Math.max(1.6, rx * 0.16);
    g.ellipse(px, py, rx, ry, 4);
    // Lit rim on the far edge and broken glints.
    for (let k = 0; k < 3; k++) {
      const gx = round(px + rng.range(-rx * 0.6, rx * 0.4));
      g.hline(gx, gx + rng.between(1, 4), round(py - ry * 0.3) + k, 5);
    }
    for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      const yy = Math.floor(py + ry + 0.5);
      if (g.get(x, yy - 1) === 4) g.set(x, yy, 2);
    }
  }
  // Ground specks: grass blades, pebbles, flowers.
  const specks = p.zone === 1 ? 60 : 50;
  for (let i = 0; i < specks; i++) {
    const sx = rng.int(SCENE_WIDTH);
    const sy = rng.between(p.zone === 2 ? 14 : 3, h - 1);
    if (g.get(sx, sy) === 4 || g.get(sx, sy) === 5) continue;
    const near = sy / h;
    if (p.zone !== 2 && rng.chance(0.6)) {
      // Grass tuft (a small fan of blades), taller near the viewer; sometimes a flower.
      const th = near > 0.5 ? 3 : 2;
      g.vline(sx, sy - th, sy, 3);
      g.line(sx - 1, sy, sx - 2, sy - th + 1, 3);
      g.line(sx + 1, sy, sx + 2, sy - th + 1, 3);
      if (p.zone === 1 && rng.chance(0.3)) g.set(sx, sy - th - 1, 6);
    } else {
      g.set(sx, sy, rng.chance(0.4) ? 6 : 3);
      if (near > 0.55) g.set(sx + 1, sy, 2);
    }
  }
  if (p.zone !== 1) {
    // Half-sunk stones (marsh rocks, shore boulders) with a lit top edge.
    for (let i = 0; i < (p.zone === 2 ? 12 : 6); i++) {
      const sx = rng.int(SCENE_WIDTH);
      const sy = rng.between(18, h - 4);
      const r = rng.range(1.5, 2.5 + (sy / h) * 4);
      if (g.get(sx, sy) === 4) continue;
      g.ellipse(sx, sy, r * 1.5, r, 2);
      for (let x = Math.floor(sx - r * 1.5); x <= sx + r * 1.5; x++) {
        let y = Math.floor(sy - r);
        while (y <= sy && g.get(x, y) !== 2) y++;
        if (y <= sy) g.set(x, y, 3);
      }
    }
  }
  return { id: 'floor', grid: g.toPixelGrid(), x: 0, y: HORIZON_Y, parallax: 0.6, tileX: true, depth: 'back', driftPxPerSec: 0 };
}

// ---------------------------------------------------------------- foreground fringe

function nearLayer(p: ZonePalette, rng: CosmeticRng): BackdropLayer {
  const h = 30;
  const g = new Grid(SCENE_WIDTH, h, ['#00000000', p.near[0], p.near[1]], true);
  const base = h - 1;
  // Tall clumps only at the tile seam (the screen edges at rest) so creatures stay clear.
  const clumps = [rng.between(-14, 6), rng.between(232, 250), rng.between(112, 140)];
  clumps.forEach((cx, i) => {
    const tall = i === 2 ? 7 : h - 4;
    const n = i === 2 ? 4 : 11;
    for (let k = 0; k < n; k++) {
      const x = cx + rng.between(-12, 12);
      const bh = rng.between(Math.floor(tall / 2), tall);
      const lean = rng.range(-0.35, 0.35);
      if (p.zone === 2) {
        // Shore rocks with kelp.
        if (k % 3 === 0) g.ellipse(x, base, rng.range(4, 9), rng.range(3, Math.min(8, bh / 2)), 1);
        else g.line(x, base, x + lean * bh, base - bh * 0.7, 1);
      } else if (p.zone === 1) {
        // Bramble fronds with thorn nicks.
        g.line(x, base, x + lean * bh, base - bh, 1);
        for (let j = 3; j < bh; j += 3) {
          const fx = round(x + lean * j);
          g.set(fx + (j % 2 === 0 ? 1 : -1), base - j, 1);
          g.set(fx + (j % 2 === 0 ? 2 : -2), base - j - 1, 1);
        }
      } else {
        // Reeds and cattails.
        g.line(x, base, x + lean * bh, base - bh, 1);
        g.line(x + 1, base, x + 1 + lean * bh, base - bh + 1, 1);
        if (rng.chance(0.5)) g.rect(round(x + lean * bh), base - bh - 2, 2, 4, 1);
      }
    }
  });
  // A continuous low lip so the fringe sits on the scene edge.
  const lip = tileNoise(() => rng.next(), SCENE_WIDTH, [3, 7, 15]);
  for (let x = 0; x < SCENE_WIDTH; x++) {
    const top = base - 1 - Math.max(0, lip[x]!) * 3;
    for (let y = Math.floor(top); y <= base; y++) g.set(x, y, 1);
  }
  g.rimSide(2, 1, p.light.side);
  return { id: 'near', grid: g.toPixelGrid(), x: 0, y: SCENE_HEIGHT - h, parallax: 1, tileX: true, depth: 'front', driftPxPerSec: 0 };
}

// ---------------------------------------------------------------- public

/**
 * Backdrop of a zone for a seed: pure, deterministic and independent of the simulation.
 * Layers are in draw order; see `BackdropLayer` for how to place, scroll and tile them.
 */
export function zoneBackdrop(zone: ZoneId, seed: string | number): ZoneBackdrop {
  const p = ZONE_PALETTES[zone];
  const rng = cosmeticRng(`backdrop|${zone}|${seed}`);
  const light = lightLayer(p, rng.fork('light'));
  const lightX = light.x + (light.grid.width - 1) / 2;
  const layers: BackdropLayer[] = [skyLayer(p)];
  const stars = starsLayer(p, rng.fork('stars'));
  if (stars) layers.push(stars);
  layers.push(light, cloudLayer(p, rng.fork('clouds')), farLayer(p, rng.fork('far')), midLayer(p, rng.fork('mid')));
  layers.push(floorLayer(p, rng.fork('floor'), lightX), nearLayer(p, rng.fork('near')));
  return { zone, seed: String(seed), width: SCENE_WIDTH, height: SCENE_HEIGHT, horizonY: HORIZON_Y, layers };
}
