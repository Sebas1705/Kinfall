// Adaptive layouts and accessibility of every run screen: the five screens in the console shell
// (fixed regions and no page scroll at 640x360 and 360x640, at text 100% and 130%; the pinned
// fallback at 200% text), the reading order, the sheets opening from their HUD buttons and giving
// the focus back, the abandon confirmation in the Settings sheet, and a sweep that every touchable
// element has a role, a name, its state and a 48dp target.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
import { effectiveTextScale, layoutSpec } from '@kinfall/core/layout/spec';
import { setLang } from '@kinfall/core/platform/i18n';
import { serializeRun } from '@kinfall/core/sim/run/codec';
import { AccessibilityInfo, BackHandler, Dimensions } from 'react-native';

import { sampleRun, type SampleKind } from '../../src/dev/sampleRuns';
import type { RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { RunScreen } from '../../src/screens/RunScreen';
import { HubScreen } from '../../src/screens/HubScreen';
import { TitleScreen } from '../../src/screens/TitleScreen';
import { flush, mockAnimations, sessionInBattle } from '../../test-support/battleFixtures';
import { makeSession, memoryStorage, RUN_KEY, STARTER } from '../../test-support/runFixtures';

// Counts the stage directors made: one per mounted BattleView, so a rotation must not add one.
const mockDirectorsCreated = { count: 0 };
jest.mock('../../src/art/stageDirector', () => {
  const actual = jest.requireActual<typeof import('../../src/art/stageDirector')>('../../src/art/stageDirector');
  return {
    ...actual,
    createStageDirector: (...args: Parameters<typeof actual.createStageDirector>) => {
      mockDirectorsCreated.count++;
      return actual.createStageDirector(...args);
    },
  };
});

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];
type Win = { width: number; height: number; fontScale: number };

const SMALL_BIG_TEXT: Win = { width: 360, height: 640, fontScale: 2 };
const PHONE: Win = { width: 411, height: 914, fontScale: 1 };
const LANDSCAPE: Win = { width: 891, height: 411, fontScale: 1 };
const TABLET: Win = { width: 1280, height: 800, fontScale: 1 };

let backHandlers: BackFn[];

function windowIs(w: Win) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ ...w, scale: 2.625 });
}

