import { describe, expect, it } from '@jest/globals';
import { render, screen, userEvent } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
import { simulateRun } from '@kinfall/core/sim/run/bot';
import { hashRun } from '@kinfall/core/sim/run/codec';

import App from '../App';
import { openDevTools } from '../test-support/devTools';

// Computed straight from core, independently of the app's helper, so a resolution or wiring
// regression (wrong module, wrong starter, wrong seed) shows up as a hash mismatch.
function coreHash(seed: string): string {
  const starterId = CONTENT.starters[0];
  if (!starterId) throw new Error('no starters');
  return hashRun(simulateRun(seed, starterId, CONTENT).run);
}

describe('hello core screen', () => {
  it('shows the core run hash for the default seed golden-0', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await openDevTools();
    expect((await screen.findByLabelText('Seed')).props.value).toBe('golden-0');

    await user.press(screen.getByRole('button', { name: 'Run' }));

    const hashLine = await screen.findByText(/^Hash: /);
    const children: unknown = hashLine.props.children;
    const shown = (Array.isArray(children) ? children.join('') : String(children)).slice('Hash: '.length);
    expect(shown).toMatch(/^[0-9a-f]{16}$/);
    expect(shown).toBe(coreHash('golden-0'));
    // The stored golden replay for golden-0 with the first starter (cindermite).
    expect(shown).toBe('280338e8c541b53c');
    expect(screen.getByText('Starter: cindermite')).toBeTruthy();
    expect(screen.getByText('Result: lost')).toBeTruthy();
    expect(screen.getByText('Steps: 3')).toBeTruthy();
  });

  it('runs the seed typed in the field', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await openDevTools();
    const input = await screen.findByLabelText('Seed');
    await user.clear(input);
    await user.type(input, 'golden-1');
    await user.press(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText(`Hash: ${coreHash('golden-1')}`)).toBeTruthy();
  });
});
