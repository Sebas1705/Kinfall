import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { LAST_GAME_KEY } from '@kinfall/core/games/registry';
import { setLang } from '@kinfall/core/platform/i18n';
import { AccessibilityInfo, Platform } from 'react-native';

import { LangContext } from '../../src/platform/LangContext';
import { HubScreen } from '../../src/screens/HubScreen';

function radios() {
  return within(screen.getByTestId('hub-games')).getAllByRole('radio');
}
function checked(): Array<boolean | undefined> {
  return radios().map((r) => r.props.accessibilityState?.checked);
}

beforeEach(async () => {
  setLang('en');
  await AsyncStorage.clear();
});

describe('hub screen', () => {
  it('lists the three games as radios with their English names, in order', async () => {
    await render(<HubScreen onPlay={jest.fn()} />);
    expect(screen.getByTestId('hub-games').props).toMatchObject({ accessibilityRole: 'radiogroup', accessibilityLabel: 'Games' });
    expect(radios().map((r) => r.props.testID)).toEqual(['game-kinfall', 'game-simulator', 'game-survival']);
    expect(screen.getByRole('radio', { name: /^Kinfall\. A creature roguelike/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Simulator, Coming soon' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Survival, Coming soon' })).toBeTruthy();
    expect(screen.getByText('Choose a game')).toBeTruthy();
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('focuses Kinfall at once (no flicker), and only Kinfall is checked', async () => {
    await render(<HubScreen onPlay={jest.fn()} />);
    // Right after the first render, before the stored game was read.
    expect(checked()).toEqual([true, false, false]);
    await act(async () => {});
    expect(checked()).toEqual([true, false, false]);
  });

  it.each(['simulator', 'survival', 'garbage', ''])('focuses Kinfall for the stored value "%s"', async (stored) => {
    await AsyncStorage.setItem(LAST_GAME_KEY, stored);
    await render(<HubScreen onPlay={jest.fn()} />);
    await act(async () => {});
    expect(checked()).toEqual([true, false, false]);
  });

  it('focuses Kinfall when the storage cannot be read', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('native down'));
    await render(<HubScreen onPlay={jest.fn()} />);
    await act(async () => {});
    expect(checked()).toEqual([true, false, false]);
    jest.restoreAllMocks();
  });

  it('Play calls onPlay("kinfall") and stores it under kinfall.lastGame', async () => {
    const user = userEvent.setup();
    const onPlay = jest.fn();
    await render(<HubScreen onPlay={onPlay} />);
    await user.press(screen.getByTestId('hub-play'));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith('kinfall');
    await waitFor(async () => expect(await AsyncStorage.getItem(LAST_GAME_KEY)).toBe('kinfall'));
  });

  it('plays even when the storage rejects the write', async () => {
    const user = userEvent.setup();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('full'));
    const onPlay = jest.fn();
    await render(<HubScreen onPlay={onPlay} />);
    await user.press(screen.getByTestId('hub-play'));
    expect(onPlay).toHaveBeenCalledWith('kinfall');
    jest.restoreAllMocks();
  });

  it('pressing the Kinfall card only focuses it (Play starts it)', async () => {
    const user = userEvent.setup();
    const onPlay = jest.fn();
    await render(<HubScreen onPlay={onPlay} />);
    await user.press(screen.getByTestId('game-kinfall'));
    expect(onPlay).not.toHaveBeenCalled();
    expect(checked()).toEqual([true, false, false]);
  });

  it('a soon card is disabled for assistive tech, takes the focus and announces instead of playing', async () => {
    const user = userEvent.setup();
    const onPlay = jest.fn();
    await render(<HubScreen onPlay={onPlay} />);
    expect(screen.getByTestId('game-simulator').props.accessibilityState).toMatchObject({ disabled: true, checked: false });
    expect(screen.getByTestId('game-kinfall').props.accessibilityState).toMatchObject({ disabled: false, checked: true });

    await user.press(screen.getByTestId('game-simulator'));
    expect(checked()).toEqual([false, true, false]);
    expect(screen.getByTestId('hub-soon-text')).toHaveTextContent('Simulator is coming soon.');

    // Play with a soon game focused announces too, and never plays.
    await user.press(screen.getByTestId('hub-play'));
    expect(onPlay).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(LAST_GAME_KEY)).toBeNull();

    await user.press(screen.getByTestId('game-survival'));
    expect(screen.getByTestId('hub-soon-text')).toHaveTextContent('Survival is coming soon.');
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('puts the announcement in a polite live region, and on iOS announces it explicitly once per press', async () => {
    const user = userEvent.setup();
    const original = Platform.OS;
    Platform.OS = 'ios';
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    try {
      await render(<HubScreen onPlay={jest.fn()} />);
      expect(screen.getByTestId('hub-soon').props.accessibilityLiveRegion).toBe('polite');
      await user.press(screen.getByTestId('game-simulator'));
      expect(announce).toHaveBeenCalledWith('Simulator is coming soon.');
      await user.press(screen.getByTestId('game-simulator'));
      expect(announce.mock.calls).toEqual([['Simulator is coming soon.'], ['Simulator is coming soon.']]);
    } finally {
      Platform.OS = original;
      jest.restoreAllMocks();
    }
  });

  it('moving back to Kinfall clears the announcement and Play works again', async () => {
    const user = userEvent.setup();
    const onPlay = jest.fn();
    await render(<HubScreen onPlay={onPlay} />);
    await user.press(screen.getByTestId('game-simulator'));
    expect(screen.queryByTestId('hub-soon-text')).not.toBeNull();
    await user.press(screen.getByTestId('game-kinfall'));
    expect(screen.queryByTestId('hub-soon-text')).toBeNull();
    await user.press(screen.getByTestId('hub-play'));
    expect(onPlay).toHaveBeenCalledWith('kinfall');
  });

  it('a card pressed before the stored game was read keeps the focus it was given', async () => {
    const user = userEvent.setup();
    await render(<HubScreen onPlay={jest.fn()} />);
    await user.press(screen.getByTestId('game-survival'));
    await act(async () => {});
    expect(checked()).toEqual([false, false, true]);
  });

  it('follows the language: labels, badges and the announcement change, the selection stays', async () => {
    const user = userEvent.setup();
    const view = await render(
      <LangContext.Provider value="en">
        <HubScreen onPlay={jest.fn()} />
      </LangContext.Provider>,
    );
    await user.press(screen.getByTestId('game-simulator'));
    setLang('es');
    await view.rerender(
      <LangContext.Provider value="es">
        <HubScreen onPlay={jest.fn()} />
      </LangContext.Provider>,
    );
    expect(screen.getByText('Elige un juego')).toBeTruthy();
    expect(screen.getByTestId('hub-games').props.accessibilityLabel).toBe('Juegos');
    expect(screen.getByRole('radio', { name: 'Simulador, Próximamente' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Supervivencia, Próximamente' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Kinfall\. Un roguelike de criaturas/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Jugar' })).toBeTruthy();
    expect(checked()).toEqual([false, true, false]);
    expect(screen.getByTestId('hub-soon-text')).toHaveTextContent('Simulador llegará pronto.');
  });
});
