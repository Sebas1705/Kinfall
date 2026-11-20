// Effect catalogue: element move effects and battle/run event flourishes as plain data
// (emitters + keyframe tracks + a reduced-motion fallback). Renderers never interpret physics
// themselves: they call `sampleEffect` (sampler.ts) each frame and draw what it returns.
import type { Content, ElementId } from '../../content/schema';
import type { BattleEvent, Side } from '../../sim/state';
import type { Hex } from './color';
import { ELEMENT_FX, NEUTRAL_FX } from './palettes';
import type { ParticleSpriteId } from './sprites';

/** A value over time: linear between keys, held before the first and after the last. */
export interface Keyframe {
  /** Milliseconds from the start of the effect. */
  t: number;
  v: number;
}

export interface Emitter {
  sprite: ParticleSpriteId;
  /** One colour is picked per particle. */
  colors: Hex[];
  count: number;
  /** First spawn, ms from the effect start; spawns spread evenly over `spawnMs`. */
  startMs: number;
  spawnMs: number;
  /** Particle lifetime range in ms. */
  lifeMs: [number, number];
  /**
   * Where particles start: the target creature's centre, its feet (the ground), the source
   * creature's centre, or a fixed point of the 256x144 scene (`screenPoint`).
   */
  from: 'target' | 'ground' | 'source' | 'screen';
  screenPoint?: { x: number; y: number };
  /** Random spawn box around the origin, in scene px (x is mirrored with `facing`). */
  offsetX: [number, number];
  offsetY: [number, number];
  /** Motion. 'burst': ballistic from the origin. 'travel': source -> target with an arc.
   * 'converge': from a ring of radius `speed * life` into the origin. 'orbit': circles the origin. */
  motion: 'burst' | 'travel' | 'converge' | 'orbit';
  /** px per second (burst/converge) or orbit radius in px (orbit). */
  speed: [number, number];
  /** Degrees, 0 = towards the facing direction, 90 = up. */
  angle: [number, number];
  /** px/s^2, positive pulls down, negative lifts. */
  gravity: number;
  /** Exponential velocity damping per second (0 = none). */
  drag: number;
  /** Arc height in px for 'travel'; turns per second for 'orbit'. */
  arc?: number;
  /**
   * Sprite multiplier at birth and at death (whole numbers 1-5, interpolated and rounded).
   * Effects default to 2, the creatures' pixel density; ambient life uses 1, the backdrop's.
   */
  size: [number, number];
  fadeInMs: number;
  fadeOutMs: number;
  /** Draw a dim 35% halo one size larger under each particle. */
  glow?: boolean;
  /** Blink period in ms (fireflies, motes): visible half the period. */
  blinkMs?: number;
}

export interface EffectTracks {
  /** White flash over the target sprite, 0-1. Kept to at most 2 pulses per second. */
  flash?: Keyframe[];
  /** Target sprite offset in scene px (x is multiplied by the facing). */
  offsetX?: Keyframe[];
  offsetY?: Keyframe[];
  /** Target sprite opacity, 0-1. */
  alpha?: Keyframe[];
  /** Colour wash over the target sprite. */
  tint?: { color: Hex; alpha: Keyframe[] };
  /** Screen shake amplitude in scene px. */
  shake?: Keyframe[];
  /** Full-screen colour wash (defeat dim). */
  screen?: { color: Hex; alpha: Keyframe[] };
  /**
   * Motion for a real-text title the platform shows (Victory / Defeat): opacity and vertical
   * offset in scene px. The words come from i18n, never from the art.
   */
  title?: { alpha: Keyframe[]; offsetY: Keyframe[] };
}

export type EffectId =
  | 'move.ember'
  | 'move.thorn'
  | 'move.tide'
  | 'move.gale'
  | 'move.umbra'
  | 'hit'
  | 'superEffective'
  | 'resisted'
  | 'miss'
  | 'heal'
  | 'faint'
  | 'evolve'
  | 'recruit'
  | 'levelUp'
  | 'soulGain'
  | 'victory'
  | 'defeat';

