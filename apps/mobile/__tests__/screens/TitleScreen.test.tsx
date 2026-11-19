import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { CONTENT } from '@webgames/core/content';
import { setLang } from '@webgames/core/platform/i18n';
import { SEED_ALPHABET } from '@webgames/core/platform/seed';
import { serializeRun } from '@webgames/core/sim/run/codec';
import * as Localization from 'expo-localization';

import { AppShell } from '../../App';
import { randomSeed } from '../../src/platform/random';
import { createRunSession, type RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { TitleScreen } from '../../src/screens/TitleScreen';
import { createAsyncRunStorage } from '@webgames/core/platform/asyncRunStorage';
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
  it('shows the game name above the heading in both languages', async () => {
    await renderTitle(makeSession(memoryStorage()));
    expect(screen.getByTestId('app-name')).toHaveTextContent('Kinfall');
    setLang('es');
    await renderTitle(makeSession(memoryStorage()));
    expect(screen.getAllByTestId('app-name').at(-1)).toHaveTextContent('Kinfall');
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

    await user.press(screen.getByTestId('discard'));
    expect(screen.getByText('Discard your saved run? This cannot be undone.')).toBeTruthy();
    await user.press(screen.getByTestId('discard-confirm-no'));
    expect(screen.queryByTestId('discard-confirm')).toBeNull();
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
    for (const id of CONTENT.starters) expect(screen.getByTestId(`sprite-${id}-3`, { includeHiddenElements: true })).toBeTruthy();
  });

  it('starts a run with the typed seed and the chosen starter', async () => {
    const user = userEvent.setup();
    const session = makeSession(memoryStorage());
    const { onRunReady } = await renderTitle(session);
    const input = await screen.findByTestId('seed-input');
    await user.clear(input);
    await user.type(input, '  MYSEED  ');
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
    await user.clear(await screen.findByTestId('seed-input'));
    await user.press(screen.getByTestId('new-run'));
    expect(session.getSnapshot().run!.seed).toBe('BLANKSD2');
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
    expect(screen.queryByTestId('dev-tools')).toBeNull();
    await renderTitle(makeSession(memoryStorage()), { onOpenDevTools: () => {} });
    expect(screen.getByTestId('dev-tools')).toBeTruthy();
  });

  it('has 48dp targets for its buttons and the seed field', async () => {
    await renderTitle(makeSession(memoryStorage()));
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean)) as { minHeight?: number };
    expect(flat(screen.getByTestId('seed-input').props.style).minHeight).toBeGreaterThanOrEqual(48);
    for (const id of ['continue', 'new-run', 'starter-cindermite']) {
      expect([id, flat(screen.getByTestId(id).props.style).minHeight! >= 48]).toEqual([id, true]);
    }
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
    expect(screen.getByTestId('language-en').props.accessibilityState).toMatchObject({ checked: true });

    await user.press(screen.getByTestId('language-es'));
    expect(screen.getByText('Inicio')).toBeTruthy();
    expect(screen.getByText('Nueva partida')).toBeTruthy();
    expect(screen.getByText('Elige tu criatura inicial')).toBeTruthy();
    expect(screen.queryByText('New run')).toBeNull();
    expect(screen.getByTestId('language-es').props.accessibilityState).toMatchObject({ checked: true });
    await waitFor(async () => expect(await AsyncStorage.getItem('webgames.lang')).toBe('es'));

    first.unmount();
    await render(<AppShell session={makeSession(storage)} />);
    expect(await screen.findByText('Inicio')).toBeTruthy();
  });
});
