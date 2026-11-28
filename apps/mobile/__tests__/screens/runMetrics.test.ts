// Jest cannot measure a layout, so the fit of the console title, map, event and end screens is
// proven by arithmetic on the same bounded heights their styles use (titleMetrics, mapMetrics,
// eventMetrics, endMetrics) and on a conservative estimate of the real strings' line counts
// (textFit): for every (window, text scale) the contract calls a console for the screen (generated from the
// contract, see test-utils/consoleRows.ts: phones, a tablet and desktops up to 200% text), every region's content
// is no taller than its region, with at least SLACK dp to spare (the contract ignores the safe-area
// insets, which the Screen takes from the primary region), every touch target is at least 48 dp, and
// the longest English and Spanish texts fit their line caps.
import { describe, expect, it } from '@jest/globals';
import { CONTENT } from '@kinfall/core/content';
import { MIN_BUDGET, effectiveTextScale, layoutSpec, type ScreenId } from '@kinfall/core/layout/spec';
import { setLang, speciesName, t } from '@kinfall/core/platform/i18n';
import { startRun } from '@kinfall/core/sim/run/run';

import { GAMES } from '@kinfall/core/games/registry';

import { FONT_SCALES, WINDOW_SIZES, consoleRows, fallbackRows, type ConsoleRow } from '../../test-utils/consoleRows';
import { lineHeight, messageHeight, MESSAGE_SIZE } from '../../src/screens/battleMetrics';
import * as hub from '../../src/screens/hubMetrics';
import * as end from '../../src/screens/endMetrics';
import * as event from '../../src/screens/eventMetrics';
import * as map from '../../src/screens/mapMetrics';
import { FILL, textLines, textWidth } from '../../src/screens/textFit';
import * as title from '../../src/screens/titleMetrics';

/** Room kept free in every region (dp): a gesture bar or cutout inset the contract does not know. */
const SLACK = 10;

function specOf(screen: ScreenId, w: number, h: number, fs: number) {
  const scale = effectiveTextScale(fs, 1);
  return { scale, spec: layoutSpec({ width: w, height: h, textScale: scale }, screen) };
}
/** `need <= have`, printing both numbers when it fails. */
const fits = (need: number, have: number) => expect([need, need <= have]).toEqual([need, true]);
const langs = ['en', 'es'] as const;

describe('map board', () => {
  it.each(consoleRows('map'))('%s: console; the worst board (7 layers of 3 nodes) fits the primary region with room to spare', (_l, w, h, fs) => {
    const { scale, spec } = specOf('map', w, h, fs);
    expect(spec.mode).toBe('console');
    const landscape = spec.orientation === 'landscape';
    fits(map.boardHeight(scale) + SLACK, map.boardAvailable(spec.regions.primary.height, scale, landscape));
    // Seven columns of at least 48 dp each fit the width: no horizontal overlap on these windows.
    expect(map.columnWidth(spec.regions.primary.width)).toBeGreaterThanOrEqual(map.NODE_MIN);
  });

  it.each(consoleRows('map'))('%s: the readout and the legend fit the actions region with room to spare', (_l, w, h, fs) => {
    const { scale, spec } = specOf('map', w, h, fs);
    fits(map.railHeight(scale) + SLACK, spec.regions.actions.height);
  });

  it('keeps every node at least 48 dp wide and tall, overlapping by at most 4 dp (2 a side) on a 320 dp window', () => {
    for (const s of [1, 1.3, 2]) expect(map.nodeCellHeight(s)).toBeGreaterThanOrEqual(48);
    for (const width of [320, 360, 411, 640, 914]) expect(map.nodeWidth(map.columnWidth(width))).toBeGreaterThanOrEqual(48);
    const col = map.columnWidth(320);
    expect(map.nodeWidth(col) - col).toBeLessThanOrEqual(4);
  });

  it('keeps the columns at 360 dp wide in the fallback too (200% text): 48 dp targets, no overlap', () => {
    const { spec } = specOf('map', 360, 640, 2);
    expect(spec.mode).toBe('fallback');
    const col = map.columnWidth(spec.regions.primary.width);
    expect(col).toBeGreaterThanOrEqual(48);
    expect(map.nodeWidth(col)).toBeLessThanOrEqual(col);
  });

  it('holds for every generated map: at most 7 layers, at most 3 nodes in a layer', () => {
    for (let i = 0; i < 60; i++) {
      const run = startRun(`BOARD${i}`, CONTENT.starters[0]!, CONTENT);
      for (const m of run.maps) {
        expect(m.layers.length).toBeLessThanOrEqual(map.MAP_LAYERS);
        for (const layer of m.layers) expect(layer.length).toBeLessThanOrEqual(map.MAP_MAX_NODES);
      }
    }
  });
});

