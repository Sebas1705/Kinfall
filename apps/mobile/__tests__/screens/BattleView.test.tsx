import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
import { lookup } from '@kinfall/core/content/lookup';
import { watchdogMs } from '@kinfall/core/models/battleController';
import { buildMenu, intentText } from '@kinfall/core/models/menu';
import { getLang, nodeTypeLabel, setLang, speciesName, t, type Lang } from '@kinfall/core/platform/i18n';
import { serializeRun } from '@kinfall/core/sim/run/codec';
import type { BattleState, Side } from '@kinfall/core/sim/state';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { LangContext } from '../../src/platform/LangContext';
import type { RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { BattleView, hudLabel } from '../../src/screens/BattleView';
import { RunScreen } from '../../src/screens/RunScreen';
import { shownOf } from '../../src/battle/sceneModel';
import { battleOf, flush, mockAnimations, sessionInBattle } from '../../test-support/battleFixtures';
import { makeSession, memoryStorage, RUN_KEY } from '../../test-support/runFixtures';

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];

/** Seeds whose first node is a wild battle: two turns of first moves (then the run ends) and one (then a recruit). */
const LONG = 'MAPSEED1';
const SHORT = 'FRESH1';

let backHandlers: BackFn[];
let reduceMotion: boolean;

beforeEach(() => {
  setLang('en');
  jest.useFakeTimers();
  reduceMotion = false;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduceMotion));
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  backHandlers = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
    backHandlers.push(handler);
    return { remove: () => void (backHandlers = backHandlers.filter((h) => h !== handler)) };
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  setLang('en');
});

function Shell({ session, lang, children }: { session: RunSession; lang: Lang; children: React.ReactNode }) {
  return (
    <LangContext.Provider value={lang}>
      <RunSessionProvider session={session}>{children}</RunSessionProvider>
    </LangContext.Provider>
  );
}

async function renderRunScreen(session: RunSession) {
  const onExit = jest.fn();
  const utils = await render(
    <Shell session={session} lang={getLang()}>
      <RunScreen onExit={onExit} />
    </Shell>,
  );
  await flush();
  return { onExit, ...utils };
}

async function renderBattle(session: RunSession, props: { confirming?: boolean } = {}) {
  const onEnd = jest.fn();
  const onAbandon = jest.fn();
  const run = session.getSnapshot().run!;
  const tree = (lang: Lang, confirming = props.confirming ?? false) => (
    <Shell session={session} lang={lang}>
      <BattleView run={run} onEnd={onEnd} onAbandon={onAbandon} confirming={confirming} />
    </Shell>
  );
  const utils = await render(tree(getLang()));
  await flush();
  return { onEnd, onAbandon, rerenderWith: (lang: Lang, confirming?: boolean) => utils.rerender(tree(lang, confirming)) };
}

const choices = () => screen.getAllByTestId('battle-choice');
const enabledChoices = () => choices().filter((c) => !c.props.accessibilityState?.disabled);
const hpText = (side: Side) => screen.getByTestId(`hud-${side}-hp`).props.children as string;
const active = (s: BattleState, side: Side) => s.teams[side][s.active[side]]!;

/** What the HUDs and choices must show for a settled `state`. */
function expectShows(state: BattleState) {
  for (const side of ['player', 'enemy'] as const) {
    const c = active(state, side);
    expect(hpText(side)).toBe(`HP ${c.hp}/${c.maxHp}`);
    expect(screen.getByTestId(`hud-${side}-focus`).props.children).toBe(`Focus ${c.focus}/${c.maxFocus}`);
    expect(screen.getByTestId(`hud-${side}`).props.accessibilityLabel).toContain(hudLabel(side, shownOf(c)));
    if (c.status) expect(within(screen.getByTestId(`hud-${side}-status`)).getByText(c.status.id === 'stun' ? 'Stun' : 'Scorch')).toBeTruthy();
    else expect(screen.queryByTestId(`hud-${side}-status`)).toBeNull();
  }
  const model = buildMenu(state, CONTENT);
  expect(choices().map((c) => c.props.accessibilityLabel.split(',')[0])).toEqual(model.entries.map((e) => e.label));
  const intent = intentText(state, CONTENT);
  if (intent) expect(screen.getByTestId('battle-intent').props.children).toBe(intent);
  else expect(screen.queryByTestId('battle-intent')).toBeNull();
}

