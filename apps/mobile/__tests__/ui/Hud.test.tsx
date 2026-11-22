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
    await screen.rerender(<Hud screen="battle" onSettings={() => {}} onLog={onLog} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Log' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    const style = screen.getByTestId('hud-log').props.style as unknown;
    const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : (style as object));
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    setLang('es');
    await screen.rerender(<Hud screen="battle" onSettings={() => {}} onLog={onLog} />);
    expect(screen.getByRole('button', { name: 'Registro' })).toBeTruthy();
  });

  it('lets a screen name the extra button and the heading (the run details, the title options)', async () => {
    const onLog = jest.fn();
    await render(<Hud screen="map" onSettings={() => {}} onLog={onLog} logLabel="Run" logTestID="hud-run" zoneLabel="Zone 1" titleTestID="map-heading" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Run' }));
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('hud-run')).toBeTruthy();
    expect(screen.queryByTestId('hud-log')).toBeNull();
    expect(screen.getByTestId('map-heading').props.accessibilityRole).toBe('header');
    expect(screen.queryByTestId('hud-title')).toBeNull();
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

  it('keeps the Settings button at least 48dp', async () => {
    await render(<Hud screen="map" onSettings={() => {}} />);
    const style = screen.getByTestId('hud-settings').props.style as unknown;
    const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : (style as object));
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    expect(flat.minWidth).toBeGreaterThanOrEqual(48);
  });
});
