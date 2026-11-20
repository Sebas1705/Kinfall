import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import type { PixelGrid } from '../../src/art/palette';
import {
  AMBIENT_PARTICLE_CAP,
  BUTTON_STATES,
  EFFECT_IDS,
  EFFECT_PARTICLE_CAP,
  ELEMENT_FX,
  FLOATING_NUMBER_KINDS,
  HORIZON_Y,
  NODE_ICON_KINDS,
  ICON_OUTLINE,
  SCENE_HEIGHT,
  SCENE_PIXEL_BUDGET,
  SCENE_WIDTH,
  SCREEN_PARTICLE_CAP,
  UI_PALETTES,
  VIGNETTE_HEIGHT,
  VIGNETTE_KINDS,
  VIGNETTE_WIDTH,
  ZONE_IDS,
  ZONE_PALETTES,
  ambientFor,
  barFill,
  barStyle,
  buttonFrame,

  cosmeticRng,
  effectFor,
  effectsForBattleEvent,
  eventVignette,
  floatingNumberStyle,
  iconForNodeType,
  keyAt,
  nodeIcon,
  nodeIconMain,
  particleSprites,
  plateFrame,
  prepareAmbient,
  prepareEffect,
  sampleAmbient,
  sampleEffect,
  sceneForZone,
  stageAnchors,
  uiContrastPairs,
  wordmark,
  zoneIdOf,
  type EffectContext,
  type NineSlice,
} from '../../src/art/scene';
import { createRng } from '../../src/sim/rng';
import { artSnapshot, type ArtGolden } from '../support/artSnapshot';
import { contrastRatio } from '../support/contrast';

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

function checkGrid(g: PixelGrid, label: string): void {
  expect(g.pixels.length, label).toBe(g.width * g.height);
  expect(g.palette[0], `${label} slot 0`).toMatch(/^#[0-9a-f]{6}00$/);
  for (const c of g.palette) expect(c, label).toMatch(HEX);
  let max = 0;
  for (const p of g.pixels) if (p > max) max = p;
  expect(max, `${label} palette index`).toBeLessThan(g.palette.length);
}

function allGrids(seed: string): [string, PixelGrid][] {
  const out: [string, PixelGrid][] = [];
  for (const zone of ZONE_IDS) {
    const sc = sceneForZone(zone, seed);
    for (const l of sc.backdrop.layers) out.push([`backdrop ${zone} ${l.id}`, l.grid]);
    for (const side of ['player', 'enemy'] as const) {
      out.push([`platform ${zone} ${side}`, sc.platforms[side].grid], [`shadow ${zone} ${side}`, sc.platforms[side].shadow]);
    }
    for (const kind of VIGNETTE_KINDS) out.push([`vignette ${kind} ${zone}`, eventVignette(kind, zone, seed)]);
  }
  for (const kind of NODE_ICON_KINDS) out.push([`icon ${kind}`, nodeIcon(kind)]);
  for (const [id, g] of Object.entries(particleSprites())) out.push([`sprite ${id}`, g]);
  out.push(['logo', wordmark().grid]);
  for (const theme of ['dusk', 'parchment'] as const) {
    out.push([`plate ${theme}`, plateFrame({ theme }).grid]);
    for (const s of BUTTON_STATES) out.push([`button ${s} ${theme}`, buttonFrame(s, { theme }).grid]);
    out.push([`bar ${theme}`, barStyle('hp', { theme }).frame.grid]);
  }
  return out;
}

const ctxFor = (tMs: number, reducedMotion = false): EffectContext => {
  const t = stageAnchors('enemy');
  const s = stageAnchors('player');
  return { tMs, target: t.centre, ground: t.feet, source: s.centre, facing: s.facing, reducedMotion };
};

describe('cosmetic rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = cosmeticRng('x');
    const b = cosmeticRng('x');
    const c = cosmeticRng('y');
    const sa = Array.from({ length: 8 }, () => a.next());
    expect(Array.from({ length: 8 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 8 }, () => c.next())).not.toEqual(sa);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  it('is unrelated to the simulation generator for the same seed', () => {
    const sim = createRng('same-seed');
    const art = cosmeticRng('same-seed');
    const simInts = Array.from({ length: 6 }, () => sim.nextInt(1000));
    const artInts = Array.from({ length: 6 }, () => art.int(1000));
    expect(artInts).not.toEqual(simInts);
  });

  it('scene sources never import the simulation rng', () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'art', 'scene');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from '[^']*sim\/rng'/);
    }
  });

  it('generating art does not change a simulation stream', () => {
    const before = createRng('battle-seed');
    const expected = Array.from({ length: 5 }, () => before.next32());
    const after = createRng('battle-seed');
    sceneForZone(1, 'battle-seed');
    prepareEffect(effectFor('move.ember'), 'battle-seed');
    expect(Array.from({ length: 5 }, () => after.next32())).toEqual(expected);
  });
});

