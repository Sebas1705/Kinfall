import { describe, expect, it } from '@jest/globals';

import { CONTRAST_PAIRS, contrastRatio, DARK, LIGHT, relativeLuminance } from '../src/theme';

describe('contrast helpers', () => {
  it('match the WCAG reference values', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('palette contrast (WCAG AA)', () => {
  for (const [name, theme] of [['light', LIGHT], ['dark', DARK]] as const) {
    it.each(CONTRAST_PAIRS.map((p) => [p.fg, p.bg, p.min, p.use] as const))(`${name}: %s on %s >= %s:1 (%s)`, (fg, bg, min) => {
      expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(min);
    });
  }

  it('covers every text colour on the surfaces it is drawn on', () => {
    const text = CONTRAST_PAIRS.filter((p) => p.min >= 4.5).map((p) => p.fg);
    for (const fg of ['text', 'muted', 'accentText', 'disabledText', 'danger', 'good', 'accent'] as const) expect(text).toContain(fg);
  });
});
