import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { CONTENT } from '@webgames/core/content';
import { nodeTypeLabel, setLang } from '@webgames/core/platform/i18n';
import { serializeRun } from '@webgames/core/sim/run/codec';
import { availableNodes, maxHpOf } from '@webgames/core/sim/run/run';
import type { RunState } from '@webgames/core/sim/run/types';
import { BackHandler, Dimensions } from 'react-native';

import type { RunSession } from '../../src/run/session';
import { RunSessionProvider } from '../../src/run/useRunSession';
import { RunScreen } from '../../src/screens/RunScreen';
import { firstNode, freshRun, makeSession, memoryStorage, RUN_KEY, STARTER, type MemoryStorage } from '../../test-support/runFixtures';

type BackFn = Parameters<typeof BackHandler.addEventListener>[1];
/** Calls a back handler the way BackHandler does (the event carries nothing we read). */
const fire = (h: BackFn) => h({} as Parameters<BackFn>[0]);

const SEED = 'MAPSEED1';

async function renderRun(session: RunSession) {
  const onExit = jest.fn();
  await render(
    <RunSessionProvider session={session}>
      <RunScreen onExit={onExit} />
    </RunSessionProvider>,
  );
  return { onExit };
}

/** A session resumed from `run` saved in a memory storage. */
async function resumed(run: RunState, storage: MemoryStorage = memoryStorage()): Promise<RunSession> {
  storage.data.set(RUN_KEY, serializeRun(run));
  const session = makeSession(storage);
  if (!(await session.resume())) throw new Error('crafted save did not load');
  return session;
}

function nodeButtons(layer: number) {
  return within(screen.getByTestId(`layer-${layer}`)).getAllByRole('button');
}

let backHandlers: BackFn[];

