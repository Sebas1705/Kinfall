// The scene art on every screen: decorative canvases are hidden from screen readers and never
// focusable, the logo is the one labelled image, the text the art illustrates is still there, and
// reduced motion (system or the app switch) settles battle turns at once.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { iconForNodeType } from '@kinfall/core/art/scene';
import { CONTENT } from '@kinfall/core/content';
import { buildMapModel } from '@kinfall/core/models/map';
import { setLang } from '@kinfall/core/platform/i18n';
import { serializeRun } from '@kinfall/core/sim/run/codec';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { sampleRun, type SampleKind } from '../../src/dev/sampleRuns';
import { resetMotionSettingForTests, setAppReduceMotion } from '../../src/platform/motionSetting';
import type { RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { RunScreen } from '../../src/screens/RunScreen';
import { TitleScreen } from '../../src/screens/TitleScreen';
import { flush, mockAnimations, sessionInBattle } from '../../test-support/battleFixtures';
import { makeSession, memoryStorage, RUN_KEY } from '../../test-support/runFixtures';

const HID = { includeHiddenElements: true };

type El = { props: Record<string, unknown>; children?: Array<El | string> };
function descendants(root: El): El[] {
  const out: El[] = [];
  const walk = (e: El | string) => {
    if (typeof e === 'string') return;
    out.push(e);
    for (const c of e.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

/** A decorative art box: hidden on both platforms, not touchable, nothing focusable inside. */
function expectDecorative(testID: string) {
  const box = screen.getByTestId(testID, HID) as unknown as El;
  expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(box.props.accessibilityElementsHidden).toBe(true);
  expect(box.props.pointerEvents).toBe('none');
  for (const e of descendants(box)) {
    expect(e.props.accessible === true || typeof e.props.onClick === 'function').toBe(false);
  }
  // Not reachable as an accessibility element.
  expect(screen.queryByTestId(testID)).toBeNull();
}

beforeEach(() => {
  setLang('en');
  resetMotionSettingForTests();
  mockAnimations();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(false));
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: () => {} }));
});
afterEach(() => {
  resetMotionSettingForTests();
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

async function resumed(kind: SampleKind): Promise<RunSession> {
  const storage = memoryStorage();
  storage.data.set(RUN_KEY, serializeRun(sampleRun(kind, CONTENT)));
  const session = makeSession(storage);
  if (!(await session.resume())) throw new Error(`sample ${kind} did not load`);
  return session;
}

describe('title art', () => {
  it('shows the hero scene hidden and the wordmark as the image "Kinfall", in both languages', async () => {
    const renderTitle = () =>
      render(
        <RunSessionProvider session={makeSession(memoryStorage())}>
          <TitleScreen onRunReady={() => {}} />
        </RunSessionProvider>,
      );
    await renderTitle();
    expectDecorative('title-scene');
    expect(screen.getByRole('image', { name: 'Kinfall' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Start' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeTruthy();
    setLang('es');
    await renderTitle();
    expect(screen.getByRole('image', { name: 'Kinfall' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Inicio' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Reducir movimiento' })).toBeTruthy();
  });
});

describe('map art', () => {
  it('has a hidden zone banner and a pixel icon of the right type on every node, which keeps its name', async () => {
    const session = makeSession(memoryStorage());
    session.start('MAPSEED1', CONTENT.starters[0]!);
    await renderRun(session);
    expectDecorative('map-banner');
    const run = session.getSnapshot().run!;
    const model = buildMapModel(run, CONTENT, session.getSnapshot().trail);
    for (const layer of model.layers) {
      for (const node of layer.nodes) {
        const button = screen.getByTestId(`node-${node.id}`);
        expect(within(button).getByTestId(`map-icon-${node.type}`, HID).props.importantForAccessibility).toBe('no-hide-descendants');
        expect(iconForNodeType(node.type)).toBeTruthy();
        expect(button.props.accessibilityLabel).toContain(node.label);
      }
    }
  });
});

describe('battle art', () => {
  it('stages the battle on a hidden canvas between the two HUD plates, which keep their summaries', async () => {
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    expectDecorative('battle-stage');
    expect(screen.getByTestId('hud-enemy').props.accessibilityLabel).toMatch(/^Rival: /);
    expect(screen.getByTestId('hud-player').props.accessibilityLabel).toMatch(/^You: /);
    // Reading order: rival HUD, (stage hidden), your HUD, then the choices.
    const order = descendants(screen.root as unknown as El)
      .map((e) => e.props.testID)
      .filter((id): id is string => id === 'hud-enemy' || id === 'battle-stage' || id === 'hud-player' || id === 'battle-choices');
    expect(order).toEqual(['hud-enemy', 'battle-stage', 'hud-player', 'battle-choices']);
  });

  it('with the app switch on, a turn settles at once (no animation runs)', async () => {
    setAppReduceMotion(true);
    const anims = mockAnimations();
    const { session } = sessionInBattle('MAPSEED1');
    await renderRun(session);
    const before = session.getSnapshot().run;
    await fireEvent.press(screen.getAllByTestId('battle-choice')[0]!);
    await flush();
    expect(session.getSnapshot().run).not.toBe(before);
    expect(anims.started).toHaveLength(0);
  });
});

describe('event art', () => {
  it.each(['recruit', 'shrine', 'cache', 'mystery'] as const)('%s shows a hidden vignette above its text and choices', async (kind) => {
    const session = await resumed(kind);
    await renderRun(session);
    expectDecorative('event-vignette');
    expect(screen.getByTestId('event-heading')).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});

describe('end art', () => {
  it.each([
    ['won', 'Run won'],
    ['lost', 'Run lost'],
  ] as const)('%s: a hidden flourish scene, the result still in text', async (kind, title) => {
    const session = await resumed(kind);
    await renderRun(session);
    expectDecorative('end-scene');
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
  });
});
