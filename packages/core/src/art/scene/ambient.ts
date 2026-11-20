// Ambient life per zone: a looping particle field (rising embers and ash, fireflies, drifting mist
// and sparkles). Data only; `sampleAmbient` (sampler.ts) turns it into particles for a time.
import type { Hex } from './color';
import { ZONE_PALETTES, type ZoneId } from './palettes';
import type { ParticleSpriteId } from './sprites';

export interface AmbientLayer {
  kind: 'embers' | 'ash' | 'fireflies' | 'leaves' | 'mist' | 'sparkles';
  sprite: ParticleSpriteId;
  colors: Hex[];
  count: number;
  /** Spawn area in scene px (particles wrap around it). */
  area: { x: number; y: number; w: number; h: number };
  /** Each particle lives this long, then respawns somewhere else in the area. */
  lifeMs: [number, number];
  /** Constant velocity in px/s. */
  vx: [number, number];
  vy: [number, number];
  /** Sideways sway: amplitude in px and period in ms. */
  swayPx: number;
  swayMs: number;
  /** Blink period in ms (0 = steady). */
  blinkMs: number;
  glow: boolean;
  /** 'back' = behind the creatures, 'front' = over them. */
  depth: 'back' | 'front';
  /** Opacity of every particle (mist is faint). */
  alpha: number;
}

export interface AmbientConfig {
  zone: ZoneId;
  layers: AmbientLayer[];
  /**
   * Reduced motion: draw `reducedCount` particles per layer frozen at t = 0 (a still scene
   * keeps its fireflies, it just does not move).
   */
  reducedCount: number;
}

/** Ambient particles on screen at once never exceed this (all layers). */
export const AMBIENT_PARTICLE_CAP = 32;

/** Ambient life of a zone. */
export function ambientFor(zone: ZoneId): AmbientConfig {
  const a = ZONE_PALETTES[zone].ambient;
  const [c0 = '#ffffff', c1 = c0, c2 = c1, c3 = c2] = a;
  const sky = { x: 0, y: 8, w: 256, h: 120 };
  switch (zone) {
    case 0:
      return {
        zone,
        reducedCount: 4,
        layers: [
          { kind: 'embers', sprite: 'mote', colors: [c0, c1, c2], count: 14, area: { x: 0, y: 70, w: 256, h: 74 }, lifeMs: [2600, 4200], vx: [-3, 6], vy: [-16, -8], swayPx: 3, swayMs: 1800, blinkMs: 0, glow: true, depth: 'back', alpha: 1 },
          { kind: 'ash', sprite: 'flake', colors: [c3], count: 8, area: sky, lifeMs: [5000, 7000], vx: [4, 9], vy: [3, 7], swayPx: 4, swayMs: 2600, blinkMs: 0, glow: false, depth: 'front', alpha: 0.8 },
        ],
      };
    case 1:
      return {
        zone,
        reducedCount: 6,
        layers: [
          { kind: 'fireflies', sprite: 'dot', colors: [c0, c1], count: 16, area: { x: 0, y: 40, w: 256, h: 96 }, lifeMs: [4000, 6500], vx: [-4, 4], vy: [-3, 2], swayPx: 6, swayMs: 2200, blinkMs: 1400, glow: true, depth: 'back', alpha: 1 },
          { kind: 'leaves', sprite: 'leaf', colors: [c2, c3], count: 5, area: sky, lifeMs: [6000, 8000], vx: [6, 12], vy: [5, 9], swayPx: 6, swayMs: 1600, blinkMs: 0, glow: false, depth: 'front', alpha: 1 },
        ],
      };
    case 2:
      return {
        zone,
        reducedCount: 5,
        layers: [
          { kind: 'mist', sprite: 'wisp', colors: [c0, c3], count: 8, area: { x: 0, y: 78, w: 256, h: 60 }, lifeMs: [6000, 9000], vx: [3, 7], vy: [-1, 1], swayPx: 2, swayMs: 3000, blinkMs: 0, glow: false, depth: 'back', alpha: 0.35 },
          { kind: 'sparkles', sprite: 'spark', colors: [c1, c2], count: 10, area: { x: 0, y: 10, w: 256, h: 120 }, lifeMs: [2200, 3600], vx: [-2, 2], vy: [-6, -2], swayPx: 2, swayMs: 2000, blinkMs: 900, glow: true, depth: 'back', alpha: 1 },
        ],
      };
  }
}