describe.each(langs)('title in %s', (lang) => {
  it.each(consoleRows('title'))('%s: the hero keeps its minimum after the strip and its hint, and the hint fits its lines', (_l, w, h, fs) => {
    setLang(lang);
    const { scale, spec } = specOf('title', w, h, fs);
    expect(spec.mode).toBe('console');
    const hero = title.heroHeight(spec.regions.primary.height, scale);
    expect([hero, hero >= title.HERO_MIN]).toEqual([hero, true]);
    for (const k of ['ember', 'thorn', 'tide'] as const) {
      const lines = textLines(t(`title.starterHint.${k}`), spec.regions.primary.width - 2 * title.MAIN_PAD, title.HINT_SIZE, scale);
      expect([k, lines <= title.HINT_LINES]).toEqual([k, true]);
    }
  });

  it.each(consoleRows('title'))('%s: the worst rails (unavailable notice; damaged save with Discard) fit with room to spare', (_l, w, h, fs) => {
    setLang(lang);
    const { scale, spec } = specOf('title', w, h, fs);
    const landscape = spec.orientation === 'landscape';
    for (const kind of ['unavailable', 'corrupt'] as const) fits(title.railHeight(scale, kind, landscape) + SLACK, spec.regions.actions.height);
    // The "unavailable" notice (a fixed text) fits its line cap in the rail's width.
    const inner = (landscape ? spec.regions.actions.width : spec.regions.content.width) - 2 * title.RAIL_PAD - 12;
    const lines = textLines(t('title.savesUnavailableDevice'), inner, title.NOTICE_SIZE, scale);
    expect([lines, lines <= title.noticeLinesCap('unavailable', landscape)]).toEqual([lines, true]);
  });

  it('keeps starter cards and rail buttons at least 48 dp', () => {
    for (const s of [1, 1.3, 2]) {
      expect(title.cardHeight(s)).toBeGreaterThanOrEqual(48);
      expect(title.buttonHeight(s)).toBeGreaterThanOrEqual(48);
    }
  });
});

