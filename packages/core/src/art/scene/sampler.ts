// Stateless samplers: given an effect (or ambient config), a seed and a time, return exactly what
// to draw this frame. Both renderers call these, so web and mobile show the same effect for the
// same seed. Positions are whole scene pixels; renderers multiply by their integer scale.
import type { AmbientConfig, AmbientLayer } from './ambient';
import type { Hex } from './color';
import { cosmeticRng } from './cosmeticRng';
import type { EffectDescriptor, Emitter, Keyframe } from './effects';
import { cos, damped, PI, round, sin } from './fixedMath';
import type { ParticleSpriteId } from './sprites';

export interface DrawParticle {
  /** Centre in scene px (whole numbers). */
  x: number;
  y: number;
  sprite: ParticleSpriteId;
  /** Whole-number sprite multiplier. */
  size: number;
  color: Hex;
  /** 0-1. */
  alpha: number;
  depth: 'back' | 'front';
}

export interface Point {
  x: number;
  y: number;
}

export interface EffectContext {
  /** Milliseconds since the effect started. */
  tMs: number;
  /** Target creature centre and feet in scene px (see stageAnchors). */
  target: Point;
  ground: Point;
  /** Source creature centre (for travelling moves); defaults to the target. */
  source?: Point;
  /** +1 when the effect travels left-to-right (player attacking), -1 the other way. */
  facing: 1 | -1;
  reducedMotion: boolean;
}

export interface EffectFrame {
  particles: DrawParticle[];
  /** White flash over the target sprite, 0-1. */
  flash: number;
  /** Target sprite offset and opacity. */
  offset: Point;
  alpha: number;
  tint: { color: Hex; alpha: number } | null;
  /** Screen shake offset in scene px (whole numbers). */
  shake: Point;
  screen: { color: Hex; alpha: number } | null;
  title: { alpha: number; offsetY: number } | null;
  /** True once `tMs` is past the effect (or its reduced-motion hold). */
  done: boolean;
}

/** Value of a keyframe track at time t (linear, held at both ends); `fallback` when absent. */
export function keyAt(keys: Keyframe[] | undefined, t: number, fallback = 0): number {
  if (!keys || keys.length === 0) return fallback;
  const first = keys[0]!;
  if (t <= first.t) return first.v;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t <= b.t) {
      const a = keys[i - 1]!;
      return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    }
  }
  return keys[keys.length - 1]!.v;
}

interface Seeded {
  spawn: number;
  life: number;
  ox: number;
  oy: number;
  speed: number;
  angle: number;
  color: Hex;
}

export interface PreparedEffect {
  descriptor: EffectDescriptor;
  particles: Seeded[][];
}

/** Draws every random choice of an effect once (per seed); sample it as often as needed. */
export function prepareEffect(descriptor: EffectDescriptor, seed: string | number): PreparedEffect {
  const rng = cosmeticRng(`effect|${descriptor.id}|${seed}`);
  const particles = descriptor.emitters.map((e, ei) => {
    const r = rng.fork(String(ei));
    const out: Seeded[] = [];
    for (let i = 0; i < e.count; i++) {
      out.push({
        spawn: e.startMs + (e.count > 1 ? (e.spawnMs * i) / (e.count - 1) : 0),
        life: r.range(e.lifeMs[0], e.lifeMs[1]),
        ox: r.range(e.offsetX[0], e.offsetX[1]),
        oy: r.range(e.offsetY[0], e.offsetY[1]),
        speed: r.range(e.speed[0], e.speed[1]),
        angle: r.range(e.angle[0], e.angle[1]),
        color: r.pick(e.colors),
      });
    }
    return out;
  });
  return { descriptor, particles };
}

function origin(e: Emitter, ctx: EffectContext): Point {
  switch (e.from) {
    case 'ground':
      return ctx.ground;
    case 'source':
      return ctx.source ?? ctx.target;
    case 'screen':
      return e.screenPoint ?? { x: 128, y: 72 };
    default:
      return ctx.target;
  }
}