beforeEach(() => {
  setLang('en');
  jest.useFakeTimers();
  mockAnimations();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(true));
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  backHandlers = [];
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

async function renderRun(session: RunSession) {
  await render(
    <RunSessionProvider session={session}>
      <RunScreen onExit={() => {}} />
    </RunSessionProvider>,
  );
  await flush();
}

async function resumedSample(kind: SampleKind): Promise<RunSession> {
  const storage = memoryStorage();
  storage.data.set(RUN_KEY, serializeRun(sampleRun(kind, CONTENT)));
  const session = makeSession(storage);
  if (!(await session.resume())) throw new Error(`sample ${kind} did not load`);
  return session;
}

async function pressBack() {
  await act(async () => {
    backHandlers[0]!({} as Parameters<BackFn>[0]);
  });
}

type El = { type: unknown; props: Record<string, unknown>; children: Array<El | string> };

/** Every host element under `root`, depth first (document order). */
function hostElements(root: El): El[] {
  const out: El[] = [];
  const walk = (e: El | string) => {
    if (typeof e === 'string') return;
    out.push(e);
    for (const c of e.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean)) as Record<string, unknown>;
/** Height (dp) of the battle stage box. */
const stageHeight = () => Number(flat(screen.getByTestId('battle-stage', { includeHiddenElements: true }).props.style).height);
const textOf = (e: El): string => (e.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

/** Every touchable must be named, have a role and state, and offer at least 48dp both ways. */
function expectAccessibleTouchables() {
  const touchables = hostElements(screen.root as unknown as El).filter((e) => typeof e.props.onClick === 'function' || typeof e.props.onResponderRelease === 'function');
  expect(touchables.length).toBeGreaterThan(0);
  for (const e of touchables) {
    const id = String(e.props.testID ?? textOf(e));
    expect([id, e.props.accessibilityRole]).toEqual([id, expect.stringMatching(/^(button|radio|link|switch)$/)]);
    const name = (e.props.accessibilityLabel as string | undefined) ?? textOf(e);
    expect([id, name.trim().length > 0]).toEqual([id, true]);
    const style = flat(e.props.style);
    expect([id, Number(style.minHeight ?? style.height ?? 0) >= 48]).toEqual([id, true]);
    if (e.props.accessibilityRole === 'radio') expect(e.props.accessibilityState).toHaveProperty('checked');
  }
}

/** The host element whose children include the element with this testID (its layout container). */
function containerOf(testID: string): El {
  const parent = hostElements(screen.root as unknown as El).find((e) => (e.children ?? []).some((c) => typeof c !== 'string' && c.props.testID === testID));
  if (!parent) throw new Error(`no container of ${testID}`);
  return parent;
}
const childIds = (e: El) => (e.children ?? []).map((c) => (typeof c === 'string' ? c : String(c.props.testID)));
const pageScrolls = () => hostElements(screen.root as unknown as El).filter((e) => e.type === 'RCTScrollView').length;
const contract = (w: Win) => layoutSpec({ width: w.width, height: w.height, textScale: effectiveTextScale(w.fontScale, 1) }, 'battle');
type Node = { parent: Node | null; props: Record<string, unknown> };
const ancestors = (node: unknown): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = [];
  for (let n = (node as Node).parent; n; n = n.parent) out.push(n.props);
  return out;
};

describe('battle in the console layout', () => {
  const landscapes: Array<[string, Win]> = [
    ['640x360', { width: 640, height: 360, fontScale: 1 }],
    ['640x360 at 130%', { width: 640, height: 360, fontScale: 1.3 }],
    ['914x411', { width: 914, height: 411, fontScale: 1 }],
    ['914x411 at 130%', { width: 914, height: 411, fontScale: 1.3 }],
  ];
  for (const [label, win] of landscapes) {
    it(`landscape ${label}: no page scroll, the choices in a rail to the right of the stage, every touchable 48dp`, async () => {
      windowIs(win);
      const { session } = sessionInBattle('MAPSEED1');
      await renderRun(session);
      expect(contract(win).mode).toBe('console');
      expect(pageScrolls()).toBe(0);
      const primary = screen.getByTestId('run-battle-primary');
      const actions = screen.getByTestId('run-battle-actions');
      expect(within(primary).getByTestId('battle-stage', { includeHiddenElements: true })).toBeTruthy();
      expect(within(actions).getByTestId('battle-choices')).toBeTruthy();
      // The rail follows the stage in one row, with the contract's width.
      const row = containerOf('run-battle-primary');
      expect(flat(row.props.style).flexDirection).toBe('row');
      expect(childIds(row)).toEqual(['run-battle-primary', 'run-battle-actions']);
      expect(flat(actions.props.style).width).toBe(contract(win).regions.actions.width);
      // The stage never outgrows the primary region.
      expect(stageHeight()).toBeLessThanOrEqual(contract(win).regions.primary.height);
      expectAccessibleTouchables();
    });
  }

  const portraits: Array<[string, Win]> = [
    ['360x640', { width: 360, height: 640, fontScale: 1 }],
    ['411x914', { width: 411, height: 914, fontScale: 1 }],
    ['360x640 at 130%', { width: 360, height: 640, fontScale: 1.3 }],
    ['411x914 at 130%', { width: 411, height: 914, fontScale: 1.3 }],
  ];
  for (const [label, win] of portraits) {
    it(`portrait ${label}: no page scroll, the choices in a band below the stage, every touchable 48dp`, async () => {
      windowIs(win);
      const { session } = sessionInBattle('MAPSEED1');
      await renderRun(session);
      expect(contract(win).mode).toBe('console');
      expect(pageScrolls()).toBe(0);
      const column = containerOf('run-battle-primary');
      expect(flat(column.props.style).flexDirection).not.toBe('row');
      expect(childIds(column)).toEqual(['run-battle-primary', 'run-battle-actions']);
      expect(flat(screen.getByTestId('run-battle-actions').props.style).height).toBe(contract(win).regions.actions.height);
      expect(within(screen.getByTestId('run-battle-actions')).getAllByTestId('battle-choice').length).toBeGreaterThan(0);
      expect(stageHeight()).toBeLessThanOrEqual(contract(win).regions.primary.height);
      expectAccessibleTouchables();
    });
  }

  for (const [label, win] of [['portrait', PHONE], ['landscape', LANDSCAPE]] as Array<[string, Win]>) {
    it(`keeps the reading order in ${label}: rival HUD, stage (hidden), your HUD, choices`, async () => {
      windowIs(win);
      const { session } = sessionInBattle('MAPSEED1');
      await renderRun(session);
      const order = hostElements(screen.root as unknown as El)
        .map((e) => e.props.testID)
        .filter((id) => id === 'hud-enemy' || id === 'battle-stage' || id === 'hud-player' || id === 'battle-choices');
      expect(order).toEqual(['hud-enemy', 'battle-stage', 'hud-player', 'battle-choices']);
      expect(screen.getByTestId('battle-stage', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
    });
  }

  it('shows the newest turn as a one-line live message, and the party and the Log and Settings buttons in the HUD', async () => {
    windowIs(PHONE);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    expect(screen.getByRole('button', { name: 'Log' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getAllByTestId(/^hud-chip-/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByTestId('battle-choice')[0]!);
    await flush();
    const live = screen.getByTestId('battle-log-fresh');
    expect(live.props.accessibilityLiveRegion).toBe('polite');
    const text = within(live).getByTestId('battle-message-text');
    expect(text.props.numberOfLines).toBe(2);
    expect(String(text.props.children).length).toBeGreaterThan(0);
  });

  it('rotating from portrait to landscape keeps the battle log lines (the same view, never remounted)', async () => {
    windowIs(PHONE);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    const directorsBefore = mockDirectorsCreated.count;
    await fireEvent.press(screen.getAllByTestId('battle-choice')[0]!);
    await flush();
    const logLines = async () => {
      await fireEvent.press(screen.getByTestId('hud-log'));
      const lines = screen.getAllByTestId('battle-log-line').map((l) => l.props.children as string);
      await fireEvent.press(screen.getByTestId('log-sheet-close'));
      return lines;
    };
    const before = await logLines();
    const message = screen.getByTestId('battle-message-text').props.children;
    expect(before.length).toBeGreaterThan(0);
    expect(flat(containerOf('run-battle-primary').props.style).flexDirection).not.toBe('row');

    windowIs(LANDSCAPE);
    await act(async () => {
      Dimensions.set({ window: { ...LANDSCAPE, scale: 2.625 }, screen: { ...LANDSCAPE, scale: 2.625 } });
    });
    await flush();
    expect(flat(containerOf('run-battle-primary').props.style).flexDirection).toBe('row');
    expect(await logLines()).toEqual(before);
    expect(screen.getByTestId('battle-message-text').props.children).toBe(message);
    // One view throughout: its stage director (made once per mount) was not made again.
    expect(mockDirectorsCreated.count).toBe(directorsBefore);
    expect(screen.getByTestId('battle-prompt')).toBeTruthy();
  });

  it('opens the full log in a sheet from the HUD Log button and closes it with the focus back on the button', async () => {
    windowIs(PHONE);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    await fireEvent.press(screen.getAllByTestId('battle-choice')[0]!);
    await flush();
    const logButton = screen.getByTestId('hud-log');
    await fireEvent.press(logButton);
    const sheet = screen.getByTestId('log-sheet');
    const lines = within(sheet).getAllByTestId('battle-log-line');
    // Every line of the turn, while the message shows them as one line of text.
    expect(lines.length).toBeGreaterThan(1);
    expect(String(screen.getByTestId('battle-message-text', { includeHiddenElements: true }).props.children)).toBe(lines.map((l) => l.props.children).join(' '));
    expect(within(sheet).getByRole('header', { name: 'Battle log' })).toBeTruthy();
    const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    focus.mockClear();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('log-sheet-close'));
    });
    expect(screen.queryByTestId('log-sheet')).toBeNull();
    // The focus target is the Log button (compared by testID: a failing matcher would print whole trees).
    const last = focus.mock.calls[focus.mock.calls.length - 1]!;
    expect([(last[0] as unknown as { props: { testID: string } }).props.testID, last[1]]).toEqual(['hud-log', 'focus']);
  });

  it('keeps the polite live message outside the part hidden from screen readers while a sheet is open', async () => {
    windowIs(PHONE);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    await fireEvent.press(screen.getAllByTestId('battle-choice')[0]!);
    await flush();
    for (const open of ['hud-log', 'hud-settings']) {
      await fireEvent.press(screen.getByTestId(open));
      const live = screen.getByTestId('battle-log-fresh', { includeHiddenElements: true });
      expect(ancestors(live).some((p) => p.importantForAccessibility === 'no-hide-descendants')).toBe(false);
      expect(ancestors(live).some((p) => p.accessibilityElementsHidden === true)).toBe(false);
      // What the sheet covers is hidden: the choices and the HUD bar.
      for (const id of ['battle-choices', 'hud-log']) {
        const node = screen.getByTestId(id, { includeHiddenElements: true });
        expect(ancestors(node).some((p) => p.importantForAccessibility === 'no-hide-descendants')).toBe(true);
      }
      await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    }
  });
});

describe('battle crossing the console and fallback boundary', () => {
  it('keeps the same BattleView when the text grows from 130% to 200% on a landscape phone', async () => {
    windowIs({ width: 640, height: 360, fontScale: 1.3 });
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    expect(contract({ width: 640, height: 360, fontScale: 1.3 }).mode).toBe('console');
    await fireEvent.press(screen.getAllByTestId('battle-choice')[0]!);
    await flush();
    const message = screen.getByTestId('battle-message-text').props.children;
    const directors = mockDirectorsCreated.count;
    const grown = { width: 640, height: 360, fontScale: 2 };
    windowIs(grown);
    await act(async () => {
      Dimensions.set({ window: { ...grown, scale: 2.625 }, screen: { ...grown, scale: 2.625 } });
    });
    await flush();
    expect(contract(grown).mode).toBe('fallback');
    expect(screen.queryByTestId('run-battle-scroll')).not.toBeNull();
    // The stage may be drawn again, the view and its log are the same.
    expect(mockDirectorsCreated.count).toBe(directors);
    expect(screen.getByTestId('battle-message-text').props.children).toBe(message);
    expect(screen.getByTestId('battle-prompt')).toBeTruthy();
  });
});

describe('fallback battle (200% text on a small phone)', () => {
  it('pins the HUD and the choices around a scrolling stage', async () => {
    windowIs(SMALL_BIG_TEXT);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    expect(contract(SMALL_BIG_TEXT).mode).toBe('fallback');
    const scroll = screen.getByTestId('run-battle-scroll');
    expect(within(scroll).getByTestId('battle-stage', { includeHiddenElements: true })).toBeTruthy();
    expect(within(scroll).getByTestId('hud-enemy')).toBeTruthy();
    // HUD and choices stay outside the scrolling part.
    expect(within(scroll).queryByTestId('battle-choices')).toBeNull();
    expect(within(scroll).queryByTestId('hud')).toBeNull();
    expect(screen.getByTestId('hud')).toBeTruthy();
    expect(screen.getAllByTestId('battle-choice').length).toBeGreaterThan(0);
    expect(screen.getByTestId('battle-log-fresh').props.accessibilityLiveRegion).toBe('polite');
  });

  it('still plays a turn from the pinned choices', async () => {
    windowIs(SMALL_BIG_TEXT);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    const before = session.getSnapshot().run;
    await fireEvent.press(screen.getAllByTestId('battle-choice')[0]!);
    await flush();
    expect(session.getSnapshot().run).not.toBe(before);
  });
});

describe('abandon from the battle', () => {
  it('scrolls inside the Settings sheet on a landscape phone, so the confirmation stays reachable', async () => {
    windowIs({ width: 640, height: 360, fontScale: 1 });
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    await fireEvent.press(screen.getByTestId('hud-settings'));
    await fireEvent.press(screen.getByTestId('abandon'));
    const body = screen.getByTestId('settings-sheet-body');
    expect(body.type).toBe('RCTScrollView');
    expect(within(body).getByTestId('abandon-confirm')).toBeTruthy();
    expect(within(body).getByTestId('abandon-confirm-yes')).toBeTruthy();
  });

  it('lives in the Settings sheet; its confirmation replaces the button there, and Back closes it', async () => {
    windowIs(PHONE);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    expect(screen.queryByTestId('abandon')).toBeNull();
    await fireEvent.press(screen.getByTestId('hud-settings'));
    await fireEvent.press(screen.getByTestId('abandon'));
    const sheet = screen.getByTestId('settings-sheet');
    expect(within(sheet).getByTestId('abandon-confirm')).toBeTruthy();
    expect(screen.queryByTestId('abandon')).toBeNull();
    await pressBack();
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    expect(within(screen.getByTestId('settings-sheet')).getByTestId('abandon')).toBeTruthy();
  });

  it('opens the Settings sheet with the confirmation when Android back asks, and answering No closes it again', async () => {
    windowIs(SMALL_BIG_TEXT);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    await pressBack();
    expect(within(screen.getByTestId('settings-sheet')).getByTestId('abandon-confirm')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('abandon-confirm-no'));
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    expect(screen.queryByTestId('settings-sheet')).toBeNull();
  });

  it('closing the Settings sheet with the confirmation open cancels it', async () => {
    windowIs(PHONE);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    await pressBack();
    expect(screen.getByTestId('abandon-confirm')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    await fireEvent.press(screen.getByTestId('hud-settings'));
    expect(within(screen.getByTestId('settings-sheet')).getByTestId('abandon')).toBeTruthy();
  });
});

describe('hub, title, map, event and end in the console layout', () => {
  type Kind = 'hub' | 'title' | 'map' | 'event' | 'end';
  /** Test id of each screen's root (the Screen's testID): its regions are `${root}-primary` and `${root}-actions`. */
  const ROOT: Record<Kind, string> = { hub: 'hub-screen', title: 'title-screen', map: 'run-map', event: 'run-event', end: 'run-end' };
  const windows: Array<[string, Win]> = [
    ['640x360', { width: 640, height: 360, fontScale: 1 }],
    ['640x360 at 130%', { width: 640, height: 360, fontScale: 1.3 }],
    ['360x640', { width: 360, height: 640, fontScale: 1 }],
    ['360x640 at 130%', { width: 360, height: 640, fontScale: 1.3 }],
  ];
  const planned = (kind: Kind, w: Win) => layoutSpec({ width: w.width, height: w.height, textScale: effectiveTextScale(w.fontScale, 1) }, kind);

  async function show(kind: Kind): Promise<RunSession> {
    if (kind === 'hub') {
      await render(<HubScreen onPlay={() => {}} />);
      await flush();
      return makeSession(memoryStorage());
    }
    if (kind === 'title') {
      const session = makeSession(memoryStorage());
      await render(
        <RunSessionProvider session={session}>
          <TitleScreen onRunReady={() => {}} randomSeed={() => 'SEED0001'} onOpenDevTools={() => {}} />
        </RunSessionProvider>,
      );
      await flush();
      return session;
    }
    if (kind === 'map') {
      const session = makeSession(memoryStorage());
      session.start('MAPSEED1', STARTER);
      await renderRun(session);
      return session;
    }
    // The heaviest event: a full-party recruit (description, offer card, note and four choices).
    const session = await resumedSample(kind === 'event' ? 'recruitFull' : 'won');
    await renderRun(session);
    return session;
  }

  for (const kind of ['hub', 'title', 'map', 'event', 'end'] as Kind[]) {
    for (const [label, win] of windows) {
      it(`${kind} at ${label}: console, no page scroll, the rail beside (landscape) or below (portrait) the primary region, every touchable 48dp`, async () => {
        windowIs(win);
        await show(kind);
        const spec = planned(kind, win);
        expect(spec.mode).toBe('console');
        expect(pageScrolls()).toBe(0);
        const root = ROOT[kind];
        const actions = screen.getByTestId(`${root}-actions`);
        const row = containerOf(`${root}-primary`);
        expect(childIds(row)).toEqual([`${root}-primary`, `${root}-actions`]);
        if (spec.orientation === 'landscape') {
          expect(flat(row.props.style).flexDirection).toBe('row');
          const wide = flat(actions.props.style).width as number;
          // The event's rail is wider than the contract's (five choices with details); never narrower.
          expect(kind === 'event' ? wide >= spec.regions.actions.width : wide === spec.regions.actions.width).toBe(true);
        } else {
          expect(flat(row.props.style).flexDirection).not.toBe('row');
          expect(flat(actions.props.style).height).toBe(spec.regions.actions.height);
        }
        expectAccessibleTouchables();
      });
    }
  }

  it('hub: the heading is shown where it fits and dropped where the cards need the room (the list keeps its name)', async () => {
    windowIs({ width: 360, height: 640, fontScale: 1 });
    await show('hub');
    expect(screen.getByTestId('hub-title')).toBeTruthy();
  });

  it('hub: a narrow phone at 150% in Spanish (three-line tagline) is a console without the heading', async () => {
    setLang('es');
    windowIs({ width: 320, height: 640, fontScale: 1.5 });
    await show('hub');
    expect(planned('hub', { width: 320, height: 640, fontScale: 1.5 }).mode).toBe('console');
    expect(screen.queryByTestId('hub-title')).toBeNull();
    expect(screen.getByTestId('hub-games').props.accessibilityLabel).toBe('Juegos');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(pageScrolls()).toBe(0);
  });

  it('hub: at 200% on a small phone it is the pinned fallback: the cards scroll in the primary area, Play stays pinned', async () => {
    windowIs(SMALL_BIG_TEXT);
    await show('hub');
    expect(planned('hub', SMALL_BIG_TEXT).mode).toBe('fallback');
    expect(screen.getByTestId('hub-screen-scroll')).toBeTruthy();
    expect(screen.getByTestId('hub-title')).toBeTruthy();
    expect(screen.getByTestId('hub-play')).toBeTruthy();
  });

  for (const [label, win] of windows) {
    it(`map at ${label}: every node is reachable, labelled and at least 48dp wide and tall, inside the primary region`, async () => {
      windowIs(win);
      const session = await show('map');
      const run = session.getSnapshot().run!;
      const total = run.maps[0]!.layers.flat().length;
      const nodes = within(screen.getByTestId('run-map-primary')).getAllByTestId(/^node-z/);
      expect(nodes).toHaveLength(total);
      expect(total).toBeLessThanOrEqual(19);
      for (const node of nodes) {
        const style = flat(node.props.style);
        expect([node.props.testID, Number(style.width) >= 48 && Number(style.minHeight) >= 48]).toEqual([node.props.testID, true]);
        expect(node.props.accessibilityLabel).toMatch(/: (available|locked|cleared)/);
        expect(node.props.accessibilityState).toHaveProperty('disabled');
      }
      // One column per layer, side by side: step 1 first and the boss last.
      expect(within(screen.getByTestId('run-map-primary')).getAllByTestId(/^layer-/)).toHaveLength(run.maps[0]!.layers.length);
    });
  }

  const orders: Array<[Kind, string[]]> = [
    ['title', ['hud-title', 'hud-options', 'hud-settings', 'app-name', 'starters', 'title-actions']],
    ['map', ['map-heading', 'hud-run', 'hud-settings', 'layer-0', 'layer-1', 'layer-6', 'map-rail']],
    ['event', ['event-heading', 'hud-run', 'hud-settings', 'event-desc', 'event-offer', 'event-note', 'event-choices']],
    ['end', ['end-heading', 'hud-run', 'hud-settings', 'end-score', 'end-new-run', 'end-to-title']],
  ];
  for (const [kind, expected] of orders) {
    for (const [label, win] of [['portrait', PHONE], ['landscape', LANDSCAPE]] as Array<[string, Win]>) {
      it(`${kind} keeps the reading order in ${label}: ${expected.join(', ')}`, async () => {
        windowIs(win);
        await show(kind);
        const wanted = new Set(expected);
        const order = hostElements(screen.root as unknown as El)
          .map((e) => e.props.testID as string | undefined)
          .filter((id): id is string => id !== undefined && wanted.has(id));
        // A testID can appear on a pressable and on its host: keep each one's first place.
        expect([...new Set(order)]).toEqual(expected);
      });
    }
  }

  const sheets: Array<[Kind, string, string]> = [
    ['title', 'hud-options', 'options-sheet'],
    ['map', 'hud-run', 'run-sheet'],
    ['event', 'hud-run', 'run-sheet'],
    ['end', 'hud-run', 'run-sheet'],
  ];
  for (const [kind, button, sheet] of sheets) {
    for (const [label, win] of windows.filter(([l]) => !l.includes('130'))) {
      it(`${kind} at ${label}: the ${sheet} opens from its HUD button and closes with the focus back on it`, async () => {
        windowIs(win);
        await show(kind);
        await fireEvent.press(screen.getByTestId(button));
        expect(screen.getByTestId(sheet)).toBeTruthy();
        expect(screen.getByTestId(`${sheet}-title`)).toBeTruthy();
        // What the sheet covers is hidden from screen readers.
        const hud = screen.getByTestId('hud', { includeHiddenElements: true });
        expect(ancestors(hud).some((p) => p.importantForAccessibility === 'no-hide-descendants')).toBe(true);
        const focus = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
        focus.mockClear();
        await act(async () => {
          await fireEvent.press(screen.getByTestId(`${sheet}-close`));
        });
        expect(screen.queryByTestId(sheet)).toBeNull();
        const last = focus.mock.calls[focus.mock.calls.length - 1]!;
        expect([(last[0] as unknown as { props: { testID: string } }).props.testID, last[1]]).toEqual([button, 'focus']);
      });
    }
  }

  for (const kind of ['title', 'map', 'event'] as Array<'title' | 'map' | 'event'>) {
    it(`${kind} at 360x640 with 200% text falls back: HUD and rail pinned, only the primary region scrolls`, async () => {
      const win = { width: 360, height: 640, fontScale: 2 };
      windowIs(win);
      await show(kind);
      expect(planned(kind, win).mode).toBe('fallback');
      const scroll = screen.getByTestId(`${ROOT[kind]}-scroll`);
      expect(within(scroll).queryByTestId('hud')).toBeNull();
      expect(screen.getByTestId('hud')).toBeTruthy();
      const rail = { title: 'title-actions', map: 'map-rail', event: 'event-choices' }[kind];
      expect(within(scroll).queryByTestId(rail, { includeHiddenElements: true })).toBeNull();
      expect(screen.getByTestId(rail, { includeHiddenElements: true })).toBeTruthy();
      expectAccessibleTouchables();
    });
  }

  it('keeps the run log live message outside the part hidden from screen readers while a sheet is open (event)', async () => {
    windowIs(PHONE);
    const session = await resumedSample('cache');
    await renderRun(session);
    // The pick moves the run on and logs lines; the map that follows keeps the live message.
    await act(async () => {
      expect(session.act({ type: 'cache' }).ok).toBe(true);
    });
    for (const open of ['hud-run', 'hud-settings']) {
      await fireEvent.press(screen.getByTestId(open));
      const live = screen.getByTestId('run-log-fresh', { includeHiddenElements: true });
      expect(live.props.accessibilityLiveRegion).toBe('polite');
      expect(ancestors(live).some((p) => p.importantForAccessibility === 'no-hide-descendants')).toBe(false);
      expect(ancestors(live).some((p) => p.accessibilityElementsHidden === true)).toBe(false);
      // The HUD behind the sheet is hidden.
      const hud = screen.getByTestId('hud', { includeHiddenElements: true });
      expect([open, ancestors(hud).some((p) => p.importantForAccessibility === 'no-hide-descendants')]).toEqual([open, true]);
      await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    }
  });
});

describe('abandon confirmation placement', () => {
  it('on the map Abandon is in the Settings sheet, and the confirmation replaces it there', async () => {
    windowIs(PHONE);
    const session = makeSession(memoryStorage());
    session.start('MAPSEED1', STARTER);
    await renderRun(session);
    expect(screen.queryByTestId('abandon')).toBeNull();
    await fireEvent.press(screen.getByTestId('hud-settings'));
    await fireEvent.press(screen.getByTestId('abandon'));
    expect(within(screen.getByTestId('settings-sheet')).getByTestId('abandon-confirm')).toBeTruthy();
    expect(screen.queryByTestId('abandon')).toBeNull();
  });

  it('on an event (opened by Android back) it opens the Settings sheet with the confirmation', async () => {
    windowIs(PHONE);
    await renderRun(await resumedSample('cache'));
    await pressBack();
    expect(within(screen.getByTestId('settings-sheet')).getByTestId('abandon-confirm')).toBeTruthy();
    // An event has no Abandon button: answering "no" closes the sheet again.
    expect(screen.queryByTestId('abandon')).toBeNull();
    await fireEvent.press(screen.getByTestId('abandon-confirm-no'));
    expect(screen.queryByTestId('settings-sheet')).toBeNull();
  });
});

describe('every touchable is named, has a role and state, and is at least 48dp', () => {
  const windows: Array<[string, Win]> = [
    ['small phone at 200%', SMALL_BIG_TEXT],
    ['tablet', TABLET],
  ];
  for (const [label, win] of windows) {
    it(`hub (${label})`, async () => {
      windowIs(win);
      await render(<HubScreen onPlay={() => {}} />);
      await flush();
      expectAccessibleTouchables();
    });

    it(`title (${label})`, async () => {
      windowIs(win);
      const session = makeSession(memoryStorage());
      await render(
        <RunSessionProvider session={session}>
          <TitleScreen onRunReady={() => {}} onOpenDevTools={() => {}} />
        </RunSessionProvider>,
      );
      await flush();
      expectAccessibleTouchables();
    });

    it(`map (${label})`, async () => {
      windowIs(win);
      const session = makeSession(memoryStorage());
      session.start('MAPSEED1', STARTER);
      await renderRun(session);
      expectAccessibleTouchables();
      // Every node names its type and state (map.nodeLabel), and locked ones are disabled.
      for (const node of screen.getAllByTestId(/^node-/)) {
        expect(node.props.accessibilityLabel).toMatch(/: /);
        expect(node.props.accessibilityState).toHaveProperty('disabled');
      }
    });

    it(`battle (${label})`, async () => {
      windowIs(win);
      const { session } = sessionInBattle('MAPSEED1');
      await renderRun(session);
      expectAccessibleTouchables();
    });

    for (const kind of ['recruitFull', 'shrinePoor', 'mystery', 'won'] as const) {
      it(`${kind} (${label})`, async () => {
        windowIs(win);
        await renderRun(await resumedSample(kind));
        expectAccessibleTouchables();
      });
    }
  }

  it('hides every creature sprite and element icon from screen readers', async () => {
    windowIs(PHONE);
    await renderRun(await resumedSample('recruit'));
    const sprites = screen.getAllByTestId(/^(sprite|element)-/, { includeHiddenElements: true });
    expect(sprites.length).toBeGreaterThan(0);
    for (const s of sprites) {
      expect(s.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(s.props.accessibilityElementsHidden).toBe(true);
    }
  });
});