export interface EffectDescriptor {
  id: EffectId;
  durationMs: number;
  emitters: Emitter[];
  tracks: EffectTracks;
  /**
   * Reduced motion: 'static' shows one frozen frame (sampled at `atMs`) for `holdMs` with no
   * shake, no flash and no travel; 'instant' jumps straight to the end state of the tracks
   * (a fainted creature is simply gone); 'none' draws nothing.
   */
  reduced: { mode: 'static' | 'instant' | 'none'; atMs: number; holdMs: number };
}

/** Particle cap per effect, and for everything on screen at once (ambient included). */
export const EFFECT_PARTICLE_CAP = 40;
/** Ambient (32) plus two overlapping effects (a move and an event, 40 each). */
export const SCREEN_PARTICLE_CAP = 112;

const base = {
  startMs: 0,
  spawnMs: 0,
  offsetX: [0, 0] as [number, number],
  offsetY: [0, 0] as [number, number],
  gravity: 0,
  drag: 0,
  size: [2, 2] as [number, number],
  fadeInMs: 0,
  fadeOutMs: 120,
};

function emitter(e: Partial<Emitter> & Pick<Emitter, 'sprite' | 'colors' | 'count' | 'lifeMs' | 'from' | 'motion' | 'speed' | 'angle'>): Emitter {
  return { ...base, ...e };
}

