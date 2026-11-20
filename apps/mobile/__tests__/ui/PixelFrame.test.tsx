// Pixel frames: the framed controls keep their roles, names, states and 48dp targets, the frame
// art is hidden from screen readers, focus adds the ring outside the box, and every text colour a
// frame hands out meets AA on that frame's body in both themes.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BUTTON_STATES, UI_PALETTES } from '@kinfall/core/art/scene';
import { Text } from 'react-native';
import * as RN from 'react-native';

import { DARK, LIGHT, contrastRatio } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { buttonOf, plateOf } from '../../src/ui/frames';
import { FramePressable, frameBody, Plate } from '../../src/ui/PixelFrame';
import { PixelBar } from '../../src/ui/PixelBar';

const HID = { includeHiddenElements: true };
const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean)) as Record<string, unknown>;

type El = { props: Record<string, unknown>; children?: Array<El | string> };
/** Every host element on screen (hidden ones too), depth first. */
function hostElements(): El[] {
  const out: El[] = [];
  const walk = (e: El | string) => {
    if (typeof e === 'string') return;
    out.push(e);
    for (const c of e.children ?? []) walk(c);
  };
  walk(screen.root as unknown as El);
  return out;
}

let scheme: 'light' | 'dark' = 'light';
beforeEach(() => {
  scheme = 'light';
  jest.spyOn(RN, 'useColorScheme').mockImplementation(() => scheme);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('frame colours', () => {
  it('every button state and the plate carry AA text on their body, in both themes', () => {
    for (const theme of ['dusk', 'parchment'] as const) {
      for (const zone of [0, 1, 2] as const) {
        for (const state of BUTTON_STATES) {
          const f = buttonOf(state, theme, zone);
          expect([theme, state, contrastRatio(f.textColor, frameBody(f)) >= 4.5]).toEqual([theme, state, true]);
        }
        const p = plateOf(theme, zone);
        expect(contrastRatio(p.textColor, frameBody(p))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the app theme mirrors the UI palettes (parchment light, dusk dark)', () => {
    expect(LIGHT.plate).toBe(UI_PALETTES.parchment.plate);
    expect(LIGHT.button).toBe(UI_PALETTES.parchment.button);
    expect(LIGHT.text).toBe(UI_PALETTES.parchment.text);
    expect(LIGHT.bg).toBe(UI_PALETTES.parchment.page);
    expect(DARK.plate).toBe(UI_PALETTES.dusk.plate);
    expect(DARK.button).toBe(UI_PALETTES.dusk.button);
    expect(DARK.text).toBe(UI_PALETTES.dusk.text);
    expect(DARK.bg).toBe(UI_PALETTES.dusk.page);
  });

  it('uses the dusk frames in dark mode', async () => {
    scheme = 'dark';
    await render(
      <Plate testID="p">
        <Text>x</Text>
      </Plate>,
    );
    expect(flat(screen.getByTestId('p').props.style).backgroundColor).toBe(UI_PALETTES.dusk.plate);
  });
});

describe('FramePressable', () => {
  it('is a named button with its state, at least 48dp, its frame hidden from screen readers', async () => {
    const onPress = jest.fn();
    await render(
      <FramePressable onPress={onPress} accessibilityLabel="Ember Lash" testID="b">
        <Text>Ember Lash</Text>
      </FramePressable>,
    );
    const b = screen.getByRole('button', { name: 'Ember Lash' });
    expect(b.props.accessibilityState).toMatchObject({ disabled: false });
    const style = flat(b.props.style);
    expect(Number(style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(Number(style.minWidth)).toBeGreaterThanOrEqual(48);
    await fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(1);
    const art = hostElements().filter((n) => n.props.importantForAccessibility === 'no-hide-descendants' && n.props.pointerEvents === 'none');
    expect(art.length).toBeGreaterThan(0);
    for (const a of art) expect(a.props.accessibilityElementsHidden).toBe(true);
  });

  it('when disabled: announces it, ignores presses and wears the flat disabled body', async () => {
    const onPress = jest.fn();
    await render(
      <FramePressable onPress={onPress} disabled testID="b">
        <Text>Evolve</Text>
      </FramePressable>,
    );
    const b = screen.getByTestId('b');
    expect(b.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(b);
    expect(onPress).not.toHaveBeenCalled();
    expect(flat(b.props.style).backgroundColor).toBe(frameBody(buttonOf('disabled', 'parchment', 0)));
  });

  it('draws the focus ring outside the box on keyboard / D-pad focus (the layout does not move)', async () => {
    await render(
      <FramePressable onPress={() => {}} testID="b">
        <Text>Go</Text>
      </FramePressable>,
    );
    const b = screen.getByTestId('b');
    const before = flat(b.props.style);
    await act(async () => b.props.onFocus?.({}));
    const outset = hostElements().filter((n) => typeof flat(n.props.style).top === 'number' && Number(flat(n.props.style).top) < 0);
    expect(outset.length).toBeGreaterThan(0);
    expect(flat(screen.getByTestId('b').props.style).paddingTop).toBe(before.paddingTop);
    await act(async () => screen.getByTestId('b').props.onBlur?.({}));
    expect(hostElements().filter((n) => Number(flat(n.props.style).top) < 0)).toHaveLength(0);
  });

  it('passes the frame text colour to its children', async () => {
    await render(
      <FramePressable onPress={() => {}} kind="plate">
        {({ textColor }) => <Text testID="t" style={{ color: textColor }}>Selected</Text>}
      </FramePressable>,
    );
    expect(flat(screen.getByTestId('t').props.style).color).toBe(plateOf('parchment', 0).textColor);
  });
});

describe('Button', () => {
  it('keeps its label as real text and its role, in every variant', async () => {
    for (const variant of ['primary', 'secondary', 'danger'] as const) {
      await render(<Button label={`Do ${variant}`} onPress={() => {}} variant={variant} />);
      expect(screen.getByRole('button', { name: `Do ${variant}` })).toBeTruthy();
      expect(screen.getByText(`Do ${variant}`)).toBeTruthy();
    }
  });
});

describe('PixelBar', () => {
  it('is hidden from screen readers and fills by the ratio', async () => {
    await render(<PixelBar kind="hp" value={50} max={200} testID="bar" />);
    const bar = screen.getByTestId('bar', HID);
    expect(bar.props.importantForAccessibility).toBe('no-hide-descendants');
    const fill = hostElements().filter((n) => Array.isArray(flat(n.props.style).transform));
    expect(fill.length).toBeGreaterThan(0);
    expect(flat(fill[0]!.props.style).transform).toEqual([{ scaleX: 0.25 }]);
  });
});
