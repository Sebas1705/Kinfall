// Adaptive layouts and accessibility of every run screen: the compact battle (choices pinned at
// the bottom), two panes on wide windows, the abandon confirmation shown where its trigger was, and
// a sweep that every touchable element has a role, a name, its state and a 48dp target.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
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
const textOf = (e: El): string => (e.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

/** Every touchable must be named, have a role and state, and offer at least 48dp both ways. */
function expectAccessibleTouchables() {
  const touchables = hostElements(screen.root as unknown as El).filter((e) => typeof e.props.onClick === 'function' || typeof e.props.onResponderRelease === 'function');
  expect(touchables.length).toBeGreaterThan(0);
  for (const e of touchables) {
    const id = String(e.props.testID ?? textOf(e));
    expect([id, e.props.accessibilityRole]).toEqual([id, expect.stringMatching(/^(button|radio|link)$/)]);
    const name = (e.props.accessibilityLabel as string | undefined) ?? textOf(e);
    expect([id, name.trim().length > 0]).toEqual([id, true]);
    const style = flat(e.props.style);
    expect([id, Number(style.minHeight ?? style.height ?? 0) >= 48]).toEqual([id, true]);
    if (e.props.accessibilityRole === 'radio') expect(e.props.accessibilityState).toHaveProperty('checked');
  }
}

describe('compact battle (large text on a small phone)', () => {
  it('pins the choices and Abandon at the bottom, with compact HUDs and 48dp creatures', async () => {
    windowIs(SMALL_BIG_TEXT);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    const footer = screen.getByTestId('battle-footer');
    expect(within(footer).getByTestId('battle-choices')).toBeTruthy();
    expect(within(footer).getAllByTestId('battle-choice').length).toBeGreaterThan(0);
    expect(within(footer).getByTestId('abandon')).toBeTruthy();
    // The scene stays in the scrolling part, above the footer.
    expect(within(screen.getByTestId('run-battle')).getByTestId('hud-enemy')).toBeTruthy();
    expect(within(screen.getByTestId('run-battle')).queryByTestId('battle-choices')).toBeNull();
    // Creatures at scale 2 (48dp) and HP and focus on one line.
    expect(screen.getAllByTestId(/^sprite-.*-2$/, { includeHiddenElements: true }).length).toBe(2);
    const hpLine = screen.getByTestId('hud-player-hp');
    expect(screen.getByTestId('hud-player-focus')).toBeTruthy();
    // Nested in one line of text (no own style), not a separate row per value.
    expect(hpLine.props.style).toBeUndefined();
  });

  it('opens the abandon confirmation in the footer, in place of the button', async () => {
    windowIs(SMALL_BIG_TEXT);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    await fireEvent.press(screen.getByTestId('abandon'));
    const footer = screen.getByTestId('battle-footer');
    expect(within(footer).getByTestId('abandon-confirm')).toBeTruthy();
    expect(screen.queryByTestId('abandon')).toBeNull();
    // Android back closes it again.
    await pressBack();
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    expect(within(screen.getByTestId('battle-footer')).getByTestId('abandon')).toBeTruthy();
  });

  it('still plays a turn from the pinned choices', async () => {
    windowIs(SMALL_BIG_TEXT);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    const before = session.getSnapshot().run;
    await fireEvent.press(within(screen.getByTestId('battle-footer')).getAllByTestId('battle-choice')[0]!);
    await flush();
    expect(session.getSnapshot().run).not.toBe(before);
  });
});

describe('stacked battle (a phone at normal text size)', () => {
  it('keeps one scrolling column with no footer, and the confirmation where Abandon was', async () => {
    windowIs(PHONE);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    expect(screen.queryByTestId('battle-footer')).toBeNull();
    expect(screen.queryByTestId('battle-two-pane')).toBeNull();
    expect(screen.getAllByTestId(/^sprite-.*-4$/, { includeHiddenElements: true }).length).toBe(2);
    await fireEvent.press(screen.getByTestId('abandon'));
    expect(within(screen.getByTestId('battle-actions')).getByTestId('abandon-confirm')).toBeTruthy();
  });
});

describe('two panes', () => {
  it('battle on a tablet: the scene on the left, the choices on the right', async () => {
    windowIs(TABLET);
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    const panes = screen.getByTestId('battle-two-pane');
    expect(within(panes).getByTestId('hud-enemy')).toBeTruthy();
    expect(within(panes).getByTestId('battle-choices')).toBeTruthy();
    expect(screen.queryByTestId('battle-footer')).toBeNull();
  });

  it('battle on a landscape phone uses two panes too (even at 200% text, never the footer)', async () => {
    windowIs({ ...LANDSCAPE, fontScale: 2 });
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    expect(screen.getByTestId('battle-two-pane')).toBeTruthy();
    expect(screen.queryByTestId('battle-footer')).toBeNull();
  });

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