function moveEffect(element: ElementId): EffectDescriptor {
  const c = ELEMENT_FX[element];
  const impactAt = 260;
  switch (element) {
    case 'ember':
      return {
        id: 'move.ember',
        durationMs: 760,
        emitters: [
          emitter({ sprite: 'ember', colors: [c.core, c.spark], count: 3, spawnMs: 60, lifeMs: [220, 240], from: 'source', motion: 'travel', speed: [0, 0], angle: [0, 0], arc: 10, offsetY: [-3, 3], glow: true, fadeOutMs: 0 }),
          emitter({ sprite: 'ember', colors: [c.core, c.main, c.spark], count: 14, startMs: impactAt, spawnMs: 80, lifeMs: [300, 480], from: 'target', motion: 'burst', speed: [30, 80], angle: [20, 160], gravity: -40, drag: 2, offsetX: [-6, 6], offsetY: [-4, 8], glow: true, fadeOutMs: 160 }),
          emitter({ sprite: 'mote', colors: [c.deep], count: 5, startMs: impactAt + 60, spawnMs: 120, lifeMs: [380, 460], from: 'target', motion: 'burst', speed: [8, 16], angle: [70, 110], gravity: -10, offsetX: [-8, 8], fadeInMs: 60, fadeOutMs: 200 }),
        ],
        tracks: {},
        reduced: { mode: 'static', atMs: impactAt + 90, holdMs: 300 },
      };
    case 'thorn':
      return {
        id: 'move.thorn',
        durationMs: 760,
        emitters: [
          emitter({ sprite: 'thorn', colors: [c.main, c.deep], count: 6, startMs: 200, spawnMs: 120, lifeMs: [360, 420], from: 'ground', motion: 'burst', speed: [70, 110], angle: [78, 102], drag: 9, offsetX: [-16, 16], offsetY: [-2, 2], size: [2, 2], fadeOutMs: 120 }),
          emitter({ sprite: 'leaf', colors: [c.main, c.spark, c.core], count: 10, spawnMs: 200, lifeMs: [520, 640], from: 'target', motion: 'orbit', speed: [14, 22], angle: [0, 360], arc: 1.2, fadeInMs: 80, fadeOutMs: 180 }),
        ],
        tracks: {},
        reduced: { mode: 'static', atMs: 330, holdMs: 300 },
      };
    case 'tide':
      return {
        id: 'move.tide',
        durationMs: 800,
        emitters: [
          emitter({ sprite: 'droplet', colors: [c.main, c.core], count: 4, spawnMs: 80, lifeMs: [250, 270], from: 'source', motion: 'travel', speed: [0, 0], angle: [0, 0], arc: 18, offsetY: [-3, 3], fadeOutMs: 0 }),
          emitter({ sprite: 'droplet', colors: [c.main, c.core, c.spark], count: 12, startMs: 300, spawnMs: 60, lifeMs: [340, 440], from: 'target', motion: 'burst', speed: [50, 95], angle: [35, 145], gravity: 260, offsetX: [-4, 4], fadeOutMs: 100 }),
          emitter({ sprite: 'ring', colors: [c.spark], count: 2, startMs: 320, spawnMs: 140, lifeMs: [380, 420], from: 'ground', motion: 'burst', speed: [0, 0], angle: [0, 0], size: [2, 5], fadeOutMs: 220 }),
        ],
        tracks: {},
        reduced: { mode: 'static', atMs: 400, holdMs: 300 },
      };
    case 'gale':
      return {
        id: 'move.gale',
        durationMs: 680,
        emitters: [
          emitter({ sprite: 'streak', colors: [c.core, c.main, c.spark], count: 7, spawnMs: 220, lifeMs: [200, 280], from: 'target', motion: 'burst', speed: [240, 320], angle: [-6, 6], offsetX: [-60, -40], offsetY: [-18, 18], fadeInMs: 40, fadeOutMs: 60 }),
          emitter({ sprite: 'swirl', colors: [c.main, c.spark], count: 8, startMs: 160, spawnMs: 160, lifeMs: [420, 520], from: 'target', motion: 'orbit', speed: [10, 20], angle: [0, 360], arc: 1.8, fadeInMs: 60, fadeOutMs: 160 }),
        ],
        tracks: {},
        reduced: { mode: 'static', atMs: 300, holdMs: 300 },
      };
    case 'umbra':
      return {
        id: 'move.umbra',
        durationMs: 840,
        emitters: [
          emitter({ sprite: 'wisp', colors: [c.main, c.deep, c.spark], count: 12, spawnMs: 160, lifeMs: [380, 440], from: 'target', motion: 'converge', speed: [70, 100], angle: [0, 360], fadeInMs: 120, fadeOutMs: 60 }),
          emitter({ sprite: 'mote', colors: [c.core, c.spark], count: 8, startMs: 500, spawnMs: 40, lifeMs: [260, 320], from: 'target', motion: 'burst', speed: [40, 70], angle: [0, 360], drag: 3, glow: true, fadeOutMs: 140 }),
        ],
        tracks: { tint: { color: c.deep, alpha: [{ t: 0, v: 0 }, { t: 420, v: 0.45 }, { t: 560, v: 0.2 }, { t: 840, v: 0 }] } },
        reduced: { mode: 'static', atMs: 520, holdMs: 300 },
      };
  }
}

const N = NEUTRAL_FX;

