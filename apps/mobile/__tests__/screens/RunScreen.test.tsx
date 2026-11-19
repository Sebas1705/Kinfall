import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
import { nodeTypeLabel, setLang, t } from '@kinfall/core/platform/i18n';
import { serializeRun } from '@kinfall/core/sim/run/codec';
import { availableNodes, maxHpOf } from '@kinfall/core/sim/run/run';
import type { RunState } from '@kinfall/core/sim/run/types';
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

  it('applies a battle pick: saves, then shows the battle named after the node, without the run log', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const session = makeSession(storage);
    session.start(SEED, STARTER);
    await renderRun(session);
    const node = availableNodes(session.getSnapshot().run!)[0]!;
    expect(node.type).toBe('wild');
    await user.press(screen.getByTestId(`node-${node.id}`));
    expect(screen.getByTestId('battle-screen')).toBeTruthy();
    expect(screen.getByTestId('battle-heading').props.children).toBe(nodeTypeLabel(node.type));
    expect(screen.queryByTestId('map-screen')).toBeNull();
    // The battle has its own log; the run log line of the pick waits for the next phase.
    expect(screen.queryByTestId('run-log')).toBeNull();
    expect(session.getSnapshot().logFresh).toBe(1);
    await session.whenIdle();
    expect(storage.writes).toHaveLength(2);
    expect(storage.data.get(RUN_KEY)).toBe(serializeRun(session.getSnapshot().run!));
  });

  it('applies an event pick: saves, then shows the event screen with a fresh log line', async () => {
    const user = userEvent.setup();
    const start = freshRun(SEED);
    const map = start.maps[0]!;
    const byId = new Map(map.layers.flat().map((n) => [n.id, n]));
    // A step-1 node with a non-battle successor: stand on it, then pick that successor.
    const at = map.layers[0]!.find((n) => n.next.some((id) => !['wild', 'elite', 'boss'].includes(byId.get(id)!.type)))!;
    expect(at).toBeTruthy();
    const node = byId.get(at.next.find((id) => !['wild', 'elite', 'boss'].includes(byId.get(id)!.type))!)!;
    const storage = memoryStorage();
    const session = await resumed({ ...start, at: at.id, stats: { ...start.stats, nodesCleared: 1 } }, storage);
    await renderRun(session);
    await user.press(screen.getByTestId(`node-${node.id}`));
    expect(screen.getByTestId('event-screen')).toBeTruthy();
    expect(screen.getByTestId('event-heading').props.children).toBe(t(`event.${node.type as 'shrine' | 'cache' | 'mystery'}.title`));
    expect(screen.queryByTestId('map-screen')).toBeNull();
    // No back or abandon button on an event (matching the web); Android back still asks.
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
    expect(screen.queryByTestId('abandon')).toBeNull();
    const fresh = screen.getByTestId('run-log-fresh');
    expect(fresh.props.accessibilityLiveRegion).toBe('polite');
    expect(within(fresh).getByText(`You head to: ${nodeTypeLabel(node.type)}.`)).toBeTruthy();
    await session.whenIdle();
    expect(storage.writes).toHaveLength(1);
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
    expect(screen.getByTestId('battle-screen')).toBeTruthy();
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

describe('event and end phases', () => {
  it('a resumed recruit save opens the recruit screen itself, without the map', async () => {
    const storage = memoryStorage();
    const first = makeSession(storage);
    // A seed whose first battle is won in one turn of the first move: the run stands on a recruit.
    first.start('FRESH1', STARTER);
    const node = availableNodes(first.getSnapshot().run!)[0]!;
    first.pickNode(node.id);
    expect(first.act({ type: 'battle', action: { type: 'move', moveIndex: 0 } }).ok).toBe(true);
    expect(first.getSnapshot().run!.phase.kind).toBe('recruit');
    await first.whenIdle();

    const session = makeSession(storage);
    expect(await session.resume()).toBe(true);
    await renderRun(session);
    expect(screen.getByTestId('run-event')).toBeTruthy();
    expect(screen.getByTestId('event-heading').props.children).toBe('A creature wants to join');
    expect(screen.queryByTestId('map-screen')).toBeNull();
    // Nothing is fresh after a resume: the log is empty, so no panel.
    expect(screen.queryByTestId('run-log')).toBeNull();
  });

  it('an ended run shows the end screen', async () => {
    const session = await resumed({ ...freshRun(SEED), phase: { kind: 'ended', result: 'lost' } });
    await renderRun(session);
    expect(screen.getByTestId('end-heading').props.children).toBe('Run lost');
    expect(session.getSnapshot().view).toBe('end');
  });

  it('a new phase starts scrolled to the top', async () => {
    const scrollTo = jest.fn();
    const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
    jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo').mockImplementation(scrollTo);
    const user = userEvent.setup();
    const start = freshRun(SEED);
    const map = start.maps[0]!;
    const byId = new Map(map.layers.flat().map((n) => [n.id, n]));
    const at = map.layers[0]!.find((n) => n.next.some((id) => byId.get(id)!.type === 'cache' || byId.get(id)!.type === 'shrine' || byId.get(id)!.type === 'mystery'));
    if (!at) throw new Error('the seed has no event at step 2');
    const node = byId.get(at.next.find((id) => ['cache', 'shrine', 'mystery'].includes(byId.get(id)!.type))!)!;
    const session = await resumed({ ...start, at: at.id, stats: { ...start.stats, nodesCleared: 1 } });
    await renderRun(session);
    scrollTo.mockClear();
    await user.press(screen.getByTestId(`node-${node.id}`));
    expect(screen.getByTestId('event-screen')).toBeTruthy();
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });
});

describe('screen without a run', () => {
  it('renders an empty screen instead of crashing', async () => {
    await renderRun(makeSession(memoryStorage()));
    expect(screen.getByTestId('run-screen-empty')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('map-screen')).toBeNull());
  });
});
