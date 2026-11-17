import { describe, expect, it } from '@jest/globals';

import { heightClass, layoutFor, SINGLE_MAX_WIDTH, TWO_PANE_MAX_WIDTH, widthClass } from '../../src/ui/windowSize';

describe('window size classes', () => {
  it('splits widths at 600 and 840 dp', () => {
    expect(widthClass(320)).toBe('compact');
    expect(widthClass(599.9)).toBe('compact');
    expect(widthClass(600)).toBe('medium');
    expect(widthClass(839)).toBe('medium');
    expect(widthClass(840)).toBe('expanded');
    expect(widthClass(1280)).toBe('expanded');
  });

  it('splits heights at 480 and 900 dp', () => {
    expect(heightClass(360)).toBe('compact');
    expect(heightClass(480)).toBe('medium');
    expect(heightClass(899)).toBe('medium');
    expect(heightClass(900)).toBe('expanded');
  });
});

describe('layoutFor', () => {
  // The devices of the test matrix (dp), at 100% and 200% text.
  const cases: Array<[string, number, number, number, { twoPane: boolean; compactBattle: boolean }]> = [
    ['small phone 360x640', 360, 640, 1, { twoPane: false, compactBattle: false }],
    ['small phone 360x640 at 200%', 360, 640, 2, { twoPane: false, compactBattle: true }],
    ['phone 411x891', 411, 891, 1, { twoPane: false, compactBattle: false }],
    ['phone 411x891 at 130%', 411, 891, 1.3, { twoPane: false, compactBattle: false }],
    ['phone 411x891 at 200%', 411, 891, 2, { twoPane: false, compactBattle: true }],
    ['landscape phone 891x411', 891, 411, 1, { twoPane: true, compactBattle: false }],
    ['landscape phone 891x411 at 200%', 891, 411, 2, { twoPane: true, compactBattle: false }],
    ['small landscape phone 640x360', 640, 360, 1, { twoPane: true, compactBattle: false }],
    ['narrow landscape window 560x320', 560, 320, 1, { twoPane: false, compactBattle: true }],
    ['foldable inner screen portrait ~600dp', 600, 800, 1, { twoPane: false, compactBattle: false }],
    ['foldable inner screen portrait ~600dp at 200%', 600, 800, 2, { twoPane: false, compactBattle: true }],
    ['foldable inner screen landscape', 800, 600, 1, { twoPane: true, compactBattle: false }],
    ['tablet portrait 800x1280', 800, 1280, 1, { twoPane: false, compactBattle: false }],
    ['tablet 840 wide portrait', 840, 1200, 1, { twoPane: true, compactBattle: false }],
    ['tablet landscape 1280x800', 1280, 800, 2, { twoPane: true, compactBattle: false }],
  ];

  it.each(cases)('%s', (_name, width, height, fontScale, expected) => {
    const layout = layoutFor({ width, height, fontScale });
    expect({ twoPane: layout.twoPane, compactBattle: layout.compactBattle }).toEqual(expected);
    expect(layout.maxContentWidth).toBe(expected.twoPane ? TWO_PANE_MAX_WIDTH : SINGLE_MAX_WIDTH);
  });

  it('never uses the compact battle in two panes, and never shrinks text below 100% (font scale < 1)', () => {
    expect(layoutFor({ width: 1000, height: 300, fontScale: 3 }).compactBattle).toBe(false);
    expect(layoutFor({ width: 360, height: 640, fontScale: 0.85 })).toEqual(layoutFor({ width: 360, height: 640, fontScale: 1 }));
  });

  it('reports the size classes', () => {
    expect(layoutFor({ width: 891, height: 411, fontScale: 1 })).toMatchObject({ width: 'expanded', height: 'compact' });
    expect(layoutFor({ width: 411, height: 891, fontScale: 1 })).toMatchObject({ width: 'compact', height: 'medium' });
  });
});
