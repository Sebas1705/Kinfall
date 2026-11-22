import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
import { createAsyncRunStorage } from '@kinfall/core/platform/asyncRunStorage';
import { nodeTypeLabel } from '@kinfall/core/platform/i18n';
import { serializeRun } from '@kinfall/core/sim/run/codec';
import { availableNodes } from '@kinfall/core/sim/run/run';
import * as Localization from 'expo-localization';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { AppShell } from '../App';
import { navigationRef } from '../src/navigation/AppNavigator';
import { defaultAsyncStorage } from '../src/platform/asyncStorage';
import { createRunSession } from '../src/run/session';
import { openDevTools } from '../test-support/devTools';
import { firstNode, makeSession, memoryStorage, RUN_KEY, STARTER, type MemoryStorage } from '../test-support/runFixtures';

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];
/** Calls a back handler the way BackHandler does (the event carries nothing we read). */
const fire = (h: BackFn) => h({} as Parameters<BackFn>[0]);

function route(): string | undefined {
  return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
}

let storage: MemoryStorage;
/** Back handlers registered through BackHandler, oldest first (jest-expo runs the iOS module, which never fires). */
let backHandlers: BackFn[];

/** A hardware back press as Android dispatches it: newest handler first, until one handles it. */
function pressBack(): boolean {
  for (const h of [...backHandlers].reverse()) if (fire(h)) return true;
  return false;
}

beforeEach(async () => {
  jest.spyOn(Localization, 'getLocales').mockReturnValue([{ languageCode: 'en' }] as never);
  await AsyncStorage.clear();
  storage = memoryStorage();
  backHandlers = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
    backHandlers.push(handler);
    return { remove: () => void (backHandlers = backHandlers.filter((h) => h !== handler)) };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('app navigation', () => {
  it('opens on the title, and New run goes to the run map', async () => {
    const user = userEvent.setup();
    await render(<AppShell session={makeSession(storage)} />);
    expect(await screen.findByTestId('title-screen')).toBeTruthy();
    expect(route()).toBe('Title');
    await user.clear(screen.getByTestId('seed-input'));
    await user.type(screen.getByTestId('seed-input'), 'NAVSEED1');
    await user.press(screen.getByTestId('new-run'));
    expect(await screen.findByTestId('map-screen')).toBeTruthy();
    expect(route()).toBe('Run');
    expect(screen.getByTestId('run-seed')).toHaveTextContent('Seed: NAVSEED1');
  });

  it('Continue resumes the saved run into its exact phase', async () => {
    const user = userEvent.setup();
    const first = makeSession(storage);
    first.start('NAVSEED2', STARTER);
    const node = availableNodes(first.getSnapshot().run!)[0]!;
    first.pickNode(node.id);
    await first.whenIdle();

    await render(<AppShell session={makeSession(storage)} />);
    await waitFor(() => expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: false }));
    await user.press(screen.getByTestId('continue'));
    // The first node of this seed is a wild battle: the battle screen comes back.
    expect(node.type).toBe('wild');
    expect(await screen.findByTestId('battle-screen')).toBeTruthy();
    expect(screen.getByTestId('hud-title').props.children).toBe(nodeTypeLabel(node.type));
    expect(route()).toBe('Run');
  });

  it('abandon returns to the title with a fresh seed and no save', async () => {
    const user = userEvent.setup();
    const session = makeSession(storage);
    await render(<AppShell session={session} />);
    await user.press(await screen.findByTestId('new-run'));
    const startedSeed = session.getSnapshot().run!.seed;
    expect(startedSeed).toBe('FRESH1');
    await user.press(await screen.findByTestId(`node-${firstNode(session.getSnapshot().run!)}`));
    expect(screen.getByTestId('battle-screen')).toBeTruthy();

    // In battle, Android back opens the abandon confirmation too.
    let handled = false;
    await act(async () => {
      handled = pressBack();
    });
    expect(handled).toBe(true);
    expect(await screen.findByTestId('abandon-confirm')).toBeTruthy();
    expect(route()).toBe('Run');
    await user.press(screen.getByTestId('abandon-confirm-yes'));

    expect(await screen.findByTestId('title-screen')).toBeTruthy();
    await waitFor(() => expect(route()).toBe('Title'));
    expect(screen.getByTestId('seed-input').props.value).toBe('FRESH2');
    await session.whenIdle();
    expect(storage.data.has(RUN_KEY)).toBe(false);
    expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: true });
    // Back on the title is not the Run screen's: no handler of ours is left to keep the app open.
    expect(backHandlers.every((h) => !fire(h))).toBe(true);
  });

  it('Continue on a save that vanished stays on the title', async () => {
    const user = userEvent.setup();
    storage.data.set(RUN_KEY, serializeRun(makeRunToSave()));
    await render(<AppShell session={makeSession(storage)} />);
    await waitFor(() => expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: false }));
    storage.data.delete(RUN_KEY);
    await user.press(screen.getByTestId('continue'));
    await waitFor(() => expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: true }));
    expect(route()).toBe('Title');
  });

  it('re-reads the save when the title regains focus (damage from the dev tools, then back)', async () => {
    const user = userEvent.setup();
    const session = createRunSession({
      content: CONTENT,
      storage: createAsyncRunStorage(defaultAsyncStorage(), CONTENT),
      randomSeed: () => 'FOCUSSD1',
    });
    await render(<AppShell session={session} devTools />);
    await openDevTools(user);
    await user.press(screen.getByTestId('damage-button'));
    await screen.findByTestId('damage-status');
    await act(async () => navigationRef.goBack());
    expect(await screen.findByTestId('corrupt-notice')).toBeTruthy();
    expect(route()).toBe('Title');
  });

  it('slides screens in by default and turns the transitions off with reduce motion', async () => {
    const user = userEvent.setup();
    let reduce = false;
    let emit: ((enabled: boolean) => void) | null = null;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduce));
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, l: (enabled: boolean) => void) => {
      if (name === 'reduceMotionChanged') emit = l;
      return { remove: () => {} };
    }) as never);

    const session = makeSession(storage);
    await render(<AppShell session={session} />);
    await screen.findByTestId('title-screen');
    await waitFor(() => expect(navigationRef.getCurrentOptions()).toMatchObject({ animation: 'default' }));

    // Switched on while the app runs: the next screen change is not animated.
    reduce = true;
    await act(async () => emit?.(true));
    await user.press(screen.getByTestId('new-run'));
    expect(await screen.findByTestId('map-screen')).toBeTruthy();
    expect(navigationRef.getCurrentOptions()).toMatchObject({ animation: 'none' });
    await act(async () => session.whenIdle());
  });

  it('reaches the dev tools from the title in dev builds only', async () => {
    const dev = await render(<AppShell session={makeSession(storage)} devTools />);
    expect(await screen.findByTestId('dev-tools')).toBeTruthy();
    dev.unmount();
    await render(<AppShell session={makeSession(storage)} devTools={false} />);
    expect(await screen.findByTestId('title-screen')).toBeTruthy();
    expect(screen.queryByTestId('dev-tools')).toBeNull();
  });
});

function makeRunToSave() {
  const s = makeSession(memoryStorage());
  s.start('VANISHED', STARTER);
  return s.getSnapshot().run!;
}
