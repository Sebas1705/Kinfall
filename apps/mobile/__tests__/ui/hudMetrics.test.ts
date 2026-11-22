// The HUD is a fixed-height row (the contract's HUD height): the heading, the party chips and the
// buttons must fit it. Jest cannot measure text, so this proves by arithmetic (hudMetrics, the same
// plan the Hud renders) that for the maximum party and the longest headings in Spanish and English
// the planned row fits at 360x640, 411x914, 640x360 and 914x411, at text 100% and 130%.
import { describe, expect, it } from '@jest/globals';
import { CONTENT } from '@kinfall/core/content';
import { effectiveTextScale, layoutSpec } from '@kinfall/core/layout/spec';
import { setLang, speciesName, t } from '@kinfall/core/platform/i18n';

import { compactChip } from '../../src/ui/Hud';
import { BUTTON_MIN, hudPlan, titleHeight } from '../../src/ui/hudMetrics';

const windows: Array<[string, number, number, number]> = [
  ['640x360', 640, 360, 1],
  ['640x360 at 130%', 640, 360, 1.3],
  ['914x411', 914, 411, 1],
  ['914x411 at 130%', 914, 411, 1.3],
  ['360x640', 360, 640, 1],
  ['360x640 at 130%', 360, 640, 1.3],
  ['411x914', 411, 914, 1],
  ['411x914 at 130%', 411, 914, 1.3],
];

/** The headings each screen puts in the HUD. */
function headings(screen: 'map' | 'event' | 'end' | 'title'): string[] {
  if (screen === 'title') return [t('screen.title')];
  if (screen === 'map') return ([0, 1, 2] as const).map((z) => t('map.zone', { n: z + 1, name: t(`zone.${z}`) }));
  if (screen === 'end') return [t('end.won'), t('end.lost')];
  return (['event.recruit.title', 'event.shrine.title', 'event.cache.title', 'event.mystery.title'] as const).map((k) => t(k));
}

describe.each(['en', 'es'] as const)('HUD plan in %s', (lang) => {
  it.each(windows)('%s: heading, maximum party and buttons fit the row', (_l, w, h, fs) => {
    setLang(lang);
    const scale = effectiveTextScale(fs, 1);
    const longest = CONTENT.species.map(speciesName).sort((a, b) => b.length - a.length)[0]!;
    const party = [0, 1, 2].map(() => ({ name: longest, hp: 200, maxHp: 200 }));
    for (const screen of ['map', 'event', 'end', 'title'] as const) {
      const spec = layoutSpec({ width: w, height: h, textScale: scale }, screen);
      expect(spec.mode).toBe('console');
      for (const title of headings(screen)) {
        // The extra button of each screen: Options on the title, Run on the run screens.
        for (const buttons of [[screen === 'title' ? t('title.optionsOpen') : t('run.open'), t('hud.settings')]]) {
          const plan = hudPlan({
            width: spec.regions.content.width,
            scale,
            title,
            chips: party.map((p) => `${p.name} ${p.hp}/${p.maxHp}`),
            compact: compactChip(party),
            buttons,
          });
          expect([screen, title, buttons.join('+'), plan.need <= plan.have]).toEqual([screen, title, buttons.join('+'), true]);
          // The heading's lines and the 48 dp buttons fit the bar.
          expect(titleHeight(plan.titleLines, scale)).toBeLessThanOrEqual(spec.regions.hud.height);
          expect(BUTTON_MIN).toBeLessThanOrEqual(spec.regions.hud.height);
        }
      }
    }
  });

  it('keeps the full chips on the wide windows and a heading on one line', () => {
    setLang(lang);
    const party = [0, 1, 2].map(() => ({ name: 'Brambleback', hp: 12, maxHp: 12 }));
    const spec = layoutSpec({ width: 914, height: 411, textScale: 1 }, 'map');
    const plan = hudPlan({ width: spec.regions.content.width, scale: 1, title: headings('map')[2]!, chips: party.map((p) => `${p.name} ${p.hp}/${p.maxHp}`), compact: compactChip(party), buttons: ['Run', 'Settings'] });
    expect(plan).toMatchObject({ chips: 'full', titleLines: 1 });
  });
});

describe('compact chip', () => {
  it('shows the party size and a cue when a member is at a quarter of its HP or less', () => {
    expect(compactChip([{ name: 'A', hp: 10, maxHp: 10 }, { name: 'B', hp: 9, maxHp: 10 }])).toBe('\u2665 2');
    expect(compactChip([{ name: 'A', hp: 2, maxHp: 10 }])).toBe('\u2665 1 !');
  });
});
