import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { CONTENT } from '@webgames/core/content';
import { lookup } from '@webgames/core/content/lookup';
import { setLang, speciesName } from '@webgames/core/platform/i18n';
import { serializeRun } from '@webgames/core/sim/run/codec';
import { maxHpOf } from '@webgames/core/sim/run/run';
import type { RunState } from '@webgames/core/sim/run/types';
import { AccessibilityInfo, BackHandler, Dimensions } from 'react-native';

import { sampleRun, type SampleKind } from '../../src/dev/sampleRuns';
import type { RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { EventView } from '../../src/screens/EventView';
import { RunScreen } from '../../src/screens/RunScreen';
import { doubleTap } from '../../test-support/press';
import { makeSession, memoryStorage, RUN_KEY, type MemoryStorage } from '../../test-support/runFixtures';

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];

const name = (id: string) => speciesName(lookup(CONTENT).species(id));

let backHandlers: BackFn[];

beforeEach(() => {
  setLang('en');
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
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

/** A session resumed from a saved sample: the event screen comes back exactly as it was saved. */
async function resumedSample(kind: SampleKind, storage: MemoryStorage = memoryStorage()): Promise<{ session: RunSession; storage: MemoryStorage; run: RunState }> {
  const run = sampleRun(kind, CONTENT);
  storage.data.set(RUN_KEY, serializeRun(run));
  const session = makeSession(storage);
  if (!(await session.resume())) throw new Error(`sample ${kind} did not load`);
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

/** Visible text of the choices, in order. */
function choiceTexts(): string[] {
  return within(screen.getByTestId('event-choices'))
    .getAllByRole('button')
    .map((b) => b.props.accessibilityLabel as string);
}

/** testID of the element the last screen-reader focus request targeted. */
function focusedTestId(): string | undefined {
  const calls = jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mock.calls;
  const last = calls[calls.length - 1];
  if (!last) return undefined;
  expect(last[1]).toBe('focus');
  const target = last[0] as unknown as { props?: { testID?: string }; testID?: string; _viewConfig?: unknown };
  return target.props?.testID ?? (target as { canonical?: { currentProps?: { testID?: string } } }).canonical?.currentProps?.testID;
}

/** Applies the pick, waits for its save, and checks the slot holds the state the screen shows. */
async function expectSaved(session: RunSession, storage: MemoryStorage, writesBefore: number) {
  await session.whenIdle();
  expect(storage.writes).toHaveLength(writesBefore + 1);
  expect(storage.data.get(RUN_KEY)).toBe(serializeRun(session.getSnapshot().run!));
}

describe('recruit', () => {
  it('offers the defeated creature with its HP in text; Recruit adds it, saves and returns to the map', async () => {
    const user = userEvent.setup();
    const { session, storage, run } = await resumedSample('recruit');
    if (run.phase.kind !== 'recruit') throw new Error('not a recruit');
    const offer = run.phase.speciesId;
    await renderRun(session);
    expect(screen.getByTestId('event-heading').props.children).toBe('A creature wants to join');
    expect(screen.getByTestId('event-heading').props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('event-desc')).toHaveTextContent(`The ${name(offer)} you defeated would join you with ${run.phase.hp} HP.`);
    const card = screen.getByTestId('event-offer');
    expect(card.props.accessibilityLabel).toMatch(new RegExp(`^${name(offer)}, .+, HP ${run.phase.hp}/${maxHpOf(offer, CONTENT)}$`));
    expect(screen.getByTestId('event-offer-hp')).toHaveTextContent(`HP ${run.phase.hp}/${maxHpOf(offer, CONTENT)}`);
    expect(screen.queryByTestId('event-note')).toBeNull();
    expect(choiceTexts()).toEqual(['Recruit', 'Let it go']);
    // No abandon button on an event (as on the web); the party is shown.
    expect(screen.queryByTestId('abandon')).toBeNull();
    expect(screen.getByTestId('party')).toBeTruthy();
    // Focus on arrival: the first enabled choice.
    expect(focusedTestId()).toBe('event-choice-0');

    await user.press(screen.getByTestId('event-choice-0'));
    const after = session.getSnapshot().run!;
    expect(after.phase.kind).toBe('map');
    expect(after.party.map((m) => m.speciesId)).toEqual([run.party[0]!.speciesId, offer]);
    expect(screen.getByTestId('map-screen')).toBeTruthy();
    expect(within(screen.getByTestId('run-log-fresh')).getByText(new RegExp(name(offer)))).toBeTruthy();
    await expectSaved(session, storage, 0);
  });

  it('Let it go keeps the party and saves', async () => {
    const user = userEvent.setup();
    const { session, storage, run } = await resumedSample('recruit');
    await renderRun(session);
    await user.press(screen.getByTestId('event-choice-1'));
    expect(session.getSnapshot().run!.party).toEqual(run.party);
    expect(session.getSnapshot().view).toBe('map');
    await expectSaved(session, storage, 0);
  });

  it('with a full party: one replace entry per member with its HP, the note, and initial focus on "Let it go"', async () => {
    const user = userEvent.setup();
    const { session, storage, run } = await resumedSample('recruitFull');
    if (run.phase.kind !== 'recruit') throw new Error('not a recruit');
    await renderRun(session);
    expect(screen.getByTestId('event-note')).toHaveTextContent('Your party is full: choose who to replace, or let it go.');
    const members = run.party.map((m) => `Replace ${name(m.speciesId)}, ${name(m.speciesId)} ${m.hp}/${maxHpOf(m.speciesId, CONTENT)}`);
    expect(choiceTexts()).toEqual([...members, 'Let it go']);
    // A stray activation must never replace a member: focus starts on "Let it go".
    expect(focusedTestId()).toBe('event-choice-3');
    // Replacing the second member puts the offer in its slot.
    await user.press(screen.getByTestId('event-choice-1'));
    const party = session.getSnapshot().run!.party.map((m) => m.speciesId);
    expect(party).toEqual([run.party[0]!.speciesId, run.phase.speciesId, run.party[2]!.speciesId]);
    await expectSaved(session, storage, 0);
  });

  it('ignores a second tap before the next phase draws (one action, one save)', async () => {
    const { session, storage } = await resumedSample('recruit');
    const act1 = jest.spyOn(session, 'act');
    await renderRun(session);
    const button = screen.getByTestId('event-choice-0');
    await doubleTap(button);
    expect(act1).toHaveBeenCalledTimes(1);
    await session.whenIdle();
    expect(storage.writes).toHaveLength(1);
  });
});

describe('shrine', () => {
  it('rests, evolves or leaves; evolve shows its cost', async () => {
    const user = userEvent.setup();
    const { session, storage, run } = await resumedSample('shrine');
    await renderRun(session);
    const starter = name(run.party[0]!.speciesId);
    expect(screen.getByTestId('event-heading').props.children).toBe('A quiet shrine');
    expect(choiceTexts()).toEqual([
      'Rest, Heal half of every member’s HP',
      `Evolve ${starter}, Costs 3 souls`,
      'Leave',
    ]);
    expect(screen.getByTestId('souls')).toHaveTextContent('Souls: 5');
    await user.press(screen.getByTestId('event-choice-1'));
    const after = session.getSnapshot().run!;
    expect(after.party[0]!.speciesId).toBe(lookup(CONTENT).species(run.party[0]!.speciesId).evolvesTo);
    expect(after.souls).toBe(2);
    expect(after.phase.kind).toBe('map');
    await expectSaved(session, storage, 0);
  });

  it('disables evolve with the reason in text when souls are short; Rest and Leave still work', async () => {
    const user = userEvent.setup();
    const { session, storage, run } = await resumedSample('shrinePoor');
    await renderRun(session);
    const evolve = screen.getByTestId('event-choice-1');
    expect(evolve.props.accessibilityState).toMatchObject({ disabled: true });
    expect(within(evolve).getByText('Costs 3 souls · Not enough souls')).toBeTruthy();
    expect(evolve.props.accessibilityLabel).toBe(`Evolve ${name(run.party[0]!.speciesId)}, Costs 3 souls · Not enough souls`);
    const before = session.getSnapshot();
    await user.press(evolve);
    expect(session.getSnapshot()).toBe(before);
    expect(session.getSnapshot().view).toBe('event');
    expect(storage.writes).toHaveLength(0);
    // Focus starts on Rest, the first enabled choice.
    expect(focusedTestId()).toBe('event-choice-0');
    await user.press(screen.getByTestId('event-choice-2'));
    expect(session.getSnapshot().view).toBe('map');
    await expectSaved(session, storage, 0);
  });

  it('Rest heals and logs it', async () => {
    const user = userEvent.setup();
    const sample = sampleRun('shrinePoor', CONTENT);
    const hurt: RunState = { ...sample, party: [{ ...sample.party[0]!, hp: 1 }] };
    const storage = memoryStorage();
    storage.data.set(RUN_KEY, serializeRun(hurt));
    const session = makeSession(storage);
    expect(await session.resume()).toBe(true);
    await renderRun(session);
    await user.press(screen.getByTestId('event-choice-0'));
    expect(session.getSnapshot().run!.party[0]!.hp).toBeGreaterThan(1);
    expect(screen.getByTestId('run-log-fresh').props.accessibilityLiveRegion).toBe('polite');
  });
});

describe('cache and mystery', () => {
  it('cache: one choice that gives souls, then the map', async () => {
    const user = userEvent.setup();
    const { session, storage } = await resumedSample('cache');
    await renderRun(session);
    expect(screen.getByTestId('event-heading').props.children).toBe('A hidden cache');
    expect(choiceTexts()).toEqual(['Take the cache, +2 souls, heal a quarter of every member’s HP']);
    await user.press(screen.getByTestId('event-choice-0'));
    expect(session.getSnapshot().run!.souls).toBe(2);
    expect(session.getSnapshot().view).toBe('map');
    await expectSaved(session, storage, 0);
  });

  it('mystery: open it or leave it', async () => {
    const user = userEvent.setup();
    const { session, storage, run } = await resumedSample('mystery');
    await renderRun(session);
    expect(screen.getByTestId('event-heading').props.children).toBe('A strange glow');
    expect(choiceTexts()).toEqual(['Open it', 'Leave it']);
    await user.press(screen.getByTestId('event-choice-0'));
    const after = session.getSnapshot().run!;
    // Opening rewards souls or costs HP; either way the run moved on and something changed.
    expect(after.phase.kind === 'map' || after.phase.kind === 'ended').toBe(true);
    expect(after.souls !== run.souls || after.party[0]!.hp !== run.party[0]!.hp).toBe(true);
    await expectSaved(session, storage, 0);
  });

  it('mystery: leaving changes nothing but the phase', async () => {
    const user = userEvent.setup();
    const { session, run } = await resumedSample('mystery');
    await renderRun(session);
    await user.press(screen.getByTestId('event-choice-1'));
    const after = session.getSnapshot().run!;
    expect(after.phase.kind).toBe('map');
    expect(after.party).toEqual(run.party);
    expect(after.souls).toBe(run.souls);
  });
});

describe('event screen layout and language', () => {
  it('follows the language (Spanish texts, choices and note)', async () => {
    setLang('es');
    const { session } = await resumedSample('recruitFull');
    await renderRun(session);
    expect(screen.getByTestId('event-heading').props.children).toBe('Una criatura quiere unirse');
    expect(screen.getByTestId('event-note')).toHaveTextContent('Tu equipo está completo: elige a quién sustituir o déjala marchar.');
    expect(choiceTexts().at(-1)).toBe('Dejarla marchar');
    expect(choiceTexts()[0]).toMatch(/^Sustituir a /);
  });

  it('keeps every choice at least 48dp tall', async () => {
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean)) as { minHeight?: number };
    const { session } = await resumedSample('shrinePoor');
    await renderRun(session);
    for (const b of within(screen.getByTestId('event-choices')).getAllByRole('button')) {
      const style = typeof b.props.style === 'function' ? b.props.style({ pressed: false }) : b.props.style;
      expect(flat(style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it('at 360x640 with 200% text never truncates a text and lets the offer card wrap', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 640, scale: 2.625, fontScale: 2 });
    const { session } = await resumedSample('recruitFull');
    await renderRun(session);
    expect(choiceTexts()).toHaveLength(4);
    for (const node of within(screen.getByTestId('event-screen')).getAllByText(/./)) {
      expect(node.props.numberOfLines).toBeUndefined();
    }
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean)) as { flexWrap?: string };
    expect(flat(screen.getByTestId('event-offer').props.style).flexWrap).toBe('wrap');
  });

  it('Android back on an event asks to abandon (no silent exit)', async () => {
    const { session } = await resumedSample('cache');
    const { onExit } = await renderRun(session);
    await act(async () => {
      backHandlers[0]!({} as Parameters<BackFn>[0]);
    });
    expect(screen.getByTestId('abandon-confirm')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('does not take focus on arrival while the abandon confirmation is open', async () => {
    const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    const { session, run } = await resumedSample('cache');
    focus.mockClear();
    await render(
      <RunSessionProvider session={session}>
        <EventView run={run} confirming onToTitle={() => {}} />
      </RunSessionProvider>,
    );
    expect(screen.getByTestId('event-screen')).toBeTruthy();
    expect(focus).not.toHaveBeenCalled();
  });
});