describe('zone scenes', () => {
  it('are deterministic per seed', () => {
    for (const zone of ZONE_IDS) {
      const a = sceneForZone(zone, 'det');
      const b = sceneForZone(zone, 'det');
      expect(a.backdrop.layers.map((l) => Array.from(l.grid.pixels))).toEqual(b.backdrop.layers.map((l) => Array.from(l.grid.pixels)));
      expect(Array.from(a.platforms.player.grid.pixels)).toEqual(Array.from(b.platforms.player.grid.pixels));
    }
  });

  it('change with the seed (the scenery varies between runs)', () => {
    for (const zone of ZONE_IDS) {
      const a = sceneForZone(zone, 'seed-a').backdrop.layers.find((l) => l.id === 'mid')!;
      const b = sceneForZone(zone, 'seed-b').backdrop.layers.find((l) => l.id === 'mid')!;
      expect(Array.from(a.grid.pixels)).not.toEqual(Array.from(b.grid.pixels));
    }
  });

  it('only use valid palette indices and colours', () => {
    for (const [label, g] of allGrids('palette-check')) checkGrid(g, label);
  });

  it('keep every backdrop under the pixel budget, layers tileable and inside the scene', () => {
    for (const seed of ['a', 'b', 'c']) {
      for (const zone of ZONE_IDS) {
        const bd = sceneForZone(zone, seed).backdrop;
        const total = bd.layers.reduce((s, l) => s + l.grid.width * l.grid.height, 0);
        expect(total, `zone ${zone}`).toBeLessThanOrEqual(SCENE_PIXEL_BUDGET);
        expect(bd.layers[0]!.id).toBe('sky');
        expect(bd.layers[0]!.grid.height).toBeGreaterThanOrEqual(HORIZON_Y);
        for (const l of bd.layers) {
          if (l.tileX && l.id !== 'sky') expect(l.grid.width, l.id).toBe(SCENE_WIDTH);
          expect(l.y + l.grid.height, l.id).toBeLessThanOrEqual(SCENE_HEIGHT);
          expect(l.parallax).toBeGreaterThanOrEqual(0);
          expect(l.parallax).toBeLessThanOrEqual(1);
        }
        // Back layers come first and parallax never decreases among them (far moves less than near).
        const back = bd.layers.filter((l) => l.depth === 'back' && l.id !== 'light');
        for (let i = 1; i < back.length; i++) expect(back[i]!.parallax).toBeGreaterThanOrEqual(back[i - 1]!.parallax);
        expect(bd.layers.findIndex((l) => l.depth === 'front')).toBe(bd.layers.length - 1);
      }
    }
  });

  it('places both platforms on the floor, inside the scene', () => {
    for (const zone of ZONE_IDS) {
      const sc = sceneForZone(zone, 'stage');
      for (const side of ['player', 'enemy'] as const) {
        const a = stageAnchors(side);
        const p = sc.platforms[side];
        expect(a.feet.y).toBeGreaterThan(HORIZON_Y);
        expect(a.feet.x - p.anchor.x).toBeGreaterThanOrEqual(0);
        expect(a.feet.x - p.anchor.x + p.grid.width).toBeLessThanOrEqual(SCENE_WIDTH);
        expect(a.feet.y - p.anchor.y + p.grid.height).toBeLessThanOrEqual(SCENE_HEIGHT);
        // The creature (24 cells at spriteScale) fits above its feet.
        expect(a.feet.y - 24 * sc.stage.spriteScale).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('maps run zone indices onto the three art zones', () => {
    expect([-1, 0, 1, 2, 3, 99, Number.NaN].map(zoneIdOf)).toEqual([0, 0, 1, 2, 2, 2, 0]);
  });
});

describe('effects', () => {
  it('exist for every element and event kind, with a reduced-motion rule', () => {
    expect(EFFECT_IDS.length).toBe(17);
    for (const id of EFFECT_IDS) {
      const d = effectFor(id);
      expect(d.id).toBe(id);
      expect(d.durationMs).toBeGreaterThan(0);
      expect(d.durationMs).toBeLessThanOrEqual(2000);
      expect(['static', 'instant', 'none']).toContain(d.reduced.mode);
    }
  });

  it('respect the particle caps', () => {
    let biggest = 0;
    for (const id of EFFECT_IDS) {
      const n = effectFor(id).emitters.reduce((s, e) => s + e.count, 0);
      expect(n, id).toBeLessThanOrEqual(EFFECT_PARTICLE_CAP);
      biggest = Math.max(biggest, n);
    }
    for (const zone of ZONE_IDS) {
      const n = ambientFor(zone).layers.reduce((s, l) => s + l.count, 0);
      expect(n, `ambient ${zone}`).toBeLessThanOrEqual(AMBIENT_PARTICLE_CAP);
      // Ambient plus two of the largest effects at once stay under the screen cap.
      expect(n + biggest * 2).toBeLessThanOrEqual(SCREEN_PARTICLE_CAP);
    }
  });

  it('sample to whole pixels and bounded draw lists, deterministically', () => {
    for (const id of EFFECT_IDS) {
      const prepared = prepareEffect(effectFor(id), 's');
      const again = prepareEffect(effectFor(id), 's');
      const cap = effectFor(id).emitters.reduce((s, e) => s + e.count * (e.glow ? 2 : 1), 0);
      for (let t = 0; t <= 2000; t += 50) {
        const f = sampleEffect(prepared, ctxFor(t));
        expect(f).toEqual(sampleEffect(again, ctxFor(t)));
        expect(f.particles.length).toBeLessThanOrEqual(cap);
        for (const p of f.particles) {
          expect(Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.size), id).toBe(true);
          expect(p.alpha).toBeGreaterThanOrEqual(0);
          expect(p.alpha).toBeLessThanOrEqual(1);
        }
        expect(Number.isInteger(f.shake.x) && Number.isInteger(f.offset.y)).toBe(true);
      }
      expect(sampleEffect(prepared, ctxFor(2100)).done).toBe(true);
    }
  });

  it('flash at most twice per second and keep keyframes in time order', () => {
    for (const id of EFFECT_IDS) {
      const d = effectFor(id);
      const tracks = [d.tracks.flash, d.tracks.offsetX, d.tracks.offsetY, d.tracks.alpha, d.tracks.shake, d.tracks.tint?.alpha, d.tracks.screen?.alpha];
      for (const keys of tracks) {
        if (!keys) continue;
        for (let i = 1; i < keys.length; i++) expect(keys[i]!.t).toBeGreaterThanOrEqual(keys[i - 1]!.t);
      }
      let pulses = 0;
      let on = false;
      for (let t = 0; t <= 1000; t += 5) {
        const v = keyAt(d.tracks.flash, t) > 0.5;
        if (v && !on) pulses++;
        on = v;
      }
      expect(pulses, id).toBeLessThanOrEqual(2);
    }
  });

  it('reduced motion: no shake, no flash, no travel, and it ends', () => {
    for (const id of EFFECT_IDS) {
      const d = effectFor(id);
      const prepared = prepareEffect(d, 'rm');
      for (let t = 0; t <= 2000; t += 100) {
        const f = sampleEffect(prepared, ctxFor(t, true));
        expect(f.shake).toEqual({ x: 0, y: 0 });
        expect(f.flash).toBe(0);
        if (d.reduced.mode !== 'static') expect(f.particles).toEqual([]);
      }
      // A frozen frame is the same frame at any time before the hold ends.
      if (d.reduced.mode === 'static') {
        const a = sampleEffect(prepared, ctxFor(0, true));
        const b = sampleEffect(prepared, ctxFor(d.reduced.holdMs - 1, true));
        expect(a.particles).toEqual(b.particles);
        expect(sampleEffect(prepared, ctxFor(d.reduced.holdMs, true)).done).toBe(true);
      }
    }
    // Faint jumps straight to its end state.
    const faint = sampleEffect(prepareEffect(effectFor('faint'), 'rm'), ctxFor(0, true));
    expect(faint.alpha).toBe(0);
  });

  it('map battle events onto effects', () => {
    const attack = CONTENT.moves.find((m) => m.target === 'enemy')!;
    expect(effectsForBattleEvent({ type: 'move', side: 'player', moveId: attack.id, hit: true }, CONTENT)).toEqual([
      { effect: `move.${attack.element}`, target: 'enemy', source: 'player' },
    ]);
    const self = CONTENT.moves.find((m) => m.target === 'self');
    if (self) {
      expect(effectsForBattleEvent({ type: 'move', side: 'enemy', moveId: self.id, hit: true }, CONTENT)[0]?.target).toBe('enemy');
    }
    expect(effectsForBattleEvent({ type: 'move', side: 'enemy', moveId: attack.id, hit: false }, CONTENT)[0]?.effect).toBe('miss');
    const dmg = (effectiveness: number) => effectsForBattleEvent({ type: 'damage', side: 'enemy', amount: 3, effectiveness }, CONTENT)[0]?.effect;
    expect([dmg(400), dmg(200), dmg(100), dmg(50), dmg(25)]).toEqual(['superEffective', 'superEffective', 'hit', 'resisted', 'resisted']);
    expect(effectsForBattleEvent({ type: 'heal', side: 'player', amount: 2 }, CONTENT)[0]?.effect).toBe('heal');
    expect(effectsForBattleEvent({ type: 'fainted', side: 'enemy' }, CONTENT)[0]?.effect).toBe('faint');
    expect(effectsForBattleEvent({ type: 'end', winner: 'player' }, CONTENT)[0]?.effect).toBe('victory');
    expect(effectsForBattleEvent({ type: 'end', winner: 'enemy' }, CONTENT)[0]?.effect).toBe('defeat');
    expect(effectsForBattleEvent({ type: 'turnStart', turn: 1 }, CONTENT)).toEqual([]);
  });

  it('every element has a distinct move effect and colours', () => {
    const els = Object.keys(ELEMENT_FX);
    expect(els.length).toBe(5);
    const ids = new Set(els.map((e) => effectFor(`move.${e}` as never).id));
    expect(ids.size).toBe(5);
  });
});

describe('ambient life', () => {
  it('is deterministic, inside the scene and frozen with reduced motion', () => {
    for (const zone of ZONE_IDS) {
      const a = prepareAmbient(ambientFor(zone), 'amb');
      const b = prepareAmbient(ambientFor(zone), 'amb');
      for (const t of [0, 500, 9000, 123456]) {
        const pa = sampleAmbient(a, t, false);
        expect(pa).toEqual(sampleAmbient(b, t, false));
        for (const p of pa) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThan(SCENE_WIDTH);
        }
      }
      const r0 = sampleAmbient(a, 0, true);
      expect(sampleAmbient(a, 99999, true)).toEqual(r0);
      expect(r0.length).toBeGreaterThan(0);
    }
  });
});

describe('contrast (WCAG AA for anything that carries text or focus)', () => {
  it('frame colour pairs reach their minimum in both themes', () => {
    for (const theme of ['dusk', 'parchment'] as const) {
      for (const pair of uiContrastPairs(theme)) {
        expect(contrastRatio(pair.fg, pair.bg), `${theme}: ${pair.name}`).toBeGreaterThanOrEqual(pair.min);
      }
    }
  });

  const centre = (ns: NineSlice): string => {
    const g = ns.grid;
    const x = ns.slice.left;
    const y = ns.slice.top;
    return g.palette[g.pixels[y * g.width + x]!]!;
  };

  it('text colour of each frame reaches 4.5:1 on the frame centre', () => {
    for (const theme of ['dusk', 'parchment'] as const) {
      for (const zone of ZONE_IDS) {
        const plate = plateFrame({ theme, zone });
        expect(contrastRatio(plate.textColor, centre(plate)), `${theme} plate`).toBeGreaterThanOrEqual(4.5);
        for (const state of BUTTON_STATES) {
          const b = buttonFrame(state, { theme, zone });
          expect(contrastRatio(b.textColor, centre(b)), `${theme} ${state}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('nine-slices are well formed', () => {
    for (const theme of ['dusk', 'parchment'] as const) {
      const all = [plateFrame({ theme }), ...BUTTON_STATES.map((s) => buttonFrame(s, { theme })), barStyle('hp', { theme }).frame];
      for (const ns of all) {
        expect(ns.slice.left + ns.slice.right).toBeLessThan(ns.grid.width);
        expect(ns.slice.top + ns.slice.bottom).toBeLessThan(ns.grid.height);
        expect(ns.content.left + ns.content.right).toBeLessThan(ns.grid.width);
      }
    }
  });

  it('bar fills follow the HP thresholds', () => {
    const s = barStyle('hp', { theme: 'dusk' });
    expect([barFill(s, 100), barFill(s, 51), barFill(s, 50), barFill(s, 26), barFill(s, 25), barFill(s, 0)]).toEqual([
      s.fill.high,
      s.fill.high,
      s.fill.mid,
      s.fill.mid,
      s.fill.low,
      s.fill.low,
    ]);
  });

  it('floating numbers keep 4.5:1 against their outline', () => {
    for (const kind of FLOATING_NUMBER_KINDS) {
      const st = floatingNumberStyle(kind);
      expect(contrastRatio(st.fill, st.outline), kind).toBeGreaterThanOrEqual(4.5);
      expect(st.reducedHoldMs).toBeGreaterThan(0);
    }
  });

  it('node icons stand out (3:1) on both page backgrounds', () => {
    for (const kind of NODE_ICON_KINDS) {
      expect(contrastRatio(nodeIconMain(kind), UI_PALETTES.dusk.page), kind).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(ICON_OUTLINE, UI_PALETTES.parchment.page), kind).toBeGreaterThanOrEqual(3);
    }
  });

  it('zone palettes keep sky bands ordered from dark to light towards the horizon', () => {
    for (const zone of ZONE_IDS) {
      const sky = ZONE_PALETTES[zone].sky;
      for (let i = 1; i < sky.length; i++) expect(contrastRatio(sky[i]!, '#000000')).toBeGreaterThan(contrastRatio(sky[i - 1]!, '#000000'));
    }
  });
});

describe('icons, vignettes and logo', () => {
  it('node icons are 16x16 with distinct silhouettes and cover every node type', () => {
    const shapes = NODE_ICON_KINDS.map((k) => {
      const g = nodeIcon(k);
      expect([g.width, g.height]).toEqual([16, 16]);
      return Array.from(g.pixels).map((p) => (p === 0 ? 0 : 1)).join('');
    });
    expect(new Set(shapes).size).toBe(NODE_ICON_KINDS.length);
    for (const type of ['wild', 'elite', 'shrine', 'cache', 'mystery', 'boss'] as const) {
      expect(NODE_ICON_KINDS).toContain(iconForNodeType(type));
    }
  });

  it('vignettes have a fixed size and differ by kind and zone', () => {
    const keys = new Set<string>();
    for (const zone of ZONE_IDS) {
      for (const kind of VIGNETTE_KINDS) {
        const g = eventVignette(kind, zone, 'v');
        expect([g.width, g.height]).toEqual([VIGNETTE_WIDTH, VIGNETTE_HEIGHT]);
        keys.add(`${g.palette.join()}|${Array.from(g.pixels).join('')}`);
      }
    }
    expect(keys.size).toBe(ZONE_IDS.length * VIGNETTE_KINDS.length);
  });

  it('the wordmark carries an accessible label and integer scales', () => {
    const w = wordmark();
    expect(w.label).toBe('Kinfall');
    expect(w.labelKey).toBe('app.title');
    for (const s of w.scales) expect(Number.isInteger(s)).toBe(true);
    expect(w.grid.width).toBeLessThanOrEqual(80);
  });
});

describe('art golden (npm run golden:art)', () => {
  it('matches packages/core/tests/golden/art.golden.json', () => {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'art.golden.json');
    const stored = JSON.parse(readFileSync(file, 'utf8')) as ArtGolden;
    const now = artSnapshot();
    expect(Object.keys(now.hashes).sort()).toEqual(Object.keys(stored.hashes).sort());
    expect(now.hashes).toEqual(stored.hashes);
  });
});
