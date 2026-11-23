// The HUD is a fixed-height row (the contract's HUD height): the heading, the party chips and the
// buttons must fit it. Jest cannot measure text, so this proves by arithmetic (hudMetrics, the same
// plan the Hud renders) that for the maximum party and the longest headings in Spanish and English
// the planned row fits every (window, text scale, screen) the contract calls a console (generated
// from it, see test-utils/consoleRows.ts: phones, a tablet and desktops, up to 200% text).
import { describe, expect, it } from '@jest/globals';
import { CONTENT } from '@kinfall/core/content';
import { effectiveTextScale, layoutSpec } from '@kinfall/core/layout/spec';
import { setLang, speciesName, t } from '@kinfall/core/platform/i18n';

import { compactChip } from '../../src/ui/Hud';
import { HUD_MAX_SHARE } from '../../src/ui/Screen';
import { consoleRows, fallbackRows } from '../../test-utils/consoleRows';
import { textWidth } from '../../src/screens/textFit';
import { BUTTON_MIN, TITLE_CUT_MIN_CHARS, hudPlan, titleHeight } from '../../src/ui/hudMetrics';


/** The headings each screen puts in the HUD. */
function headings(screen: 'map' | 'event' | 'end' | 'title'): string[] {
  if (screen === 'title') return [t('screen.title')];
  if (screen === 'map') return ([0, 1, 2] as const).map((z) => t('map.zone', { n: z + 1, name: t(`zone.${z}`) }));
  if (screen === 'end') return [t('end.won'), t('end.lost')];
  return (['event.recruit.title', 'event.shrine.title', 'event.cache.title', 'event.mystery.title'] as const).map((k) => t(k));
}

describe.each(['en', 'es'] as const)('HUD plan in %s', (lang) => {
  const SCREENS = ['map', 'event', 'end', 'title'] as const;
  it.each(SCREENS.flatMap((screen) => consoleRows(screen).map((r) => [screen, ...r] as const)))('%s, %s: heading, maximum party and buttons fit the row', (screen, _l, w, h, fs) => {
    setLang(lang);
    const scale = effectiveTextScale(fs, 1);
    const longest = CONTENT.species.map(speciesName).sort((a, b) => b.length - a.length)[0]!;
    const party = [0, 1, 2].map(() => ({ name: longest, hp: 200, maxHp: 200 }));
    const spec = layoutSpec({ width: w, height: h, textScale: scale }, screen);
    expect(spec.mode).toBe('console');
    for (const title of headings(screen)) {
      // The extra button of each screen: Options on the title, Run on the run screens.
      const buttons = [screen === 'title' ? t('title.optionsOpen') : t('run.open'), t('hud.settings')];
      const plan = hudPlan({
        width: spec.regions.content.width,
        height: spec.regions.hud.height,
        scale,
        title,
        chips: party.map((p) => `${p.name} ${p.hp}/${p.maxHp}`),
        compact: compactChip(party),
        buttons,
      });
      // Either the whole heading fits, or it is cut with an ellipsis and still keeps its first characters.
      const room = textWidth(TITLE_CUT_MIN_CHARS, plan.titleSize, scale);
      const ok = plan.titleCut ? plan.titleRoom >= room : plan.need <= plan.have;
      expect([screen, title, buttons.join('+'), plan.titleCut, plan.need, plan.have, plan.titleRoom, ok]).toEqual([screen, title, buttons.join('+'), plan.titleCut, plan.need, plan.have, plan.titleRoom, true]);
      // The heading's lines and the 48 dp buttons fit the bar.
      const th = titleHeight(plan.titleLines, scale, plan.titleSize);
      expect([title, th, th <= spec.regions.hud.height]).toEqual([title, th, true]);
      expect(BUTTON_MIN).toBeLessThanOrEqual(spec.regions.hud.height);
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

// In the fallback the Screen caps the HUD strip at HUD_MAX_SHARE of the window and scrolls inside it
// (a strip that does not look scrollable). The bar's row is top-aligned, so the buttons (48 dp) always
// sit in the first 48 dp of the strip, whatever the heading and the chips take below them.
describe('HUD strip in the fallback', () => {
  const SCREENS = ['title', 'map', 'battle', 'event', 'end'] as const;
  it.each(SCREENS.flatMap((screen) => fallbackRows(screen).map((r) => [screen, ...r] as const)))('%s, %s: Settings and the extra button sit inside the capped strip', (_s, _l, _w, h) => {
    const cap = Math.round(h * HUD_MAX_SHARE);
    expect([h, BUTTON_MIN, BUTTON_MIN <= cap]).toEqual([h, BUTTON_MIN, true]);
  });

  it('has fallback rows to prove (a screen is a fallback somewhere in the matrix)', () => {
    expect(SCREENS.flatMap((screen) => fallbackRows(screen)).length).toBeGreaterThan(20);
  });
});

describe('compact chip', () => {
  it('shows the party size and a cue when a member is at a quarter of its HP or less', () => {
    expect(compactChip([{ name: 'A', hp: 10, maxHp: 10 }, { name: 'B', hp: 9, maxHp: 10 }])).toBe('\u2665 2');
    expect(compactChip([{ name: 'A', hp: 2, maxHp: 10 }])).toBe('\u2665 1 !');
  });
});