function particleAt(e: Emitter, s: Seeded, ctx: EffectContext, t: number, depth: 'back' | 'front'): DrawParticle | null {
  const age = t - s.spawn;
  if (age < 0 || age > s.life) return null;
  const u = age / s.life;
  const sec = age / 1000;
  const o = origin(e, ctx);
  const f = e.from === 'screen' ? 1 : ctx.facing;
  const ox = o.x + s.ox * f;
  const oy = o.y + s.oy;
  const rad = (s.angle * PI) / 180;
  let x: number;
  let y: number;
  switch (e.motion) {
    case 'travel': {
      const to = ctx.target;
      x = ox + (to.x - (o.x)) * u;
      y = oy + (to.y - o.y) * u - (e.arc ?? 0) * 4 * u * (1 - u);
      break;
    }
    case 'converge': {
      const dist = (s.speed * s.life) / 1000;
      const k = 1 - (1 - u) * (1 - u);
      x = ox + cos(rad) * dist * (1 - k);
      y = oy - sin(rad) * dist * (1 - k);
      break;
    }
    case 'orbit': {
      const a = rad + 2 * PI * (e.arc ?? 1) * sec;
      const r = s.speed * (1 - u * 0.4);
      x = ox + cos(a) * r;
      y = oy + sin(a) * r * 0.5;
      break;
    }
    default: {
      const d = damped(sec, e.drag);
      x = ox + cos(rad) * f * s.speed * d;
      y = oy - sin(rad) * s.speed * d + 0.5 * e.gravity * sec * sec;
    }
  }
  let alpha = 1;
  if (e.fadeInMs > 0 && age < e.fadeInMs) alpha = age / e.fadeInMs;
  if (e.fadeOutMs > 0 && s.life - age < e.fadeOutMs) alpha = Math.min(alpha, (s.life - age) / e.fadeOutMs);
  if (e.blinkMs && Math.floor((age + s.spawn) / (e.blinkMs / 2)) % 2 === 1) alpha *= 0.25;
  const size = Math.max(1, round(e.size[0] + (e.size[1] - e.size[0]) * u));
  return { x: round(x), y: round(y), sprite: e.sprite, size, color: s.color, alpha: round(alpha * 100) / 100, depth };
}

function glowOf(p: DrawParticle): DrawParticle {
  return { ...p, size: p.size + 1, alpha: round(p.alpha * 35) / 100 };
}

/**
 * The frame of a prepared effect at `ctx.tMs`. With `reducedMotion` it follows the descriptor's
 * `reduced` rule: a frozen frame without shake or flash, the end state at once, or nothing.
 */
export function sampleEffect(prepared: PreparedEffect, ctx: EffectContext): EffectFrame {
  const d = prepared.descriptor;
  const tr = d.tracks;
  const reduced = ctx.reducedMotion;
  const mode = reduced ? d.reduced.mode : 'full';
  const end = d.durationMs;
  const empty: EffectFrame = {
    particles: [],
    flash: 0,
    offset: { x: 0, y: 0 },
    alpha: 1,
    tint: null,
    shake: { x: 0, y: 0 },
    screen: null,
    title: null,
    done: true,
  };
  if (mode === 'none') return empty;
  if (mode === 'instant') {
    // End state only: where the target ends up, the final screen wash and title.
    return {
      ...empty,
      offset: { x: round(keyAt(tr.offsetX, end) * ctx.facing), y: round(keyAt(tr.offsetY, end)) },
      alpha: keyAt(tr.alpha, end, 1),
      screen: tr.screen ? { color: tr.screen.color, alpha: keyAt(tr.screen.alpha, end) } : null,
      title: tr.title ? { alpha: keyAt(tr.title.alpha, end), offsetY: 0 } : null,
    };
  }
  const frozen = mode === 'static';
  const t = frozen ? d.reduced.atMs : ctx.tMs;
  const done = frozen ? ctx.tMs >= d.reduced.holdMs : ctx.tMs >= end;
  const particles: DrawParticle[] = [];
  if (!done) {
    d.emitters.forEach((e, ei) => {
      // A frozen frame never shows projectiles mid-flight.
      if (frozen && e.motion === 'travel') return;
      for (const s of prepared.particles[ei] ?? []) {
        const p = particleAt(e, s, ctx, t, 'front');
        if (!p) continue;
        if (e.glow) particles.push(glowOf(p));
        particles.push(p);
      }
    });
  }
  const tintAlpha = tr.tint ? keyAt(tr.tint.alpha, frozen ? end : t) : 0;
  const shakeAmp = frozen ? 0 : keyAt(tr.shake, t);
  // Shake alternates direction every 40 ms; deterministic, no randomness per frame.
  const step = Math.floor(t / 40);
  const shake = shakeAmp > 0 ? { x: round(shakeAmp * (step % 2 === 0 ? 1 : -1)), y: round(shakeAmp * 0.5 * (step % 3 === 0 ? 1 : -1)) } : { x: 0, y: 0 };
  return {
    particles: done ? [] : particles,
    flash: frozen ? 0 : keyAt(tr.flash, t),
    offset: frozen
      ? { x: round(keyAt(tr.offsetX, end) * ctx.facing), y: round(keyAt(tr.offsetY, end)) }
      : { x: round(keyAt(tr.offsetX, t) * ctx.facing), y: round(keyAt(tr.offsetY, t)) },
    alpha: keyAt(tr.alpha, frozen ? end : t, 1),
    tint: tr.tint && tintAlpha > 0 && !done ? { color: tr.tint.color, alpha: round(tintAlpha * 100) / 100 } : null,
    shake: { x: shake.x, y: shake.y },
    screen: tr.screen ? { color: tr.screen.color, alpha: keyAt(tr.screen.alpha, frozen ? end : t) } : null,
    title: tr.title ? { alpha: keyAt(tr.title.alpha, frozen ? end : t), offsetY: frozen ? 0 : round(keyAt(tr.title.offsetY, t)) } : null,
    done,
  };
}

