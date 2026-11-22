import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
import { setLang } from '@kinfall/core/platform/i18n';
import { SEED_ALPHABET } from '@kinfall/core/platform/seed';
import { serializeRun } from '@kinfall/core/sim/run/codec';
import * as Localization from 'expo-localization';

import { AppShell } from '../../App';
import { randomSeed } from '../../src/platform/random';
import { createRunSession, type RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { TitleScreen } from '../../src/screens/TitleScreen';
import { createAsyncRunStorage } from '@kinfall/core/platform/asyncRunStorage';
import { closeTitleOptions, openTitleOptions } from '../../test-support/devTools';
import { freshRun, makeSession, memoryStorage, RUN_KEY, type MemoryStorage } from '../../test-support/runFixtures';

async function renderTitle(session: RunSession, props: Partial<Parameters<typeof TitleScreen>[0]> = {}) {
  const onRunReady = jest.fn();
  const view = await render(
    <RunSessionProvider session={session}>
      <TitleScreen onRunReady={onRunReady} {...props} />
    </RunSessionProvider>,
  );
  return { onRunReady, view };
}

function checkedStates(): Array<boolean | undefined> {
  return within(screen.getByTestId('starters'))
    .getAllByRole('radio')
    .map((r) => r.props.accessibilityState?.checked);
}

beforeEach(() => {
  setLang('en');
});

describe('title screen', () => {
  it('shows the game name as the wordmark image, named Kinfall in both languages', async () => {
    await renderTitle(makeSession(memoryStorage()));
    expect(screen.getByRole('image', { name: 'Kinfall' }).props.testID).toBe('app-name');
    setLang('es');
    await renderTitle(makeSession(memoryStorage()));
    expect(screen.getAllByRole('image', { name: 'Kinfall' }).at(-1)!.props.testID).toBe('app-name');
  });

  it('keeps Continue disabled without a save and enables it for an ok save', async () => {
    await renderTitle(makeSession(memoryStorage()));
    await waitFor(() => expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: true }));
    expect(screen.queryByTestId('corrupt-notice')).toBeNull();

    const withSave = memoryStorage({ [RUN_KEY]: serializeRun(freshRun()) });
    await renderTitle(makeSession(withSave));
    await waitFor(() => expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: false }));
  });

  it('prefills an 8-character seed from the unambiguous alphabet (random source in the app)', async () => {
    const session = createRunSession({ content: CONTENT, storage: createAsyncRunStorage(memoryStorage(), CONTENT), randomSeed });
    await renderTitle(session);
    await openTitleOptions();
    const value: string = screen.getByTestId('seed-input').props.value;
    expect(value).toMatch(new RegExp(`^[${SEED_ALPHABET}]{8}$`));
    expect(value).toBe(session.getSnapshot().titleSeed);
    // Two sessions almost never share a code (31^8 possibilities).
    const other = createRunSession({ content: CONTENT, storage: createAsyncRunStorage(null, CONTENT), randomSeed });
    expect(other.getSnapshot().titleSeed).not.toBe(value);
  });

  it('reports a corrupt save and discards it only after the inline confirmation', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage({ [RUN_KEY]: '{"broken":' });
    await renderTitle(makeSession(storage));
    expect(await screen.findByTestId('corrupt-notice')).toBeTruthy();
    expect(screen.getByText(/^Your saved run is damaged and cannot be loaded: /)).toBeTruthy();
    expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: true });

    // The confirmation needs more room than the rail has: it opens in a sheet.
    await user.press(screen.getByTestId('discard'));
    expect(within(screen.getByTestId('discard-sheet')).getByText('Discard your saved run? This cannot be undone.')).toBeTruthy();
    // The rail cuts the notice to a few lines: its full text is here too.
    expect(within(screen.getByTestId('discard-sheet')).getByText(/^Your saved run is damaged and cannot be loaded: /)).toBeTruthy();
    await user.press(screen.getByTestId('discard-confirm-no'));
    await waitFor(() => expect(screen.queryByTestId('discard-confirm')).toBeNull());
    expect(storage.data.has(RUN_KEY)).toBe(true);

    await user.press(screen.getByTestId('discard'));
    await user.press(screen.getByTestId('discard-confirm-yes'));
    await waitFor(() => expect(screen.queryByTestId('corrupt-notice')).toBeNull());
    expect(storage.data.has(RUN_KEY)).toBe(false);
    expect(storage.removes).toBe(1);
  });

  it('treats unavailable storage like no save, with the device notice', async () => {
    await renderTitle(makeSession(null));
    expect(await screen.findByTestId('saves-unavailable')).toBeTruthy();
    expect(screen.getByText('This device is not saving data right now, so this run will not be saved.')).toBeTruthy();
    expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('says saves live on this device, not in a browser', async () => {
    await renderTitle(makeSession(memoryStorage()));
    await openTitleOptions();
    const note = screen.getByTestId('saves-note');
    expect(note.props.children).toMatch(/this device/);
    expect(note.props.children).not.toMatch(/browser/);
  });

  it('shows the three starters as a radio group with exactly one checked', async () => {
    const user = userEvent.setup();
    await renderTitle(makeSession(memoryStorage()));
    const group = screen.getByTestId('starters');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Choose your starter');
    expect(checkedStates()).toEqual([true, false, false]);
    const radios = within(group).getAllByRole('radio');
    expect(radios[1]!.props.accessibilityLabel).toBe('Brambleback, Thorn. A sturdy creature that outlasts its foes.');

    await user.press(screen.getByTestId('starter-tidewisp'));
    expect(checkedStates()).toEqual([false, false, true]);
    for (const id of CONTENT.starters) expect(screen.getByTestId(`sprite-${id}-2`, { includeHiddenElements: true })).toBeTruthy();
  });

  it('starts a run with the typed seed and the chosen starter', async () => {
    const user = userEvent.setup();
    const session = makeSession(memoryStorage());
    const { onRunReady } = await renderTitle(session);
    await openTitleOptions(user);
    const input = await screen.findByTestId('seed-input');
    await user.clear(input);
    await user.type(input, '  MYSEED  ');
    await closeTitleOptions(user);
    await user.press(screen.getByTestId('starter-brambleback'));
    await user.press(screen.getByTestId('new-run'));
    expect(onRunReady).toHaveBeenCalledTimes(1);
    const run = session.getSnapshot().run!;
    expect(run.seed).toBe('MYSEED');
    expect(run.party[0]!.speciesId).toBe('brambleback');
  });

  it('draws a fresh seed when the field is blank', async () => {
    const user = userEvent.setup();
    const session = makeSession(memoryStorage());
    await renderTitle(session, { randomSeed: () => 'BLANKSD2' });
    await openTitleOptions(user);
    await user.clear(await screen.findByTestId('seed-input'));
    await closeTitleOptions(user);
    await user.press(screen.getByTestId('new-run'));
    expect(session.getSnapshot().run!.seed).toBe('BLANKSD2');
    await openTitleOptions(user);
    expect(screen.getByTestId('seed-input').props.value).toBe('BLANKSD2');
  });

  it('continues an ok save', async () => {
    const user = userEvent.setup();
    const session = makeSession(memoryStorage({ [RUN_KEY]: serializeRun(freshRun('SAVEDRUN')) }));
    const { onRunReady } = await renderTitle(session);
    await waitFor(() => expect(screen.getByTestId('continue').props.accessibilityState).toMatchObject({ disabled: false }));
    await user.press(screen.getByTestId('continue'));
    await waitFor(() => expect(onRunReady).toHaveBeenCalledTimes(1));
    expect(session.getSnapshot().run!.seed).toBe('SAVEDRUN');
  });

  it('hides the dev tools link unless asked (production builds)', async () => {
    await renderTitle(makeSession(memoryStorage()));
    await openTitleOptions();
    expect(screen.queryByTestId('dev-tools')).toBeNull();
  });

  it('shows the dev tools link in the options sheet when asked (development builds)', async () => {
    const onOpenDevTools = jest.fn();
    await renderTitle(makeSession(memoryStorage()), { onOpenDevTools });
    expect(screen.queryByTestId('dev-tools')).toBeNull();
    await openTitleOptions();
    await userEvent.setup().press(screen.getByTestId('dev-tools'));
    expect(onOpenDevTools).toHaveBeenCalledTimes(1);
  });

  it('has 48dp targets for its buttons and the seed field', async () => {
    await renderTitle(makeSession(memoryStorage()));
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean)) as { minHeight?: number };
    for (const id of ['continue', 'new-run', 'starter-cindermite', 'hud-options', 'hud-settings']) {
      expect([id, flat(screen.getByTestId(id).props.style).minHeight! >= 48]).toEqual([id, true]);
    }
    await openTitleOptions();
    expect(flat(screen.getByTestId('seed-input').props.style).minHeight).toBeGreaterThanOrEqual(48);
  });
});

