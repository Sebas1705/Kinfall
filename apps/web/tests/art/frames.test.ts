import { describe, expect, it } from 'vitest';
import { UI_PALETTES, buttonFrame, plateFrame } from '@kinfall/core/art/scene';
import { FRAME_SCALE, borderImage, frameVars } from '../../src/art/frames';

describe('borderImage', () => {
  it('slices at the frame cells and draws at FRAME_SCALE', () => {
    const plate = plateFrame({ theme: 'dusk' });
    expect(borderImage('u', plate)).toBe(`url("u") 6 6 6 6 fill / ${6 * FRAME_SCALE}px ${6 * FRAME_SCALE}px ${6 * FRAME_SCALE}px ${6 * FRAME_SCALE}px`);
  });

  it('puts the focus ring outside the box (outset = ring + gap)', () => {
    const focus = buttonFrame('focused', { theme: 'parchment' });
    const css = borderImage('u', focus, 3);
    expect(css.endsWith(` / ${3 * FRAME_SCALE}px`)).toBe(true);
    // The ring frame's slice minus the outset equals the plain button's border width.
    expect(focus.slice.top * FRAME_SCALE - 3 * FRAME_SCALE).toBe(buttonFrame('normal', { theme: 'parchment' }).slice.top * FRAME_SCALE);
  });
});

describe('frameVars', () => {
  it('builds every frame and the contrast-checked colours for each theme', () => {
    for (const theme of ['dusk', 'parchment'] as const) {
      const vars = frameVars(theme, 1, () => 'x');
      for (const name of ['--k-plate', '--k-btn', '--k-btn-pressed', '--k-btn-disabled', '--k-btn-focus', '--k-bar']) {
        expect(vars[name]).toMatch(/^url\("x"\) /);
      }
      expect(vars['--k-btn-text']).toBe(UI_PALETTES[theme].buttonText);
      expect(vars['--k-plate-text']).toBe(UI_PALETTES[theme].text);
      expect(vars['--k-btn-disabled-text']).toBe(UI_PALETTES[theme].disabledText);
      expect(vars['--k-ring']).toBe(UI_PALETTES[theme].focus);
    }
  });

  it('tints the plate gems with the zone (zones past the last reuse it)', () => {
    const seen = new Map<string, string>();
    const vars = (zone: number) => frameVars('dusk', zone, (ns) => {
      const key = Array.from(ns.grid.palette).join(',');
      seen.set(key, key);
      return key;
    })['--k-plate'];
    expect(vars(0)).not.toBe(vars(1));
    expect(vars(2)).toBe(vars(5));
  });
});
