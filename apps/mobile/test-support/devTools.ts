import { screen, userEvent } from '@testing-library/react-native';

/** From the title screen (the app's first route), opens the dev tools (hello core screen). */
export async function openDevTools(user: ReturnType<typeof userEvent.setup> = userEvent.setup()): Promise<void> {
  await user.press(await screen.findByTestId('dev-tools'));
  await screen.findByTestId('run-button');
}