const EVENTS: Record<Exclude<EffectId, `move.${ElementId}`>, EffectDescriptor> = {
  hit: {
    id: 'hit',
    durationMs: 280,
    emitters: [emitter({ sprite: 'spark', colors: [N.impact, N.impactWarm], count: 5, lifeMs: [160, 220], from: 'target', motion: 'burst', speed: [50, 90], angle: [0, 360], drag: 6, offsetX: [-4, 4], offsetY: [-4, 4], fadeOutMs: 80 })],
    tracks: {
      flash: [{ t: 0, v: 1 }, { t: 70, v: 1 }, { t: 90, v: 0 }],
      offsetX: [{ t: 0, v: 0 }, { t: 40, v: 3 }, { t: 200, v: 0 }],
      shake: [{ t: 0, v: 1 }, { t: 140, v: 1 }, { t: 160, v: 0 }],
    },
    reduced: { mode: 'static', atMs: 60, holdMs: 200 },
  },
  superEffective: {
    id: 'superEffective',
    durationMs: 460,
    emitters: [
      emitter({ sprite: 'star', colors: [N.impact, N.impactWarm, N.gold], count: 10, lifeMs: [260, 360], from: 'target', motion: 'burst', speed: [60, 110], angle: [0, 360], drag: 4, fadeOutMs: 120 }),
      emitter({ sprite: 'ring', colors: [N.impactWarm], count: 1, lifeMs: [300, 300], from: 'target', motion: 'burst', speed: [0, 0], angle: [0, 0], size: [2, 5], fadeOutMs: 160 }),
    ],
    tracks: {
      flash: [{ t: 0, v: 1 }, { t: 70, v: 1 }, { t: 90, v: 0 }, { t: 160, v: 0 }, { t: 170, v: 0.8 }, { t: 230, v: 0.8 }, { t: 250, v: 0 }],
      offsetX: [{ t: 0, v: 0 }, { t: 40, v: 5 }, { t: 280, v: 0 }],
      shake: [{ t: 0, v: 3 }, { t: 220, v: 2 }, { t: 280, v: 0 }],
    },
    reduced: { mode: 'static', atMs: 80, holdMs: 300 },
  },
  resisted: {
    id: 'resisted',
    durationMs: 380,
    emitters: [emitter({ sprite: 'mote', colors: [N.dull, N.dullDark], count: 4, lifeMs: [260, 320], from: 'target', motion: 'burst', speed: [12, 22], angle: [60, 120], drag: 2, offsetX: [-6, 6], fadeOutMs: 160 })],
    tracks: { tint: { color: N.dull, alpha: [{ t: 0, v: 0.4 }, { t: 240, v: 0.4 }, { t: 320, v: 0 }] } },
    reduced: { mode: 'static', atMs: 60, holdMs: 240 },
  },
  miss: {
    id: 'miss',
    durationMs: 320,
    emitters: [emitter({ sprite: 'streak', colors: [N.dull], count: 3, spawnMs: 80, lifeMs: [180, 220], from: 'target', motion: 'burst', speed: [180, 220], angle: [-4, 4], offsetX: [-40, -30], offsetY: [-20, -12], fadeInMs: 30, fadeOutMs: 80 })],
    tracks: { offsetX: [{ t: 0, v: 0 }, { t: 80, v: -4 }, { t: 260, v: 0 }] },
    reduced: { mode: 'none', atMs: 0, holdMs: 0 },
  },
  heal: {
    id: 'heal',
    durationMs: 900,
    emitters: [emitter({ sprite: 'plus', colors: [N.heal, N.healCore], count: 12, spawnMs: 420, lifeMs: [560, 720], from: 'ground', motion: 'burst', speed: [16, 30], angle: [84, 96], offsetX: [-14, 14], offsetY: [-2, 0], glow: true, fadeInMs: 100, fadeOutMs: 220 })],
    tracks: { tint: { color: N.heal, alpha: [{ t: 0, v: 0 }, { t: 300, v: 0.35 }, { t: 900, v: 0 }] } },
    reduced: { mode: 'static', atMs: 500, holdMs: 400 },
  },
  faint: {
    id: 'faint',
    durationMs: 900,
    emitters: [emitter({ sprite: 'mote', colors: [N.ash, N.dull], count: 10, startMs: 300, spawnMs: 200, lifeMs: [420, 560], from: 'ground', motion: 'burst', speed: [14, 30], angle: [20, 160], gravity: 30, offsetX: [-12, 12], fadeOutMs: 200 })],
    tracks: {
      offsetY: [{ t: 0, v: 0 }, { t: 120, v: -3 }, { t: 700, v: 10 }],
      alpha: [{ t: 0, v: 1 }, { t: 200, v: 1 }, { t: 700, v: 0 }],
    },
    reduced: { mode: 'instant', atMs: 0, holdMs: 0 },
  },
  evolve: {
    id: 'evolve',
    durationMs: 1600,
    emitters: [
      emitter({ sprite: 'star', colors: [N.gold, N.impact], count: 14, spawnMs: 500, lifeMs: [420, 480], from: 'target', motion: 'converge', speed: [80, 110], angle: [0, 360], fadeInMs: 120, fadeOutMs: 40 }),
      emitter({ sprite: 'beam', colors: [N.impact, N.gold], count: 8, startMs: 400, spawnMs: 500, lifeMs: [500, 600], from: 'ground', motion: 'burst', speed: [40, 70], angle: [88, 92], offsetX: [-16, 16], fadeInMs: 80, fadeOutMs: 200 }),
      emitter({ sprite: 'spark', colors: [N.impact, N.gold, N.impactWarm], count: 14, startMs: 1000, spawnMs: 60, lifeMs: [400, 560], from: 'target', motion: 'burst', speed: [50, 100], angle: [0, 360], drag: 3, glow: true, fadeOutMs: 200 }),
    ],
    tracks: {
      flash: [{ t: 0, v: 0 }, { t: 900, v: 0 }, { t: 960, v: 0.9 }, { t: 1200, v: 0 }],
      tint: { color: N.gold, alpha: [{ t: 0, v: 0 }, { t: 900, v: 0.5 }, { t: 1300, v: 0 }] },
    },
    reduced: { mode: 'static', atMs: 1050, holdMs: 500 },
  },
  recruit: {
    id: 'recruit',
    durationMs: 1200,
    emitters: [
      emitter({ sprite: 'mote', colors: [N.gold, N.impactWarm, N.impact], count: 12, spawnMs: 300, lifeMs: [600, 700], from: 'target', motion: 'orbit', speed: [22, 30], angle: [0, 360], arc: 1.1, glow: true, fadeInMs: 100, fadeOutMs: 120 }),
      emitter({ sprite: 'star', colors: [N.gold, N.impact], count: 6, startMs: 900, spawnMs: 40, lifeMs: [260, 300], from: 'target', motion: 'burst', speed: [50, 80], angle: [30, 150], drag: 3, fadeOutMs: 120 }),
    ],
    tracks: { offsetY: [{ t: 0, v: 0 }, { t: 860, v: 0 }, { t: 940, v: -5 }, { t: 1040, v: 0 }] },
    reduced: { mode: 'static', atMs: 920, holdMs: 400 },
  },
  levelUp: {
    id: 'levelUp',
    durationMs: 1000,
    emitters: [
      emitter({ sprite: 'ring', colors: [N.gold], count: 2, spawnMs: 200, lifeMs: [420, 460], from: 'ground', motion: 'burst', speed: [0, 0], angle: [0, 0], size: [2, 5], fadeOutMs: 200 }),
      emitter({ sprite: 'star', colors: [N.gold, N.impact], count: 10, startMs: 120, spawnMs: 360, lifeMs: [500, 620], from: 'ground', motion: 'burst', speed: [30, 50], angle: [80, 100], offsetX: [-14, 14], glow: true, fadeInMs: 60, fadeOutMs: 200 }),
    ],
    tracks: { offsetY: [{ t: 0, v: 0 }, { t: 120, v: -4 }, { t: 260, v: 0 }] },
    reduced: { mode: 'static', atMs: 400, holdMs: 400 },
  },
  soulGain: {
    id: 'soulGain',
    durationMs: 900,
    emitters: [emitter({ sprite: 'mote', colors: [N.soul, N.soulCore], count: 8, spawnMs: 300, lifeMs: [600, 760], from: 'target', motion: 'burst', speed: [40, 60], angle: [75, 105], drag: 1.5, offsetX: [-10, 10], glow: true, blinkMs: 180, fadeInMs: 80, fadeOutMs: 220 })],
    tracks: {},
    reduced: { mode: 'static', atMs: 400, holdMs: 400 },
  },
  victory: {
    id: 'victory',
    durationMs: 1800,
    emitters: [
      emitter({ sprite: 'star', colors: [N.gold, N.impact, N.impactWarm], count: 16, spawnMs: 300, lifeMs: [900, 1200], from: 'screen', screenPoint: { x: 128, y: 56 }, motion: 'burst', speed: [60, 110], angle: [20, 160], gravity: 70, drag: 0.8, glow: true, fadeOutMs: 300 }),
      emitter({ sprite: 'flake', colors: [N.gold, N.impact], count: 14, startMs: 200, spawnMs: 800, lifeMs: [1000, 1300], from: 'screen', screenPoint: { x: 128, y: 0 }, motion: 'burst', speed: [10, 25], angle: [250, 290], gravity: 20, offsetX: [-120, 120], fadeInMs: 100, fadeOutMs: 300 }),
    ],
    tracks: {
      title: { alpha: [{ t: 0, v: 0 }, { t: 300, v: 1 }], offsetY: [{ t: 0, v: 8 }, { t: 300, v: -2 }, { t: 420, v: 0 }] },
    },
    reduced: { mode: 'static', atMs: 700, holdMs: 1200 },
  },
  defeat: {
    id: 'defeat',
    durationMs: 1800,
    emitters: [emitter({ sprite: 'flake', colors: [N.ash, N.dull], count: 16, spawnMs: 900, lifeMs: [1200, 1500], from: 'screen', screenPoint: { x: 128, y: 0 }, motion: 'burst', speed: [8, 18], angle: [255, 285], gravity: 6, offsetX: [-128, 128], fadeInMs: 200, fadeOutMs: 300 })],
    tracks: {
      screen: { color: N.dim, alpha: [{ t: 0, v: 0 }, { t: 900, v: 0.55 }] },
      title: { alpha: [{ t: 0, v: 0 }, { t: 500, v: 0 }, { t: 1000, v: 1 }], offsetY: [{ t: 0, v: -6 }, { t: 1000, v: 0 }] },
    },
    reduced: { mode: 'instant', atMs: 0, holdMs: 0 },
  },
};

