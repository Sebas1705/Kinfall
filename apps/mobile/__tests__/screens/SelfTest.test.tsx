import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import App from '../../App';
import { openDevTools } from '../../test-support/devTools';
import SelfTest from '../../src/screens/SelfTest';

// Counts come straight from core's golden files (the ones the Node tests replay), read here
// independently of the screen, so the screen must replay every entry of them.
const GOLDEN = '../../../../packages/core/tests/golden';
const BATTLES = jest.requireActual<unknown[]>(`${GOLDEN}/battle.golden.json`).length;
const RUNS = jest.requireActual<unknown[]>(`${GOLDEN}/run.golden.json`).length;

// Wraps the real runner; when `mockFailRunAt` is a number, that run entry is reported as a mismatch.
let mockFailRunAt: number | null = null;
jest.mock('@kinfall/core/sim/selfTest', () => {
  const actual = jest.requireActual<typeof import('@kinfall/core/sim/selfTest')>('@kinfall/core/sim/selfTest');
  return {
    ...actual,
    checkRunGolden: (data: unknown, content: Parameters<typeof actual.checkRunGolden>[1]) => {
      const section = actual.checkRunGolden(data, content);
      const at = mockFailRunAt;
      if (at === null) return section;
      const checks = section.checks.map((c) =>
        c.index === at && c.expected ? { ...c, ok: false, expected: { ...c.expected, finalHash: 'ffffffffffffffff' } } : c,
      );
      return { ...section, ok: false, checks };
    },
  };
});

const textOf = (el: { props: { children?: unknown } }) => {
  const c = el.props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};

let log: jest.SpiedFunction<typeof console.log>;
beforeEach(() => {
  mockFailRunAt = null;
  log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  log.mockRestore();
  delete (globalThis as Record<string, unknown>).HermesInternal;
  jest.restoreAllMocks();
});

const selftestLogs = () =>
  log.mock.calls.map((args) => String(args[0])).filter((line) => line.startsWith('[selftest]'));