/** Integer hash of (a, b, c) to [0, 1): cheap per-frame randomness for ambient respawns. */
function h3(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export interface PreparedAmbient {
  config: AmbientConfig;
  /** Per layer, per particle: life, phase, velocity, colour. */
  particles: { life: number; phase: number; vx: number; vy: number; color: Hex; swayPhase: number; seedKey: number }[][];
}

export function prepareAmbient(config: AmbientConfig, seed: string | number): PreparedAmbient {
  const rng = cosmeticRng(`ambient|${config.zone}|${seed}`);
  return {
    config,
    particles: config.layers.map((l: AmbientLayer, li) => {
      const r = rng.fork(String(li));
      return Array.from({ length: l.count }, (_, i) => ({
        life: r.range(l.lifeMs[0], l.lifeMs[1]),
        phase: r.range(0, l.lifeMs[1]),
        vx: r.range(l.vx[0], l.vx[1]),
        vy: r.range(l.vy[0], l.vy[1]),
        color: r.pick(l.colors),
        swayPhase: r.range(0, PI * 2),
        seedKey: Math.floor(r.next() * 0x7fffffff) ^ (li * 7919 + i),
      }));
    }),
  };
}

/**
 * Ambient particles at time `tMs`. With `reducedMotion` a fixed subset (`reducedCount` per layer)
 * is drawn frozen at t = 0, so the scene keeps its life without movement.
 */
export function sampleAmbient(prepared: PreparedAmbient, tMs: number, reducedMotion: boolean): DrawParticle[] {
  const out: DrawParticle[] = [];
  const t = reducedMotion ? 0 : tMs;
  prepared.config.layers.forEach((l, li) => {
    const list = prepared.particles[li] ?? [];
    const n = reducedMotion ? Math.min(list.length, prepared.config.reducedCount) : list.length;
    for (let i = 0; i < n; i++) {
      const p = list[i]!;
      const local = t + p.phase;
      const cycle = Math.floor(local / p.life);
      const age = local - cycle * p.life;
      const sec = age / 1000;
      // Respawn position changes every cycle, from a hash (no state kept between frames).
      const sx = l.area.x + h3(p.seedKey, cycle, 1) * l.area.w;
      const sy = l.area.y + h3(p.seedKey, cycle, 2) * l.area.h;
      const sway = l.swayPx * sin((2 * PI * age) / l.swayMs + p.swayPhase);
      const x = sx + p.vx * sec + sway;
      const y = sy + p.vy * sec;
      const u = age / p.life;
      // Fade in and out over the first and last 15% of each life.
      let alpha = l.alpha * Math.min(1, u / 0.15, (1 - u) / 0.15);
      if (reducedMotion) alpha = l.alpha;
      if (l.blinkMs > 0 && !reducedMotion) {
        const b = sin((2 * PI * age) / l.blinkMs + p.swayPhase);
        alpha *= b > 0 ? 1 : 0.15;
      }
      const wx = ((round(x) % 256) + 256) % 256;
      const part: DrawParticle = { x: wx, y: round(y), sprite: l.sprite, size: 1, color: p.color, alpha: round(alpha * 100) / 100, depth: l.depth };
      if (l.glow) out.push({ ...part, size: 2, alpha: round(part.alpha * 35) / 100 });
      out.push(part);
    }
  });
  return out;
}
