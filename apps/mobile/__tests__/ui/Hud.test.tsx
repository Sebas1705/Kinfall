import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { setLang } from '@kinfall/core/platform/i18n';
import { Dimensions, StyleSheet } from 'react-native';

import { Hud } from '../../src/ui/Hud';

function windowIs(width: number, height: number, fontScale = 1) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, fontScale, scale: 2 });
}

const party = [
  { name: 'Ember', hp: 7, maxHp: 10 },
  { name: 'Moss', hp: 0, maxHp: 8 },
];

beforeEach(() => {
  setLang('en');
  windowIs(640, 360);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Hud', () => {
  it('shows the zone, the party chips with HP and a Settings button that calls back', async () => {
    const onSettings = jest.fn();
    await render(<Hud screen="map" onSettings={onSettings} party={party} zoneLabel="Ashen Marsh 3/7" />);
    expect(screen.getByText('Ashen Marsh 3/7')).toBeTruthy();
    expect(screen.getByText('Ember 7/10')).toBeTruthy();
    expect(screen.getByText('Moss 0/8')).toBeTruthy();
    expect(screen.getByTestId('hud-chip-0').props.accessibilityLabel).toBe('Ember 7/10');
    expect(screen.getByTestId('hud-chip-0').props.accessibilityRole).toBe('text');
    const btn = screen.getByRole('button', { name: 'Settings' });
    await fireEvent.press(btn);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('shows a Log button only when onLog is given, at least 48dp, in both languages', async () => {
    const onLog = jest.fn();
    await render(<Hud screen="battle" onSettings={() => {}} />);
    expect(screen.queryByTestId('hud-log')).toBeNull();
    await screen.rerender(<Hud screen="battle" onSettings={() => {}} onExtra={onLog} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    const style = screen.getByTestId('hud-log').props.style as unknown;
    const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : (style as object));
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    setLang('es');
    await screen.rerender(<Hud screen="battle" onSettings={() => {}} onExtra={onLog} />);
    expect(screen.getByRole('button', { name: 'Registro' })).toBeTruthy();
  });

  it('lets a screen name the extra button and the heading (the run details, the title options)', async () => {
    const onLog = jest.fn();
    await render(<Hud screen="map" onSettings={() => {}} onExtra={onLog} extraLabel="Run" extraTestID="hud-run" zoneLabel="Zone 1" titleTestID="map-heading" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Run' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('hud-run')).toBeTruthy();
    expect(screen.queryByTestId('hud-log')).toBeNull();
    expect(screen.getByTestId('map-heading').props.accessibilityRole).toBe('header');
    expect(screen.queryByTestId('hud-title')).toBeNull();
  });

  it('shows full chips when they fit', async () => {
    const three = [
      { name: 'Bramblewarden', hp: 120, maxHp: 120 },
      { name: 'Cindermite', hp: 20, maxHp: 120 },
      { name: 'Tidewisp', hp: 90, maxHp: 120 },
    ];
    windowIs(914, 411);
    await render(<Hud screen="map" onSettings={() => {}} onExtra={() => {}} extraLabel="Run" party={three} zoneLabel="Zone 2: Thornwood Hollow" />);
    expect(screen.getAllByTestId(/^hud-chip-[0-9]/)).toHaveLength(3);
  });

  it('shows one compact chip (a low-HP cue, every member in its name) when the full chips do not fit', async () => {
    const three = [
      { name: 'Bramblewarden', hp: 120, maxHp: 120 },
      { name: 'Cindermite', hp: 20, maxHp: 120 },
      { name: 'Tidewisp', hp: 90, maxHp: 120 },
    ];
    windowIs(360, 640, 1.3);
    await render(<Hud screen="map" onSettings={() => {}} onExtra={() => {}} extraLabel="Run" party={three} zoneLabel="Zone 2" />);
    expect(screen.queryByTestId('hud-chip-0')).toBeNull();
    const all = screen.getByTestId('hud-chip-all');
    expect(all.props.accessibilityLabel).toBe('Bramblewarden 120/120, Cindermite 20/120, Tidewisp 90/120');
    expect(screen.getByText('♥ 3 !')).toBeTruthy();
  });

  it('falls back to the app title and writes the Settings label in Spanish', async () => {
    setLang('es');
    await render(<Hud screen="title" onSettings={() => {}} />);
    expect(screen.getByText('Kinfall')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajustes' })).toBeTruthy();
  });

  it('is exactly the contract HUD height in console mode', async () => {
    await render(<Hud screen="map" onSettings={() => {}} />);
    expect(StyleSheet.flatten(screen.getByTestId('hud').props.style).height).toBe(52);
  });

  it('has no fixed height in the fallback, only a minimum', async () => {
    windowIs(640, 360, 2);
    await render(<Hud screen="map" onSettings={() => {}} />);
    const style = StyleSheet.flatten(screen.getByTestId('hud').props.style);
    expect(style.height).toBeUndefined();
    expect(style.minHeight).toBeGreaterThanOrEqual(52);
  });

  it('in the fallback pins the row to the top, keeps the heading a minimum width and plans the chips', async () => {
    windowIs(360, 640, 2);
    const long = [0, 1, 2].map(() => ({ name: 'Zarzaguardián', hp: 12, maxHp: 12 }));
    await render(<Hud screen="map" onSettings={() => {}} party={long} zoneLabel="Zona 1: Pantano Cenizo 3/7" />);
    const bar = StyleSheet.flatten(screen.getByTestId('hud').props.style);
    expect(bar.alignItems).toBe('flex-start');
    expect(StyleSheet.flatten(screen.getByTestId('hud-title').props.style).minWidth).toBeGreaterThanOrEqual(96);
    // Three long names at 200% do not fit a 360 dp bar: no three wrapped chips that make the row tall
    // (the Run sheet lists the party).
    expect(screen.queryByTestId('hud-chip-0')).toBeNull();
  });

  it('keeps the Settings button at least 48dp', async () => {
    await render(<Hud screen="map" onSettings={() => {}} />);
    const style = screen.getByTestId('hud-settings').props.style as unknown;
    const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : (style as object));
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    expect(flat.minWidth).toBeGreaterThanOrEqual(48);
  });
});
