// The Jest twin of the Maestro smoke flow (.maestro/smoke-run.yaml): the same taps, by the same
// testIDs, on the whole app. It pins what the device flow relies on: with seed SMOKE002 and the
// default starter, the first node is a wild battle that one press of the first enabled choice wins,
// which leads to a recruit; then the map, the abandon confirmation and the title with no save.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setLang } from '@webgames/core/platform/i18n';
import * as Localization from 'expo-localization';
import { AccessibilityInfo } from 'react-native';

import { AppShell } from '../App';
import { flush, mockAnimations } from '../test-support/battleFixtures';
import { makeSession, memoryStorage, RUN_KEY, STARTER } from '../test-support/runFixtures';

/** The seed typed by the Maestro smoke flow. */
const SMOKE_SEED = 'SMOKE002';

type Node = ReturnType<typeof screen.getByTestId>;
const enabled = (n: Node) => !n.props.accessibilityState?.disabled;

/** Lets a battle turn play out: fake time in steps until the choices are no longer busy. */
async function settleTurn() {
  for (let i = 0; i < 100 && screen.queryByTestId('battle-choices')?.props.accessibilityState?.busy; i++) {
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await flush();
  }
}

beforeEach(async () => {
  setLang('en');
  jest.useFakeTimers();
  mockAnimations();
  jest.spyOn(Localization, 'getLocales').mockReturnValue([{ languageCode: 'en' }] as never);
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  await AsyncStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setLang('en');
});

describe('smoke path (twin of the Maestro flow)', () => {
  it('new run, first node, battle, recruit, map, abandon, title', async () => {
    const storage = memoryStorage();
    const session = makeSession(storage);
    await render(<AppShell session={session} />);
    await flush();
    expect(await screen.findByTestId('title-screen')).toBeTruthy();

    // Title: type the seed, keep the default (first) starter, start.
    await fireEvent.changeText(screen.getByTestId('seed-input'), SMOKE_SEED);
    expect(screen.getByTestId(`starter-${STARTER}`).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByTestId('new-run'));
    await flush();
    expect(await screen.findByTestId('map-screen')).toBeTruthy();

    // Map: the first enabled node (Maestro: id "node-.*", enabled, index 0).
    const nodes = screen.getAllByTestId(/^node-/).filter(enabled);
    expect(nodes.length).toBeGreaterThan(0);
    await fireEvent.press(nodes[0]!);
    await flush();
    expect(screen.getByTestId('battle-screen')).toBeTruthy();

    // Battle: press the first enabled choice until the battle is over.
    let turns = 0;
    while (screen.queryByTestId('battle-screen') && turns < 20) {
      await fireEvent.press(screen.getAllByTestId('battle-choice').filter(enabled)[0]!);
      turns++;
      await settleTurn();
    }
    expect(turns).toBe(1);

    // Recruit: the first choice takes the defeated creature.
    expect(await screen.findByTestId('event-screen')).toBeTruthy();
    expect(session.getSnapshot().run!.phase.kind).toBe('recruit');
    expect(screen.getByTestId('event-choice-0').props.accessibilityLabel).toMatch(/^Recruit/);
    await fireEvent.press(screen.getByTestId('event-choice-0'));
    await flush();
    expect(await screen.findByTestId('map-screen')).toBeTruthy();
    expect(session.getSnapshot().run!.party).toHaveLength(2);

    // Abandon, confirmed: back on the title, with no saved run.
    await fireEvent.press(screen.getByTestId('abandon'));
    await fireEvent.press(await screen.findByTestId('abandon-confirm-yes'));
    await flush();
    expect(await screen.findByTestId('title-screen')).toBeTruthy();
    await act(async () => session.whenIdle());
    expect(storage.data.has(RUN_KEY)).toBe(false);
    expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