beforeEach(() => {
  setLang('en');
  backHandlers = [];
  const real = BackHandler.addEventListener.bind(BackHandler);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((name, handler) => {
    backHandlers.push(handler);
    const sub = real(name, handler);
    return {
      remove: () => {
        backHandlers = backHandlers.filter((h) => h !== handler);
        sub.remove();
      },
    };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('map screen', () => {
  it('stacks the zone layers top to bottom, step 1 first and the boss alone last', async () => {
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    await renderRun(session);
    expect(screen.getByTestId('map-heading').props.children).toBe('Zone 1: Ashen Marsh');
    const map = session.getSnapshot().run!.maps[0]!;
    const steps = screen.getAllByText(/^Step \d+$/).map((n) => n.props.children);
    expect(steps).toEqual(map.layers.map((_, i) => `Step ${i + 1}`));
    const last = map.layers.length - 1;
    expect(nodeButtons(last)).toHaveLength(1);
    expect(nodeButtons(last)[0]!.props.accessibilityLabel).toMatch(/^Boss: /);
    for (let l = 0; l < last; l++) {
      for (const b of nodeButtons(l)) expect(b.props.accessibilityLabel).not.toMatch(/^Boss/);
    }
  });

  it('names each node by type and state in text; only available nodes are enabled', async () => {
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    await renderRun(session);
    const run = session.getSnapshot().run!;
    const open = new Set(availableNodes(run).map((n) => n.id));
    for (const node of run.maps[0]!.layers.flat()) {
      const button = screen.getByTestId(`node-${node.id}`);
      const state = open.has(node.id) ? 'available' : 'locked';
      expect(button.props.accessibilityLabel).toBe(`${nodeTypeLabel(node.type)}: ${state}`);
      expect(button.props.accessibilityState).toMatchObject({ disabled: !open.has(node.id) });
      // The type and state are visible text, not only colour.
      expect(within(button).getByText(nodeTypeLabel(node.type))).toBeTruthy();
      expect(within(button).getByText(state)).toBeTruthy();
    }
  });

  it('marks the current node in text and the cleared path as cleared', async () => {
    const start = freshRun(SEED);
    const at = firstNode(start);
    // A run that cleared one step-1 node (validation wants the matching node count).
    const session = await resumed({ ...start, at, stats: { ...start.stats, nodesCleared: 1 } });
    await renderRun(session);
    const current = screen.getByTestId(`node-${at}`);
    expect(current.props.accessibilityLabel).toMatch(/: cleared, you are here$/);
    expect(current.props.accessibilityState).toMatchObject({ disabled: true, selected: true });
    expect(within(current).getByText('cleared, you are here')).toBeTruthy();
    // Successors of the current node are now the available ones.
    const next = start.maps[0]!.layers[0]!.find((n) => n.id === at)!.next;
    for (const id of next) expect(screen.getByTestId(`node-${id}`).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('shows the party with sprite, name and HP as text, and the souls', async () => {
    const session = makeSession(memoryStorage());
    session.start(SEED, 'tidewisp');
    await renderRun(session);
    const max = maxHpOf('tidewisp', CONTENT);
    expect(screen.getByTestId('party-member-0').props.accessibilityLabel).toBe(`Tidewisp ${max}/${max}`);
    expect(screen.getByTestId('party-hp-0').props.children).toBe(`${max}/${max}`);
    expect(screen.getByTestId('sprite-tidewisp-2', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('souls')).toHaveTextContent('Souls: 0');
  });

  it('applies a pick: saves, then shows the placeholder named after the node with a fresh log line', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    await renderRun(session);
    const node = availableNodes(session.getSnapshot().run!)[0]!;
    await user.press(screen.getByTestId(`node-${node.id}`));
    expect(screen.getByTestId('phase-placeholder')).toBeTruthy();
    expect(screen.getByTestId('placeholder-heading').props.children).toBe(nodeTypeLabel(node.type));
    expect(screen.queryByTestId('map-screen')).toBeNull();
    // No back button on the placeholder (matching the web).
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
    const fresh = screen.getByTestId('run-log-fresh');
    expect(fresh.props.accessibilityLiveRegion).toBe('polite');
    expect(within(fresh).getByText(`You head to: ${nodeTypeLabel(node.type)}.`)).toBeTruthy();
    await session.whenIdle();
    expect(storage.writes).toHaveLength(2);
    expect(storage.data.get(RUN_KEY)).toBe(serializeRun(session.getSnapshot().run!));
  });

  it('ignores presses on locked nodes', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    await renderRun(session);
    const before = session.getSnapshot();
    await user.press(nodeButtons(1)[0]!);
    expect(session.getSnapshot()).toBe(before);
    expect(screen.getByTestId('map-screen')).toBeTruthy();
  });

  it('abandons only after the inline two-step confirmation', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    const { onExit } = await renderRun(session);
    await user.press(screen.getByTestId('abandon'));
    expect(screen.getByText('Abandon this run? Your save will be deleted.')).toBeTruthy();
    expect(screen.queryByTestId('abandon')).toBeNull();
    await user.press(screen.getByTestId('abandon-confirm-no'));
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    expect(session.getSnapshot().run).not.toBeNull();

    await user.press(screen.getByTestId('abandon'));
    await user.press(screen.getByTestId('abandon-confirm-yes'));
    expect(onExit).toHaveBeenCalledTimes(1);
    await session.whenIdle();
    expect(session.getSnapshot().run).toBeNull();
    expect(storage.data.has(RUN_KEY)).toBe(false);
  });

  it('asks the abandon confirmation on Android back instead of leaving, and a second back closes it', async () => {
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    const { onExit } = await renderRun(session);
    expect(backHandlers).toHaveLength(1);
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = fire(backHandlers[0]!);
    });
    expect(handled).toBe(true);
    expect(screen.getByTestId('abandon-confirm')).toBeTruthy();
    await act(async () => {
      handled = fire(backHandlers[0]!);
    });
    expect(handled).toBe(true);
    expect(screen.queryByTestId('abandon-confirm')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    expect(session.getSnapshot().run).not.toBeNull();
  });

  it('shows a dismissible save warning when saving fails, and play continues', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    storage.failNext = [new Error('disk full.')];
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    await renderRun(session);
    expect(await screen.findByText('Could not save your run: disk full. You can keep playing.')).toBeTruthy();
    await user.press(screen.getByTestId('save-warning-dismiss'));
    expect(screen.queryByTestId('save-warning')).toBeNull();
    await user.press(screen.getByTestId(`node-${firstNode(session.getSnapshot().run!)}`));
    expect(screen.getByTestId('phase-placeholder')).toBeTruthy();
  });

  it('widens node buttons with the font scale (one per row at 200% on a phone, never broken words)', async () => {
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean)) as { flexBasis?: number; minHeight?: number };
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    const id = `node-${firstNode(session.getSnapshot().run!)}`;
    // useWindowDimensions reads Dimensions.get('window') (the Jest default has fontScale 2).
    const dims = jest.spyOn(Dimensions, 'get');
    dims.mockReturnValue({ width: 411, height: 914, scale: 2.625, fontScale: 1 });
    await renderRun(session);
    const at1 = flat(screen.getByTestId(id).props.style);
    expect(at1.flexBasis).toBe(140);
    expect(at1.minHeight).toBeGreaterThanOrEqual(48);

    dims.mockReturnValue({ width: 360, height: 640, scale: 2.625, fontScale: 2 });
    await renderRun(session);
    expect(dims).toHaveBeenCalled();
    // 280dp + 280dp + gap > 328dp of content width at 360dp: one node per row.
    expect(flat(screen.getByTestId(id).props.style).flexBasis).toBe(280);
  });

  it('follows the language', async () => {
    const session = makeSession(memoryStorage());
    session.start(SEED, STARTER);
    setLang('es');
    await renderRun(session);
    expect(screen.getByTestId('map-heading').props.children).toBe('Zona 1: Marjal de Ceniza');
    expect(screen.getByText('Paso 1')).toBeTruthy();
    expect(screen.getByText('Abandonar partida')).toBeTruthy();
  });
});

describe('placeholder phases', () => {
  it('a resumed non-map save shows the same placeholder, without the map', async () => {
    const storage = memoryStorage();
    const first = makeSession(storage);
    first.start(SEED, STARTER);
    const node = availableNodes(first.getSnapshot().run!)[0]!;
    first.pickNode(node.id);
    await first.whenIdle();

    const session = makeSession(storage);
    expect(await session.resume()).toBe(true);
    await renderRun(session);
    expect(screen.getByTestId('placeholder-heading').props.children).toBe(nodeTypeLabel(node.type));
    expect(screen.getByText('Coming soon: this part of the run is not playable in the app yet.')).toBeTruthy();
    expect(screen.queryByTestId('map-screen')).toBeNull();
    // Nothing is fresh after a resume: the log is empty, so no panel.
    expect(screen.queryByTestId('run-log')).toBeNull();
  });

  it('names an ended run "Run over"', async () => {
    const session = await resumed({ ...freshRun(SEED), phase: { kind: 'ended', result: 'lost' } });
    await renderRun(session);
    expect(screen.getByTestId('placeholder-heading').props.children).toBe('Run over');
    expect(session.getSnapshot().view).toBe('end');
  });
});

describe('screen without a run', () => {
  it('renders an empty screen instead of crashing', async () => {
    await renderRun(makeSession(memoryStorage()));
    expect(screen.getByTestId('run-screen-empty')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('map-screen')).toBeNull());
  });
});
