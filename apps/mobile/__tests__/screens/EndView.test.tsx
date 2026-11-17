import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { CONTENT } from '@webgames/core/content';
import { setLang } from '@webgames/core/platform/i18n';
import { serializeRun } from '@webgames/core/sim/run/codec';
import { runScore } from '@webgames/core/sim/run/score';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { sampleRun } from '../../src/dev/sampleRuns';
import type { RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { RunScreen } from '../../src/screens/RunScreen';
import { doubleTap } from '../../test-support/press';
import { makeSession, memoryStorage, RUN_KEY, STARTER, type MemoryStorage } from '../../test-support/runFixtures';

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];

let backHandlers: BackFn[];

beforeEach(() => {
  setLang('en');
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
  backHandlers = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
    backHandlers.push(handler);
    return { remove: () => void (backHandlers = backHandlers.filter((h) => h !== handler)) };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  setLang('en');
});

async function resumedEnd(result: 'won' | 'lost', storage: MemoryStorage = memoryStorage()) {
  const run = sampleRun(result, CONTENT);
  storage.data.set(RUN_KEY, serializeRun(run));
  const session = makeSession(storage);
  if (!(await session.resume())) throw new Error('sample end did not load');
  return { session, storage, run };
}

async function renderRun(session: RunSession) {
  const onExit = jest.fn();
  await render(
    <RunSessionProvider session={session}>
      <RunScreen onExit={onExit} />
    </RunSessionProvider>,
  );
  return { onExit };
}

function statLabels(): string[] {
  return within(screen.getByTestId('end-stats'))
    .getAllByLabelText(/: \d+$/)
    .map((n) => n.props.accessibilityLabel as string);
}

describe('end screen', () => {
  it('a won run: the result in text, the core score and every stat', async () => {
    const { session, run } = await resumedEnd('won');
    await renderRun(session);
    const heading = screen.getByTestId('end-heading');
    expect(heading.props.children).toBe('Run won');
    expect(heading.props.accessibilityRole).toBe('header');
    expect(screen.getByText('The run is over: you can start again.')).toBeTruthy();
    const score = runScore(run, CONTENT);
    expect(score).toBeGreaterThan(0);
    expect(screen.getByTestId('end-score').props.accessibilityLabel).toBe(`Score: ${score}`);
    expect(screen.getByTestId('end-score-value')).toHaveTextContent(String(score));
    expect(statLabels()).toEqual([
      'Zones cleared: 3',
      'Nodes cleared: 21',
      'Elites beaten: 2',
      'Bosses beaten: 3',
      'Creatures lost: 1',
      'Souls: 7',
    ]);
    // Screen-reader focus starts at the result.
    const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    expect(focus).toHaveBeenCalledTimes(1);
    expect((focus.mock.calls[0]![0] as unknown as { props: { testID: string } }).props.testID).toBe('end-heading');
    // The run is over: no abandon button.
    expect(screen.queryByTestId('abandon')).toBeNull();
  });

  it('a lost run says so in text (colour only repeats it) and counts the zones reached', async () => {
    const { session, run } = await resumedEnd('lost');
    await renderRun(session);
    expect(screen.getByTestId('end-heading').props.children).toBe('Run lost');
    expect(statLabels()[0]).toBe('Zones cleared: 1');
    expect(screen.getByTestId('end-score').props.accessibilityLabel).toBe(`Score: ${runScore(run, CONTENT)}`);
  });

  it('"New run" clears the save and starts a fresh seed with the last starter, on the map', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const session = makeSession(storage);
    // A run started in this session (so it knows the starter), then an ended save of it.
    session.start('LOSTRUN1', 'tidewisp');
    await session.whenIdle();
    const ended = sampleRun('lost', CONTENT);
    storage.data.set(RUN_KEY, serializeRun(ended));
    expect(await session.resume()).toBe(true);
    const { onExit } = await renderRun(session);
    const removesBefore = storage.removes;
    const writesBefore = storage.writes.length;
    await user.press(screen.getByTestId('end-new-run'));
    const run = session.getSnapshot().run!;
    expect(run.phase.kind).toBe('map');
    expect(run.seed).toMatch(/^FRESH\d+$/);
    expect(run.seed).not.toBe(ended.seed);
    expect(run.party.map((m) => m.speciesId)).toEqual(['tidewisp']);
    expect(screen.getByTestId('map-screen')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
    await session.whenIdle();
    expect(storage.removes).toBe(removesBefore + 1);
    expect(storage.writes).toHaveLength(writesBefore + 1);
    expect(storage.data.get(RUN_KEY)).toBe(serializeRun(run));
  });

  it('"New run" after a resume uses the first starter (a save does not record the starter)', async () => {
    const user = userEvent.setup();
    const { session } = await resumedEnd('won');
    await renderRun(session);
    await user.press(screen.getByTestId('end-new-run'));
    expect(session.getSnapshot().run!.party.map((m) => m.speciesId)).toEqual([STARTER]);
  });

  it('a double tap on "New run" starts one run only', async () => {
    const { session, storage } = await resumedEnd('lost');
    await renderRun(session);
    const newRun = jest.spyOn(session, 'newRun');
    const button = screen.getByTestId('end-new-run');
    await doubleTap(button);
    expect(newRun).toHaveBeenCalledTimes(1);
    await session.whenIdle();
    expect(storage.writes).toHaveLength(1);
  });

  it('"Back to start" clears the save and leaves for the title', async () => {
    const user = userEvent.setup();
    const { session, storage } = await resumedEnd('won');
    const { onExit } = await renderRun(session);
    await user.press(screen.getByTestId('end-to-title'));
    expect(onExit).toHaveBeenCalledTimes(1);
    await session.whenIdle();
    expect(session.getSnapshot().run).toBeNull();
    expect(storage.data.has(RUN_KEY)).toBe(false);
  });

  it('Android back on the end screen goes to the title without a confirmation (the run is over)', async () => {
    const { session, storage } = await resumedEnd('lost');
    const { onExit } = await renderRun(session);
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = backHandlers[0]!({} as Parameters<BackFn>[0]);
    });
    expect(handled).toBe(true);
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
    await session.whenIdle();
    expect(storage.data.has(RUN_KEY)).toBe(false);
  });

  it('follows the language', async () => {
    setLang('es');
    const { session } = await resumedEnd('won');
    await renderRun(session);
    expect(screen.getByTestId('end-heading').props.children).toBe('Partida ganada');
    expect(screen.getByText('Nueva partida')).toBeTruthy();
    expect(screen.getByText('Volver al inicio')).toBeTruthy();
    expect(statLabels()[0]).toBe('Zonas superadas: 3');
    expect(screen.getByTestId('end-score').props.accessibilityLabel).toMatch(/^Puntuación: \d+$/);
  });

  it('a resumed end save opens on the end screen itself', async () => {
    const { session } = await resumedEnd('lost');
    expect(session.getSnapshot().view).toBe('end');
    await renderRun(session);
    expect(screen.getByTestId('run-end')).toBeTruthy();
    expect(screen.queryByTestId('map-screen')).toBeNull();
  });
});
