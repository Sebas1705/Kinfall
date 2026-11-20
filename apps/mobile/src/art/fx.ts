// Effect bookkeeping for a stage, independent of the renderer: which effects and floating numbers
// are running, and what they add up to at a given time (particles, per-creature flash, tint,
// offset and opacity, screen shake and wash, the result title). The battle stage and the end scene
// (Skia) both draw from `frame()`. Everything is decorative: nothing here feeds back into the
// battle or its timing. A line-for-line mirror of apps/web/src/art/fx.ts (the web keeps its copy
// out of its main bundle); change both together.
import {
  AMBIENT_PARTICLE_CAP,
  SCREEN_PARTICLE_CAP,
  effectFor,
  floatingNumberStyle,
  keyAt,
  prepareEffect,
  sampleEffect,
  stageAnchors,
  type DrawParticle,
  type EffectId,
  type FloatingNumberKind,
  type FloatingNumberStyle,
  type Hex,
  type Point,
  type PreparedEffect,
} from '@kinfall/core/art/scene';
import type { Side } from '@kinfall/core/sim/state';

/** Hit flashes are at most 2 per second (on top of each effect's own limit). */
export const FLASH_GAP_MS = 500;
/** Effect particles on screen at once, leaving room for the ambient life. */
export const FX_PARTICLE_CAP = SCREEN_PARTICLE_CAP - AMBIENT_PARTICLE_CAP;

export interface BodyFx {
  flash: number;
  tint: { color: Hex; alpha: number } | null;
  offset: Point;
  alpha: number;
}

export interface NumberFx {
  text: string;
  style: FloatingNumberStyle;
  /** Scene px of the text's centre (whole numbers). */
  x: number;
  y: number;
  alpha: number;
  scale: number;
}

export interface FxFrame {
  particles: DrawParticle[];
  bodies: Record<Side, BodyFx>;
  shake: Point;
  screen: { color: Hex; alpha: number } | null;
  title: { text: string; alpha: number; offsetY: number } | null;
  numbers: NumberFx[];
}

export interface AddOptions {
  target: Side | 'screen';
  source?: Side;
  /** Effects keep the reduce-motion setting they started with. */
  reducedMotion: boolean;
  /** Ignore the effect's offset and opacity tracks (the caller animates the body itself). */
  particlesOnly?: boolean;
  /** Real-text title for effects with a title track (Victory / Defeat). */
  title?: string;
  /** Keep the final screen wash and title once the effect is over (until `clear`). */
  hold?: boolean;
}

interface Running {
  prep: PreparedEffect;
  start: number;
  opts: AddOptions;
  noFlash: boolean;
}

interface RunningNumber {
  text: string;
  style: FloatingNumberStyle;
  side: Side;
  start: number;
  reduced: boolean;
  slot: number;
}

const restBody = (): BodyFx => ({ flash: 0, tint: null, offset: { x: 0, y: 0 }, alpha: 1 });
const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

export interface Fx {
  add(effect: EffectId, now: number, opts: AddOptions): void;
  /** A floating number over a creature's head (`+` for heals and souls comes from the style). */
  number(kind: FloatingNumberKind, value: number, side: Side, now: number, reducedMotion: boolean): void;
  frame(now: number): FxFrame;
  /** True while something still moves or shows (held titles do not count). */
  busy(now: number): boolean;
  clear(): void;
}