describe.each(langs)('event in %s', (lang) => {
  const longestOf = (names: string[]) => [...names].sort((a, b) => b.length - a.length)[0]!;
  const longest = () => longestOf(CONTENT.species.map(speciesName));
  /** Only a species that can evolve is named by an evolve choice. */
  const longestEvolvable = () => longestOf(CONTENT.species.filter((s) => s.evolvesTo).map(speciesName));
  const member = () => t('map.partyMember', { species: longest(), hp: 200, max: 200 });
  /** The choice sets of every event, with the longest species name and the disabled reason. */
  const sets = (): Record<string, event.ChoiceText[]> => ({
    shrine: [
      { label: t('event.shrine.rest'), detail: t('event.shrine.restDetail') },
      ...[0, 1, 2].map(() => ({ label: t('event.shrine.evolve', { species: longestEvolvable() }), detail: `${t('event.shrine.evolveCost', { cost: 3 })} · ${t('event.disabled.souls')}` })),
      { label: t('event.shrine.leave') },
    ],
    recruitFull: [
      ...[0, 1, 2].map(() => ({ label: t('event.recruit.replace', { species: longest() }), detail: member() })),
      { label: t('event.recruit.decline') },
    ],
    cache: [{ label: t('event.cache.open'), detail: t('event.cache.detail') }],
    mystery: [{ label: t('event.mystery.open') }, { label: t('event.mystery.leave') }],
  });

  it.each(consoleRows('event'))('%s: the longest choice sets fit the rail with room to spare, labels on few lines', (_l, w, h, fs) => {
    setLang(lang);
    const { scale, spec } = specOf('event', w, h, fs);
    expect(spec.mode).toBe('console');
    const landscape = spec.orientation === 'landscape';
    const width = event.cellWidth(landscape, landscape ? event.railWidth(spec.regions.content.width, spec.regions.actions.width) : spec.regions.content.width);
    for (const [name, choices] of Object.entries(sets())) {
      const need = event.railHeight(scale, choices, width, landscape) + SLACK;
      expect([name, need, need <= spec.regions.actions.height]).toEqual([name, need, true]);
      // A label takes one line in the landscape rail (two at 150% text and more, where the 360 dp rail cap bites: the rail height above already counts them) and at most three in a portrait cell.
      for (const c of choices) expect([name, c.label, event.labelLines(c, width, scale) <= (landscape ? (scale > 1.3 ? 2 : 1) : 3)]).toEqual([name, c.label, true]);
    }
    if (landscape) expect(event.railWidth(spec.regions.content.width, spec.regions.actions.width)).toBeGreaterThanOrEqual(spec.regions.actions.width);
  });

  it.each(consoleRows('event'))('%s: every event body (the heaviest: a full-party recruit with offer card and note) fits the primary region, no text cut', (_l, w, h, fs) => {
    setLang(lang);
    const { scale, spec } = specOf('event', w, h, fs);
    const landscape = spec.orientation === 'landscape';
    const rail = landscape ? event.railWidth(spec.regions.content.width, spec.regions.actions.width) : 0;
    const width = landscape ? spec.regions.content.width - rail : spec.regions.primary.width;
    const have = spec.regions.primary.height - (landscape ? messageHeight(scale, 1) : 0);
    const bodies: event.BodyText[] = [
      { desc: t('event.recruit.desc', { species: longest(), hp: 200 }), offer: true, note: t('event.recruit.full') },
      { desc: t('event.shrine.desc'), offer: false },
      { desc: t('event.cache.desc'), offer: false },
      { desc: t('event.mystery.desc'), offer: false },
    ];
    for (const body of bodies) {
      const plan = event.bodyPlan(width, have, scale, body);
      expect([body.desc, plan.height + SLACK, plan.height + SLACK <= have]).toEqual([body.desc, plan.height + SLACK, true]);
      // The shown lines are the estimate of the text itself: nothing is cut.
      expect(plan.descLines).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps choice cells at least 48 dp', () => {
    for (const s of [1, 1.3, 2]) for (const lines of [0, 1, 2, 3]) expect(event.choiceHeight(s, lines)).toBeGreaterThanOrEqual(48);
  });
});

describe.each(langs)('end in %s', (lang) => {
  it.each(consoleRows('end'))('%s: the scene keeps its minimum after the score and the note, the note fits its lines, and the rail fits', (_l, w, h, fs) => {
    setLang(lang);
    const { scale, spec } = specOf('end', w, h, fs);
    expect(spec.mode).toBe('console');
    const landscape = spec.orientation === 'landscape';
    const lines = end.noteLines(t('end.canRestart'), spec.regions.primary.width, scale);
    // The note takes the lines its text needs (three at most), and the scene gives way.
    const need = textLines(t('end.canRestart'), spec.regions.primary.width - 2 * end.MAIN_PAD, end.NOTE_SIZE, scale);
    expect([lines, lines === Math.min(need, end.NOTE_LINES_MAX)]).toEqual([lines, true]);
    expect([need, need <= end.NOTE_LINES_MAX]).toEqual([need, true]);
    const scene = end.sceneHeight(spec.regions.primary.height, scale, landscape, lines);
    expect([scene, scene >= end.SCENE_MIN]).toEqual([scene, true]);
    fits(end.railHeight(scale) + SLACK, spec.regions.actions.height);
    expect(lineHeight(end.NOTE_SIZE, scale) * lines).toBeLessThanOrEqual(end.noteHeight(scale, lines));
  });
});

describe.each(langs)('hub in %s', (lang) => {
  /** Does the hub fit this window? The primary region, the announcement line, the rail, the texts. */
  function problems(w: number, h: number, fs: number): string[] {
    setLang(lang);
    const { scale, spec } = specOf('hub', w, h, fs);
    const landscape = spec.orientation === 'landscape';
    const out: string[] = [];
    // The tagline lines of the playable cards, as the screen computes them (the longest of the playable games).
    const lines = Math.max(...GAMES.filter((g) => g.status === 'playable').map((g) => hub.taglineLines(t(g.taglineKey), spec.regions.primary.width, scale)));
    // The heading gives way when the window is tight; the cards never do.
    const heading = hub.showHeading(spec.regions.primary.height, scale, landscape, lines);
    const need = hub.primaryNeed(scale, landscape, lines, heading) + SLACK;
    if (need > spec.regions.primary.height) out.push(`primary ${need} > ${spec.regions.primary.height}`);
    const rail = hub.railHeight(scale) + SLACK;
    if (rail > spec.regions.actions.height) out.push(`rail ${rail} > ${spec.regions.actions.height}`);
    const inner = spec.regions.primary.width - 2 * hub.MAIN_PAD - hub.CARD_SIDE;
    for (const g of GAMES) {
      // The name (with its dot) takes one line, a tagline two; both shrink to fit (adjustsFontSizeToFit). A soon
      // card has the name and the badge on one row: each shrinks down to 70%, and both widths must fit the row.
      const name = textLines(`● ${t(g.nameKey)}`, inner, hub.NAME_SIZE * 0.7, scale);
      if (name > 1) out.push(`name ${g.id} ${name} lines`);
      if (g.status === 'soon') {
        const row = textWidth(`● ${t(g.nameKey)}`.length, hub.NAME_SIZE * 0.7, scale) + textWidth(t('hub.soon').length, hub.BADGE_SIZE * 0.7, scale) + hub.BADGE_PAD_X + hub.CARD_GAP;
        if (row > inner * FILL) out.push(`soon row ${g.id} ${row} > ${Math.round(inner * FILL)}`);
      } else {
        // Nothing is cut: the text needs no more lines than the card gives it.
        const tag = textLines(t(g.taglineKey), inner, hub.TAGLINE_SIZE * hub.TAGLINE_MIN_SCALE, scale);
        if (tag > lines) out.push(`tagline ${g.id} ${tag} lines`);
      }
      // The announcement: one line in landscape (in the primary region's width), two in portrait (the info band).
      const width = (landscape ? spec.regions.primary.width : spec.regions.content.width) - 8;
      const msg = textLines(t('hub.soonAnnounce', { game: t(g.nameKey) }), width, MESSAGE_SIZE, scale);
      if (msg > (landscape ? 1 : 2)) out.push(`announcement ${g.id} ${msg} lines`);
    }
    return out;
  }
  /**
   * Short portrait windows (split screen, a phone with a tall keyboard bar): the matrix has none, and the
   * portrait primary region is 41% of the height, so these are where the cards run out of room. Generated
   * at the budget itself (the shortest window the contract still calls a console) for the narrow widths
   * and the scales around it, plus a few fixed short windows.
   */
  const shortRows = (): ConsoleRow[] => {
    const rows: ConsoleRow[] = [];
    for (const w of [320, 360, 411]) {
      for (const fs of [1, 1.15, 1.3, 1.5]) {
        const h = Math.ceil(MIN_BUDGET.hub.portrait * effectiveTextScale(fs, 1));
        if (h > w) rows.push([`${w}x${h} at ${Math.round(fs * 100)}% (at the budget)`, w, h, fs]);
      }
    }
    for (const [w, h] of [[360, 380], [360, 420], [411, 440], [360, 480]] as const) rows.push([`${w}x${h} at 100% (short)`, w, h, 1]);
    return rows;
  };
  const shortConsoleRows = () => shortRows().filter(([, w, h, fs]) => specOf('hub', w, h, fs).spec.mode === 'console');
  const allRows = (): Array<[string, number, number, number]> => {
    const rows: Array<[string, number, number, number]> = [];
    for (const [w, h] of [...WINDOW_SIZES, [320, 640], [560, 300]] as const) for (const fs of FONT_SCALES) rows.push([`${w}x${h} at ${Math.round(fs * 100)}%`, w, h, fs]);
    return [...rows, ...shortRows()];
  };

  it('has short portrait console rows to prove (the proof is not vacuous)', () => {
    expect(shortConsoleRows().length).toBeGreaterThanOrEqual(8);
  });

  it.each([...consoleRows('hub'), ...shortConsoleRows()])('%s: console; the cards, their texts, the announcement and Play fit with room to spare', (_l, w, h, fs) => {
    expect(specOf('hub', w, h, fs).spec.mode).toBe('console');
    expect(problems(w, h, fs)).toEqual([]);
  });

  it('every row the hub cannot fit is a row the contract sends to the fallback (so the budget is not too low)', () => {
    for (const [label, w, h, fs] of allRows()) {
      const p = problems(w, h, fs);
      if (p.length > 0) expect([label, specOf('hub', w, h, fs).spec.mode, p]).toEqual([label, 'fallback', p]);
    }
  });

  it('the fallback rows: nothing is capped (the cards grow with the text), the rail is Play alone', () => {
    for (const [, w, h, fs] of fallbackRows('hub')) {
      const { scale } = specOf('hub', w, h, fs);
      // A card has no fixed height there: its minimum is the console height, so it never shrinks below 48.
      for (const g of GAMES) expect(hub.cardHeight(scale, g.status)).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('hub heading', () => {
  it('uses the same spare room as these proofs', () => {
    expect(hub.SPARE).toBe(SLACK);
  });

  it('is shown on roomy windows and dropped on the tight ones, never the cards', () => {
    const roomy = specOf('hub', 360, 640, 1);
    expect(hub.showHeading(roomy.spec.regions.primary.height, roomy.scale, false)).toBe(true);
    // 320 wide at 150% in Spanish: the tagline takes three lines and the heading goes.
    setLang('es');
    const tight = specOf('hub', 320, 640, 1.5);
    const lines = hub.taglineLines(t('hub.game.kinfall.tagline'), tight.spec.regions.primary.width, tight.scale);
    expect(lines).toBe(3);
    expect(hub.showHeading(tight.spec.regions.primary.height, tight.scale, false, lines)).toBe(false);
    setLang('en');
  });
});

describe('hub touch targets', () => {
  it('keeps the cards and Play at least 48 dp', () => {
    for (const s of [1, 1.3, 2]) {
      for (const g of GAMES) expect(hub.cardHeight(s, g.status)).toBeGreaterThanOrEqual(48);
      expect(hub.buttonHeight(s)).toBeGreaterThanOrEqual(48);
    }
  });
});
