// Adaptive layouts and accessibility of every run screen: the battle in the console shell (stage,
// message line and a choice rail or band, the pinned fallback at 200% text), two panes on wide
// windows, the abandon confirmation shown where its trigger was, and a sweep that every touchable
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

describe('two panes', () => {
  it('map on a landscape phone: party and log beside the map; the confirmation where Abandon was', async () => {
    windowIs(LANDSCAPE);
    const session = makeSession(memoryStorage());
    session.start('MAPSEED1', STARTER);
    await renderRun(session);
    const panes = screen.getByTestId('map-two-pane');
    expect(within(panes).getByTestId('party')).toBeTruthy();
    expect(within(panes).getByTestId('layer-0')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('abandon'));
    expect(within(panes).getByTestId('abandon-confirm')).toBeTruthy();
  });

  it('event on a tablet: the party in the side pane', async () => {
    windowIs(TABLET);
    await renderRun(await resumedSample('recruit'));
    expect(within(screen.getByTestId('event-side')).getByTestId('party')).toBeTruthy();
    expect(within(screen.getByTestId('event-side')).queryByTestId('event-choices')).toBeNull();
  });

  it('title on a landscape phone: the starters and New run in the right pane', async () => {
    windowIs(LANDSCAPE);
    const session = makeSession(memoryStorage());
    await render(
      <RunSessionProvider session={session}>
        <TitleScreen onRunReady={() => {}} randomSeed={() => 'SEED0001'} />
      </RunSessionProvider>,
    );
    await flush();
    const panes = screen.getByTestId('title-two-pane');
    expect(within(panes).getByTestId('new-run')).toBeTruthy();
    expect(within(panes).getByTestId('continue')).toBeTruthy();
  });

  it('phones in portrait keep one column', async () => {
    windowIs(PHONE);
    const session = makeSession(memoryStorage());
    session.start('MAPSEED1', STARTER);
    await renderRun(session);
    expect(screen.queryByTestId('map-two-pane')).toBeNull();
  });
});

describe('abandon confirmation placement', () => {
  it('on the map it replaces the Abandon button inside the map, before the run log', async () => {
    windowIs(PHONE);
    const session = makeSession(memoryStorage());
    session.start('MAPSEED1', STARTER);
    await renderRun(session);
    await fireEvent.press(screen.getByTestId('abandon'));
    expect(within(screen.getByTestId('map-screen')).getByTestId('abandon-confirm')).toBeTruthy();
  });

  it('on an event (opened by Android back) it shows right after the choices', async () => {
    windowIs(PHONE);
    await renderRun(await resumedSample('cache'));
    await pressBack();
    const order = hostElements(screen.root as unknown as El)
      .map((e) => e.props.testID)
      .filter((id) => id === 'event-choices' || id === 'abandon-confirm' || id === 'party');
    expect(order).toEqual(['event-choices', 'abandon-confirm', 'party']);
  });
});

describe('every touchable is named, has a role and state, and is at least 48dp', () => {
  const windows: Array<[string, Win]> = [
    ['small phone at 200%', SMALL_BIG_TEXT],
    ['tablet', TABLET],
  ];
  for (const [label, win] of windows) {
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