export function createFx(seed: string): Fx {
  let running: Running[] = [];
  let numbers: RunningNumber[] = [];
  let held: { screen: FxFrame['screen']; title: FxFrame['title'] } | null = null;
  let lastFlash = -Infinity;
  let counter = 0;

  const anchors = { player: stageAnchors('player'), enemy: stageAnchors('enemy') };

  const isDone = (r: Running, now: number) => {
    const d = r.prep.descriptor;
    const t = now - r.start;
    if (!r.opts.reducedMotion) return t >= d.durationMs;
    if (d.reduced.mode === 'none') return true;
    if (d.reduced.mode === 'instant') return t > 0;
    return t >= d.reduced.holdMs;
  };

  const numberLife = (n: RunningNumber) => (n.reduced ? n.style.reducedHoldMs : n.style.durationMs);

  const fx: Fx = {
    add(effect, now, opts) {
      const descriptor = effectFor(effect);
      const prep = prepareEffect(descriptor, `${seed}|${counter++}`);
      // A flash inside the gap is dropped (the rest of the effect still plays).
      const flashes = !opts.reducedMotion && (descriptor.tracks.flash?.some((k) => k.v > 0) ?? false);
      const noFlash = flashes && now - lastFlash < FLASH_GAP_MS;
      if (flashes && !noFlash) lastFlash = now;
      if (opts.hold) held = null;
      running.push({ prep, start: now, opts, noFlash });
    },
    number(kind, value, side, now, reducedMotion) {
      const style = floatingNumberStyle(kind);
      // Numbers that overlap in time on one side step sideways so they never sit on each other.
      const live = numbers.filter((n) => n.side === side && now - n.start < numberLife(n));
      numbers.push({ text: `${style.prefix}${Math.max(0, Math.round(value))}`, style, side, start: now, reduced: reducedMotion, slot: live.length });
    },
    frame(now) {
      const out: FxFrame = {
        particles: [],
        bodies: { player: restBody(), enemy: restBody() },
        shake: { x: 0, y: 0 },
        screen: held?.screen ?? null,
        title: held?.title ?? null,
        numbers: [],
      };
      const keep: Running[] = [];
      for (const r of running) {
        const t = now - r.start;
        const target = r.opts.target === 'screen' ? null : r.opts.target;
        const at = target ?? 'enemy';
        const src = r.opts.source ?? (target ? other(target) : 'player');
        const f = sampleEffect(r.prep, {
          tMs: Math.max(0, t),
          target: anchors[at].centre,
          ground: anchors[at].feet,
          source: anchors[src].centre,
          facing: anchors[src].facing,
          reducedMotion: r.opts.reducedMotion,
        });
        const done = f.done || isDone(r, now);
        const room = FX_PARTICLE_CAP - out.particles.length;
        if (!done && room > 0) out.particles.push(...f.particles.slice(0, room));
        if (target) {
          const b = out.bodies[target];
          if (!r.noFlash) b.flash = Math.max(b.flash, f.flash);
          if (f.tint && (!b.tint || f.tint.alpha > b.tint.alpha)) b.tint = f.tint;
          if (!r.opts.particlesOnly) {
            b.offset = { x: b.offset.x + f.offset.x, y: b.offset.y + f.offset.y };
            b.alpha *= f.alpha;
          }
        }
        // Shakes do not add up past the strongest one (the spec caps it at 3 px).
        if (Math.abs(f.shake.x) > Math.abs(out.shake.x)) out.shake.x = f.shake.x;
        if (Math.abs(f.shake.y) > Math.abs(out.shake.y)) out.shake.y = f.shake.y;
        if (f.screen && f.screen.alpha > (out.screen?.alpha ?? 0)) out.screen = f.screen;
        if (f.title && r.opts.title && f.title.alpha > 0) out.title = { text: r.opts.title, alpha: f.title.alpha, offsetY: f.title.offsetY };
        if (done) {
          if (r.opts.hold) held = { screen: f.screen, title: out.title ?? (r.opts.title && f.title ? { text: r.opts.title, alpha: f.title.alpha, offsetY: 0 } : null) };
        } else keep.push(r);
      }
      running = keep;
      if (held) {
        if (!out.screen && held.screen) out.screen = held.screen;
        if (!out.title && held.title) out.title = held.title;
      }
      numbers = numbers.filter((n) => now - n.start < numberLife(n));
      for (const n of numbers) {
        const t = n.reduced ? 0 : now - n.start;
        const head = anchors[n.side].centre;
        const step = n.slot % 3;
        out.numbers.push({
          text: n.text,
          style: n.style,
          x: head.x + (step === 1 ? 12 : step === 2 ? -12 : 0),
          y: head.y - 30 + Math.round(keyAt(n.style.offsetY, t)),
          alpha: n.reduced ? 1 : keyAt(n.style.alpha, t, 1),
          scale: keyAt(n.style.scale, t, 1),
        });
      }
      return out;
    },
    busy(now) {
      return running.some((r) => !isDone(r, now)) || numbers.some((n) => now - n.start < numberLife(n));
    },
    clear() {
      running = [];
      numbers = [];
      held = null;
      lastFlash = -Infinity;
    },
  };
  return fx;
}
