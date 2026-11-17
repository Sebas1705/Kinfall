import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { CONTENT } from '@webgames/core/content';
import type { AsyncStorageLike } from '@webgames/core/platform/asyncRunStorage';
import { simulateRun } from '@webgames/core/sim/run/bot';
import { hashRun, serializeRun } from '@webgames/core/sim/run/codec';
import * as Localization from 'expo-localization';
import { AccessibilityInfo, PixelRatio } from 'react-native';

import App from '../App';
import { openDevTools } from '../test-support/devTools';
import { sampleRun } from '../src/dev/sampleRuns';
import HelloScreen from '../src/HelloScreen';

const RUN_KEY = 'webgames.run.v1';
const LANG_KEY = 'webgames.lang';

function coreHash(seed: string): string {
  const starterId = CONTENT.starters[0];
  if (!starterId) throw new Error('no starters');
  return hashRun(simulateRun(seed, starterId, CONTENT).run);
}

function text(node: { props: { children?: unknown } }): string {
  const c = node.props.children;
  return Array.isArray(c) ? c.join('') : String(c);
}

describe('hello screen adapters', () => {
  beforeEach(async () => {
    jest.spyOn(Localization, 'getLocales').mockReturnValue([{ languageCode: 'en' }] as never);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    await AsyncStorage.clear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts in the device language and persists a language toggle', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await openDevTools();
    expect(text(await screen.findByTestId('language-line'))).toBe('Language: en');

    await user.press(screen.getByTestId('lang-es'));
    expect(text(screen.getByTestId('language-line'))).toBe('Idioma: es');
    await waitFor(async () => expect(await AsyncStorage.getItem(LANG_KEY)).toBe('es'));
  });

  it('shows the saved language on the first frame after a restart', async () => {
    await AsyncStorage.setItem(LANG_KEY, 'es');
    await render(<App />);
    await openDevTools();
    expect(text(await screen.findByTestId('language-line'))).toBe('Idioma: es');
    expect(screen.queryByText('Language: en')).toBeNull();
  });

  it('renders nothing of the screen until the language is installed', async () => {
    let release: (v: string | null) => void = () => {};
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise((r) => (release = r)));
    await render(<App />);
    expect(screen.queryByTestId('language-line')).toBeNull();
    expect(screen.queryByTestId('title-screen')).toBeNull();
    release('es');
    await openDevTools();
    expect(text(await screen.findByTestId('language-line'))).toBe('Idioma: es');
  });

  it('saves the last run, then loads it back with the same hash', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await openDevTools();
    await screen.findByTestId('run-button');
    await user.press(screen.getByTestId('run-button'));
    await user.press(screen.getByTestId('save-button'));
    expect(text(await screen.findByTestId('save-status'))).toBe(`Saved: ${coreHash('golden-0')}`);
    expect(await AsyncStorage.getItem(RUN_KEY)).not.toBeNull();

    await user.press(screen.getByTestId('load-button'));
    expect(text(await screen.findByTestId('load-status'))).toBe(`Load: ok ${coreHash('golden-0')}`);
  });

  it('loads none when nothing was saved', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await openDevTools();
    await user.press(await screen.findByTestId('load-button'));
    expect(text(await screen.findByTestId('load-status'))).toBe('Load: none');
  });

  it('reports corrupt text without deleting it', async () => {
    const user = userEvent.setup();
    const good = serializeRun(simulateRun('golden-0', CONTENT.starters[0]!, CONTENT).run);
    const damaged = good.replace('"zone":', '"zone":9');
    await AsyncStorage.setItem(RUN_KEY, damaged);
    await render(<App />);
    await openDevTools();
    await user.press(await screen.findByTestId('load-button'));
    expect(text(await screen.findByTestId('load-status'))).toMatch(/^Load: corrupt\. Your saved run is damaged/);
    expect(await AsyncStorage.getItem(RUN_KEY)).toBe(damaged);
  });

  it('saves a sample run on request (QA aid for the event and end screens)', async () => {
    const user = userEvent.setup();
    await render(<HelloScreen />);
    await user.press(screen.getByTestId('sample-recruitFull'));
    expect(text(await screen.findByTestId('sample-status'))).toBe('Saved sample run: recruitFull');
    await user.press(screen.getByTestId('load-button'));
    expect(text(await screen.findByTestId('load-status'))).toMatch(/^Load: ok /);
    expect(await AsyncStorage.getItem(RUN_KEY)).toBe(serializeRun(sampleRun('recruitFull', CONTENT)));
  });

  it('damages the saved run on request (QA aid for the corrupt-save notice)', async () => {
    const user = userEvent.setup();
    await render(<HelloScreen />);
    await user.press(screen.getByTestId('damage-button'));
    expect(text(await screen.findByTestId('damage-status'))).toBe('Damaged the saved run');
    await user.press(screen.getByTestId('load-button'));
    expect(text(await screen.findByTestId('load-status'))).toMatch(/^Load: corrupt\. /);
    expect(await AsyncStorage.getItem(RUN_KEY)).toBe('{"version":1,"damaged":true}');
  });

  it('reports a failing storage as unavailable and a failed save with the core message', async () => {
    const user = userEvent.setup();
    const broken: AsyncStorageLike = {
      getItem: () => Promise.reject(new Error('disk gone')),
      setItem: () => Promise.reject(new Error('disk full')),
      removeItem: () => Promise.reject(new Error('disk gone')),
    };
    await render(<HelloScreen storage={broken} />);
    await user.press(screen.getByTestId('load-button'));
    expect(text(await screen.findByTestId('load-status'))).toBe('Load: unavailable (disk gone)');

    await user.press(screen.getByTestId('run-button'));
    await user.press(screen.getByTestId('save-button'));
    expect(text(await screen.findByTestId('save-status'))).toBe(
      'Could not save your run: disk full. You can keep playing.',
    );
  });

  it('reports unavailable when there is no storage at all', async () => {
    const user = userEvent.setup();
    await render(<HelloScreen storage={null} />);
    await user.press(screen.getByTestId('load-button'));
    expect(text(await screen.findByTestId('load-status'))).toBe('Load: unavailable (Storage is not available.)');
  });

  it('shows the accessibility settings read-only', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.5);
    await render(<App />);
    await openDevTools();
    await waitFor(() => expect(text(screen.getByTestId('a11y-line'))).toBe('Reduce motion: on / Font scale: 1.5'));
  });
});
