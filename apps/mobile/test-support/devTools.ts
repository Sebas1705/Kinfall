import { expect } from '@jest/globals';
import { screen, userEvent, waitFor } from '@testing-library/react-native';

/**
 * The app opens on the game hub: presses Play there (Kinfall is focused first) and waits for the title.
 * Does nothing when the title is already showing (reached, or rendered on its own).
 */
export async function playFromHub(user: ReturnType<typeof userEvent.setup> = userEvent.setup()): Promise<void> {
  // Whichever shows first: the hub (the app) or the title (rendered on its own, or already reached).
  await waitFor(() => expect(screen.queryByTestId('hub-play') ?? screen.queryByTestId('title-screen')).not.toBeNull());
  const play = screen.queryByTestId('hub-play');
  if (play) {
    await user.press(play);
    await screen.findByTestId('title-screen');
  }
}

/** On the title screen, opens the "New run options" sheet (seed field, saves note, dev link). */
export async function openTitleOptions(user: ReturnType<typeof userEvent.setup> = userEvent.setup()): Promise<void> {
  await playFromHub(user);
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
