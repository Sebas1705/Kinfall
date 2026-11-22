import { expect } from '@jest/globals';
import { screen, userEvent, waitFor } from '@testing-library/react-native';

/** On the title screen, opens the "New run options" sheet (seed field, saves note, dev link). */
export async function openTitleOptions(user: ReturnType<typeof userEvent.setup> = userEvent.setup()): Promise<void> {
  const button = await screen.findByTestId('hud-options');
  await user.press(button);
  await screen.findByTestId('options-sheet');
}

/** Closes the options sheet again (its Close button). */
export async function closeTitleOptions(user: ReturnType<typeof userEvent.setup> = userEvent.setup()): Promise<void> {
  await user.press(screen.getByTestId('options-sheet-close'));
  // The sheet slides out before it unmounts.
  await waitFor(() => expect(screen.queryByTestId('options-sheet')).toBeNull());
}

/** From the title screen (the app's first route), opens the dev tools (hello core screen). */
export async function openDevTools(user: ReturnType<typeof userEvent.setup> = userEvent.setup()): Promise<void> {
  await openTitleOptions(user);
  await user.press(await screen.findByTestId('dev-tools'));
  await screen.findByTestId('run-button');
}