describe('title screen language toggle (whole app)', () => {
  let storage: MemoryStorage;
  beforeEach(async () => {
    jest.spyOn(Localization, 'getLocales').mockReturnValue([{ languageCode: 'en' }] as never);
    await AsyncStorage.clear();
    storage = memoryStorage();
  });
  afterEach(() => {
  jest.restoreAllMocks();
});

  it('switches every text to Spanish, persists the choice and restores it on the next start', async () => {
    const user = userEvent.setup();
    const first = await render(<AppShell session={makeSession(storage)} />);
    expect(await screen.findByText('Start')).toBeTruthy();
    // The language switch lives in the Settings sheet (the title has no toggles of its own).
    expect(screen.queryByTestId('language-en')).toBeNull();
    await user.press(screen.getByTestId('hud-settings'));
    expect(screen.getByTestId('language-en').props.accessibilityState).toMatchObject({ checked: true });

    await user.press(screen.getByTestId('language-es'));
    // The screen behind the sheet is hidden from readers, but it follows the language at once.
    const behind = { includeHiddenElements: true };
    expect(screen.getByText('Inicio', behind)).toBeTruthy();
    expect(screen.getByText('Nueva partida', behind)).toBeTruthy();
    expect(screen.getByLabelText('Elige tu criatura inicial', behind)).toBeTruthy();
    expect(screen.queryByText('New run', behind)).toBeNull();
    expect(screen.getByTestId('language-es').props.accessibilityState).toMatchObject({ checked: true });
    await waitFor(async () => expect(await AsyncStorage.getItem('webgames.lang')).toBe('es'));

    first.unmount();
    await render(<AppShell session={makeSession(storage)} />);
    expect(await screen.findByText('Inicio')).toBeTruthy();
  });
});