describe('SelfTest screen', () => {
  it('does not run until the button is pressed, then shows PASS with every golden entry', async () => {
    const user = userEvent.setup();
    await render(<SelfTest onBack={() => undefined} />);
    expect(screen.queryByTestId('selftest-verdict')).toBeNull();
    expect(selftestLogs()).toEqual([]);

    await user.press(screen.getByRole('button', { name: 'Run self test' }));

    const verdict = await screen.findByTestId('selftest-verdict');
    expect(textOf(verdict)).toBe('PASS');
    expect(BATTLES).toBeGreaterThanOrEqual(3);
    expect(RUNS).toBeGreaterThanOrEqual(4);
    expect(textOf(screen.getByTestId('selftest-battle-count'))).toBe(`Battle ${BATTLES}/${BATTLES}`);
    expect(textOf(screen.getByTestId('selftest-run-count'))).toBe(`Run ${RUNS}/${RUNS}`);
    expect(textOf(screen.getByTestId('selftest-elapsed'))).toMatch(/^Elapsed: \d+ ms \(battle \d+ ms, run \d+ ms\)$/);
    expect(screen.queryByTestId('selftest-mismatch')).toBeNull();
    expect(textOf(screen.getByTestId('selftest-summary'))).toBe(`PASS battle ${BATTLES}/${BATTLES} run ${RUNS}/${RUNS}`);
    expect(screen.getByRole('button', { name: 'Run again' })).toBeTruthy();

    const logs = selftestLogs();
    expect(logs[0]).toMatch(new RegExp(`^\\[selftest\\] PASS battle ${BATTLES}/${BATTLES} run ${RUNS}/${RUNS} elapsed=\\d+ms`));
    expect(logs[1]).toMatch(/^\[selftest\] engine HermesInternal: absent \| /);
  });

  it('shows the spinner and disables the button while running, then hides it', async () => {
    await render(<SelfTest onBack={() => undefined} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Run self test' }));
    });
    // The replay waits for a frame before starting, so the running state is committed first.
    expect(screen.getByTestId('selftest-running')).toBeTruthy();
    expect(screen.getByTestId('selftest-run').props.accessibilityState).toMatchObject({ disabled: true });
    await waitFor(() => expect(screen.getByTestId('selftest-verdict')).toBeTruthy());
    expect(screen.queryByTestId('selftest-running')).toBeNull();
  });

  it('shows FAIL with the first mismatch index and expected vs actual from a failing runner', async () => {
    mockFailRunAt = 2;
    const user = userEvent.setup();
    await render(<SelfTest onBack={() => undefined} />);
    await user.press(screen.getByRole('button', { name: 'Run self test' }));

    expect(textOf(await screen.findByTestId('selftest-verdict'))).toBe('FAIL');
    expect(textOf(screen.getByTestId('selftest-battle-count'))).toBe(`Battle ${BATTLES}/${BATTLES}`);
    expect(textOf(screen.getByTestId('selftest-run-count'))).toBe(`Run ${RUNS - 1}/${RUNS}`);
    expect(screen.getByText('First mismatch: run #2')).toBeTruthy();
    expect(screen.getByText(/^Expected: .*"finalHash":"ffffffffffffffff"/)).toBeTruthy();
    expect(screen.getByText(/^Actual: .*"rejected":0/)).toBeTruthy();
    expect(textOf(screen.getByTestId('selftest-summary'))).toMatch(/^FAIL .* first=run#2 /);
    expect(selftestLogs()[0]).toMatch(/^\[selftest\] FAIL .*first=run#2/);
  });

  it('renders the engine info lines, with a mocked HermesInternal', async () => {
    (globalThis as Record<string, unknown>).HermesInternal = {
      getRuntimeProperties: () => ({ 'OSS Release Version': '0.99.1', 'Bytecode Version': 98 }),
    };
    await render(<SelfTest onBack={() => undefined} />);
    expect(screen.getByText('HermesInternal: present')).toBeTruthy();
    expect(screen.getByText('Hermes version: 0.99.1 (bytecode 98)')).toBeTruthy();
    expect(screen.getByText(/^Platform: (ios|android) \S+$/)).toBeTruthy();
    expect(screen.getByText(/^React Native: \d+\.\d+\.\d+/)).toBeTruthy();
    expect(screen.getByText(/^Expo SDK: 58 \(expo 58\.\d+\.\d+\)$/)).toBeTruthy();
    expect(screen.getByText(/^Device: /)).toBeTruthy();
    expect(screen.getByText(/^typeof structuredClone: (function|undefined)$/)).toBeTruthy();
  });

  it('auto-runs on mount only when asked', async () => {
    await render(<SelfTest onBack={() => undefined} autoRun />);
    expect(textOf(await screen.findByTestId('selftest-verdict'))).toBe('PASS');
  });
});

describe('Self test wiring in App', () => {
  it('is reachable from the hello screen, runs on press and goes back', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await openDevTools(user);
    await user.press(await screen.findByRole('button', { name: 'Self test' }));
    expect(screen.getByTestId('selftest')).toBeTruthy();
    expect(screen.queryByTestId('selftest-verdict')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Run self test' }));
    expect(textOf(await screen.findByTestId('selftest-verdict'))).toBe('PASS');
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByTestId('run-button')).toBeTruthy();
  });

  it('does not auto-run without the env flag or a selftest URL', async () => {
    expect(process.env.EXPO_PUBLIC_SELFTEST_AUTORUN).toBeUndefined();
    await render(<App />);
    expect(await screen.findByTestId('title-screen')).toBeTruthy();
    // Give any stray async start a chance to show up.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('selftest')).toBeNull();
    expect(selftestLogs()).toEqual([]);
  });

  it('auto-runs on start with EXPO_PUBLIC_SELFTEST_AUTORUN=1', async () => {
    process.env.EXPO_PUBLIC_SELFTEST_AUTORUN = '1';
    try {
      await render(<App />);
      expect(textOf(await screen.findByTestId('selftest-verdict'))).toBe('PASS');
    } finally {
      delete process.env.EXPO_PUBLIC_SELFTEST_AUTORUN;
    }
  });

  it('auto-runs when opened with a selftest URL, and not again after Back and reopen', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('exp://127.0.0.1:8081/--/selftest');
    const user = userEvent.setup();
    await render(<App />);
    expect(textOf(await screen.findByTestId('selftest-verdict'))).toBe('PASS');
    expect(selftestLogs()).toHaveLength(2);

    // Back from an auto-run lands on the title (the self test was opened over it).
    await user.press(screen.getByRole('button', { name: 'Back' }));
    await openDevTools(user);
    await user.press(await screen.findByRole('button', { name: 'Self test' }));
    expect(screen.getByTestId('selftest')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('selftest-verdict')).toBeNull();
    expect(selftestLogs()).toHaveLength(2);
  });
});