export const EFFECT_IDS: readonly EffectId[] = [
  'move.ember',
  'move.thorn',
  'move.tide',
  'move.gale',
  'move.umbra',
  'hit',
  'superEffective',
  'resisted',
  'miss',
  'heal',
  'faint',
  'evolve',
  'recruit',
  'levelUp',
  'soulGain',
  'victory',
  'defeat',
];

/** Effect descriptor by id (a fresh copy; safe to mutate). */
export function effectFor(id: EffectId): EffectDescriptor {
  const d = id.startsWith('move.') ? moveEffect(id.slice(5) as ElementId) : EVENTS[id as keyof typeof EVENTS];
  return JSON.parse(JSON.stringify(d)) as EffectDescriptor;
}

/** Move effect of an element. */
export function moveEffectFor(element: ElementId): EffectDescriptor {
  return effectFor(`move.${element}`);
}

/** One effect to play for a battle event: `target` is the side it lands on, `source` the side it comes from. */
export interface EventEffect {
  effect: EffectId;
  target: Side | 'screen';
  source?: Side;
}

const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

/**
 * Maps a sim battle event to the effects to play (possibly none). Pure: reads the move's element
 * from `content`. Damage uses the event's effectiveness (>= 200 super effective, <= 50 resisted).
 */
export function effectsForBattleEvent(event: BattleEvent, content: Pick<Content, 'moves'>): EventEffect[] {
  switch (event.type) {
    case 'move': {
      if (!event.hit) return [{ effect: 'miss', target: other(event.side), source: event.side }];
      const move = content.moves.find((m) => m.id === event.moveId);
      if (!move) return [];
      // Self-targeted moves (heals, buffs) play on the user; the rest travel to the opponent.
      const target = move.target === 'self' ? event.side : other(event.side);
      return [{ effect: `move.${move.element}`, target, source: event.side }];
    }
    case 'damage': {
      const effect: EffectId = event.effectiveness >= 200 ? 'superEffective' : event.effectiveness <= 50 ? 'resisted' : 'hit';
      return [{ effect, target: event.side }];
    }
    case 'heal':
      return [{ effect: 'heal', target: event.side }];
    case 'fainted':
      return [{ effect: 'faint', target: event.side }];
    case 'end':
      return [{ effect: event.winner === 'player' ? 'victory' : 'defeat', target: 'screen' }];
    default:
      return [];
  }
}