describe('battle screen', () => {
  it('plays a whole battle with the real engine: one autosave per turn, locked while a turn plays, then the next phase', async () => {
    // Animations that only finish on their time budget keep each turn pending until timers advance.
    const anims = mockAnimations({ stall: true });
    const { session, storage } = sessionInBattle(LONG);
    await session.whenIdle();
    const act0 = jest.spyOn(session, 'act');
    await renderRunScreen(session);
    expect(screen.getByTestId('battle-screen')).toBeTruthy();
    expect(screen.queryByTestId('run-log')).toBeNull();
    expectShows(battleOf(session.getSnapshot().run));

    let turns = 0;
    let writes = storage.writes.length;
    while (screen.queryByTestId('battle-screen')) {
      const before = session.getSnapshot().run!;
      const first = enabledChoices()[0]!;
      await fireEvent.press(first);
      turns++;
      // The turn is applied (and its save queued) before anything plays; input is locked meanwhile.
      expect(act0).toHaveBeenCalledTimes(turns);
      expect(session.getSnapshot().run).not.toBe(before);
      expect(screen.getByTestId('battle-choices').props.accessibilityState).toEqual({ busy: true });
      for (const c of choices()) expect(c.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(choices()[0]!);
      expect(act0).toHaveBeenCalledTimes(turns);
      await session.whenIdle();
      expect(storage.writes.length).toBe(writes + 1);
      writes = storage.writes.length;
      expect(storage.data.get(RUN_KEY)).toBe(serializeRun(session.getSnapshot().run!));
      // Each animation step finishes on its own budget, well inside the turn's watchdog.
      for (let i = 0; i < 100 && screen.queryByTestId('battle-choices')?.props.accessibilityState?.busy; i++) {
        await act(async () => {
          jest.advanceTimersByTime(100);
        });
        await flush();
      }
      const run = session.getSnapshot().run!;
      if (run.phase.kind === 'battle') expectShows(run.phase.battle);
      expect(turns).toBeLessThan(100);
    }
    expect(anims.started.length).toBeGreaterThan(0);
    // Every step ended on its own time budget: the turn watchdog never had to step in.
    expect(jest.mocked(console.warn)).not.toHaveBeenCalled();
    const run = session.getSnapshot().run!;
    expect(run.phase.kind).not.toBe('battle');
    // The next phase shows, with the run log lines of the battle's end as the fresh lines.
    expect(screen.getByTestId(`run-${session.getSnapshot().view}`)).toBeTruthy();
    const fresh = screen.getByTestId('run-log-fresh');
    expect(within(fresh).getAllByTestId('run-log-line').length).toBe(session.getSnapshot().logFresh);
    expect(session.getSnapshot().logFresh).toBeGreaterThan(0);
  });

  it('calls onEnd exactly once, after the final play settled', async () => {
    mockAnimations({ stall: true });
    const { session } = sessionInBattle(SHORT);
    const { onEnd } = await renderBattle(session);
    await fireEvent.press(enabledChoices()[0]!);
    // The run already left the battle, but the screen waits for the stalled animation.
    expect(session.getSnapshot().run!.phase.kind).not.toBe('battle');
    await flush();
    expect(onEnd).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(watchdogMs(50));
    });
    await flush();
    expect(onEnd).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await flush();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('finishes a stalled animation within the watchdog and unlocks the choices', async () => {
    mockAnimations({ stall: true });
    const { session } = sessionInBattle(LONG);
    await renderBattle(session);
    await fireEvent.press(enabledChoices()[0]!);
    await flush();
    expect(enabledChoices()).toHaveLength(0);
    await act(async () => {
      jest.advanceTimersByTime(watchdogMs(40));
    });
    await flush();
    expect(enabledChoices().length).toBeGreaterThan(0);
    expectShows(battleOf(session.getSnapshot().run));
  });

  it('with reduce motion plays no animation and shows the same final state', async () => {
    reduceMotion = true;
    const anims = mockAnimations();
    const { session } = sessionInBattle(LONG);
    await renderBattle(session);
    await fireEvent.press(enabledChoices()[0]!);
    await flush();
    expect(anims.started).toHaveLength(0);
    expectShows(battleOf(session.getSnapshot().run));

    // The same seed and pick with motion on reaches the same state.
    reduceMotion = false;
    const other = sessionInBattle(LONG).session;
    other.act({ type: 'battle', action: { type: 'move', moveIndex: 0 } });
    expect(other.getSnapshot().run).toEqual(session.getSnapshot().run);
  });

  it('keeps the shown battle when the run rejects a turn, and the next turn plays normally', async () => {
    mockAnimations();
    const warn = jest.fn();
    const { session } = sessionInBattle(LONG);
    const start = battleOf(session.getSnapshot().run);
    await renderBattle(session);
    jest.spyOn(console, 'warn').mockImplementation(warn);
    jest.spyOn(session, 'act').mockReturnValueOnce({ ok: false, reason: 'phase' });
    await fireEvent.press(enabledChoices()[0]!);
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(battleOf(session.getSnapshot().run)).toBe(start);
    expectShows(start);
    expect(screen.queryByTestId('battle-log')).toBeNull();

    await fireEvent.press(enabledChoices()[0]!);
    await flush();
    const after = battleOf(session.getSnapshot().run);
    expect(after).not.toBe(start);
    expectShows(after);
    expect(screen.getAllByTestId('battle-log-line').length).toBeGreaterThan(0);
  });

  it('resumes a saved mid-battle state: same HP, status, intent and choices, empty log', async () => {
    mockAnimations();
    const storage = memoryStorage();
    const { session: first } = sessionInBattle(LONG, storage);
    expect(first.act({ type: 'battle', action: { type: 'move', moveIndex: 0 } }).ok).toBe(true);
    const saved = battleOf(first.getSnapshot().run);
    await first.whenIdle();

    const session = makeSession(storage);
    expect(await session.resume()).toBe(true);
    await renderRunScreen(session);
    expect(screen.getByTestId('battle-screen')).toBeTruthy();
    expect(screen.getByTestId('battle-heading').props.children).toBe(nodeTypeLabel('wild'));
    expectShows(saved);
    expect(screen.queryByTestId('battle-log')).toBeNull();
    expect(screen.getByTestId('battle-prompt').props.children).toBe(
      `What will ${speciesName(lookup(CONTENT).species(active(saved, 'player').speciesId))} do?`,
    );
  });

  it('abandons from the battle after the two-step confirmation, also from Android back, and clears the save', async () => {
    mockAnimations();
    const { session, storage } = sessionInBattle(LONG);
    await session.whenIdle();
    const { onExit } = await renderRunScreen(session);
    await act(async () => {
      expect(backHandlers[0]!({} as never)).toBe(true);
    });
    expect(screen.getByTestId('abandon-confirm')).toBeTruthy();
    expect(screen.queryByTestId('abandon')).toBeNull();
    await fireEvent.press(screen.getByTestId('abandon-confirm-no'));
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    expect(screen.getByTestId('battle-screen')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('abandon'));
    expect(screen.getByText('Abandon this run? Your save will be deleted.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('abandon-confirm-yes'));
    expect(onExit).toHaveBeenCalledTimes(1);
    await flush();
    await session.whenIdle();
    expect(session.getSnapshot().run).toBeNull();
    expect(storage.data.has(RUN_KEY)).toBe(false);
  });

  it('rebuilds the texts once when the language changes during a pending turn', async () => {
    mockAnimations({ stall: true });
    const { session } = sessionInBattle(LONG);
    const { rerenderWith } = await renderBattle(session);
    await fireEvent.press(enabledChoices()[0]!);
    await flush();
    const englishPrompt = screen.getByTestId('battle-prompt').props.children;
    setLang('es');
    await rerenderWith('es');
    await flush();
    // Nothing visible is rebuilt while the turn plays.
    expect(screen.getByTestId('battle-prompt').props.children).toBe(englishPrompt);
    await act(async () => {
      jest.advanceTimersByTime(watchdogMs(40));
    });
    await flush();
    const state = battleOf(session.getSnapshot().run);
    expect(screen.getByTestId('battle-prompt').props.children).toBe(buildMenu(state, CONTENT).prompt);
    expect(screen.getByTestId('battle-prompt').props.children).toMatch(/^¿Qué hará /);
    // One turn in the log, in Spanish, not announced again.
    const lines = screen.getAllByTestId('battle-log-line').map((l) => l.props.children as string);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => /usa /.test(l))).toBe(true);
    expect(within(screen.getByTestId('battle-log-fresh')).queryAllByTestId('battle-log-line')).toHaveLength(0);
    expect(hpText('player')).toMatch(/^PS /);
  });

  it('names the choices as buttons with element, power and focus cost, and the HUD in text', async () => {
    mockAnimations();
    const { session } = sessionInBattle(LONG);
    await renderBattle(session);
    const state = battleOf(session.getSnapshot().run);
    const species = lookup(CONTENT).species(active(state, 'player').speciesId);
    const buttons = screen.getAllByRole('button').filter((b) => b.props.testID === 'battle-choice');
    expect(buttons).toHaveLength(species.moves.length);
    species.moves.forEach((id, i) => {
      const m = lookup(CONTENT).move(id);
      const label = buttons[i]!.props.accessibilityLabel as string;
      expect(label.startsWith(`${m.names.en}, `)).toBe(true);
      expect(label).toContain(`Focus ${m.focusCost}`);
      if (m.kind === 'damage') expect(label).toContain(`Power ${m.power}`);
      expect(within(buttons[i]!).getByTestId(`element-${m.element}-icon`, { includeHiddenElements: true })).toBeTruthy();
      expect(buttons[i]!.props.accessibilityState).toMatchObject({ disabled: false });
    });
    const p = active(state, 'player');
    expect(screen.getByTestId('hud-player').props.accessibilityLabel).toBe(
      `You: ${species.names.en}, ${species.elements.map((e) => t(`element.${e}`)).join(' / ')}. HP ${p.hp}/${p.maxHp}, focus ${p.focus}/${p.maxFocus}.`,
    );
    expect(screen.getByRole('header', { name: 'Moves' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abandon run' })).toBeTruthy();
  });

  it('moves screen-reader focus to the choices after a settled turn, but not while the abandon confirmation is open', async () => {
    mockAnimations();
    const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    const { session } = sessionInBattle(LONG);
    await renderBattle(session);
    focus.mockClear();
    await fireEvent.press(enabledChoices()[0]!);
    await flush();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0]![1]).toBe('focus');

  });

  it('leaves screen-reader focus alone while the abandon confirmation is open', async () => {
    mockAnimations();
    const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    const { session } = sessionInBattle(LONG);
    await renderBattle(session, { confirming: true });
    expect(screen.queryByTestId('abandon')).toBeNull();
    focus.mockClear();
    await fireEvent.press(enabledChoices()[0]!);
    await flush();
    expect(battleOf(session.getSnapshot().run).turn).toBeGreaterThan(0);
    expect(focus).not.toHaveBeenCalled();
  });
});
