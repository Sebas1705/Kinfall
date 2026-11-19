import { afterEach, describe, expect, it } from '@jest/globals';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';
import { getLang, setLang, speciesName, t, type Lang, type StringKey } from '@kinfall/core/platform/i18n';

const HID = { hidden: true };

import App from '../../App';
import { openDevTools } from '../../test-support/devTools';
import Gallery from '../../src/screens/Gallery';

const start: Lang = getLang();
afterEach(() => act(() => setLang(start)));

describe('Gallery', () => {
  for (const lang of ['en', 'es'] as const) {
    it(`lists every species in ${lang} with its elements and three sprites`, async () => {
      setLang(lang);
      await render(<Gallery onBack={() => undefined} />);
      expect(CONTENT.species.length).toBeGreaterThan(0);
      for (const sp of CONTENT.species) {
        const card = screen.getByTestId(`gallery-${sp.id}`, HID);
        expect(within(card).getByText(speciesName(sp))).toBeTruthy();
        for (const el of sp.elements) {
          expect(within(card).getByText(t(`element.${el}` as StringKey))).toBeTruthy();
          expect(within(card).getByTestId(`element-${el}-3`, HID)).toBeTruthy();
        }
        for (const scale of [2, 3, 4]) {
          expect(within(card).getByTestId(`sprite-${sp.id}-${scale}`, HID).props.style).toMatchObject({ width: 24 * scale });
        }
      }
    });
  }

  it('is reachable from the hello screen and goes back', async () => {
    const user = userEvent.setup();
    await render(<App />);
    await openDevTools();
    await user.press(await screen.findByRole('button', { name: 'Gallery' }));
    expect(screen.getByTestId('gallery')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByTestId('run-button')).toBeTruthy();
  });
});
