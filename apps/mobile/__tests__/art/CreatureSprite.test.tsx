import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { CONTENT } from '@kinfall/core/content';

import { CreatureSprite } from '../../src/art/CreatureSprite';
import { ElementIcon } from '../../src/art/ElementIcon';

const HID = { hidden: true };
const mockGenerate = jest.fn();
jest.mock('@kinfall/core/art/creatureGen', () => {
  const actual = jest.requireActual<typeof import('@kinfall/core/art/creatureGen')>('@kinfall/core/art/creatureGen');
  return {
    ...actual,
    generateCreature: (...args: Parameters<typeof actual.generateCreature>) => {
      mockGenerate(args[0].id);
      return actual.generateCreature(...args);
    },
  };
});

describe('CreatureSprite', () => {
  it('renders every species at several scales with a 24 * scale canvas', async () => {
    for (const sp of CONTENT.species) {
      for (const scale of [1, 2, 3, 4]) {
        const { unmount } = await render(<CreatureSprite species={sp} scale={scale} />);
        const box = screen.getByTestId(`sprite-${sp.id}-${scale}`, HID);
        expect(box.props.style).toMatchObject({ width: 24 * scale, height: 24 * scale });
        await unmount();
      }
    }
  });

  it('accepts a species id and rejects an unknown one', async () => {
    const first = CONTENT.species[0]!;
    await render(<CreatureSprite species={first.id} scale={2} />);
    expect(screen.getByTestId(`sprite-${first.id}-2`, HID)).toBeTruthy();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(<CreatureSprite species="no-such-species" scale={2} />)).rejects.toThrow(/Unknown species/);
    spy.mockRestore();
  });

  it('is hidden from the accessibility tree unless a label is given', async () => {
    const sp = CONTENT.species[0]!;
    await render(<CreatureSprite species={sp} scale={2} />);
    const box = screen.getByTestId(`sprite-${sp.id}-2`, HID);
    expect(box.props.accessible).toBe(false);
    expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(box.props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('exposes an image role with the label when one is given', async () => {
    const sp = CONTENT.species[0]!;
    await render(<CreatureSprite species={sp} scale={3} accessibilityLabel="A creature" />);
    expect(screen.getByRole('image', { name: 'A creature' })).toBeTruthy();
  });

  it('flips with a horizontal scale only when asked', async () => {
    const sp = CONTENT.species[0]!;
    await render(
      <>
        <CreatureSprite species={sp} scale={2} />
        <CreatureSprite species={sp} scale={3} flip />
      </>,
    );
    expect(screen.getByTestId(`sprite-${sp.id}-2`, HID).props.style.transform).toBeUndefined();
    expect(screen.getByTestId(`sprite-${sp.id}-3`, HID).props.style.transform).toEqual([{ scaleX: -1 }]);
  });

  it('generates each grid once, however often or at whatever scale it renders', async () => {
    // The first test above already drew every species at four scales: one generation per species.
    for (const sp of CONTENT.species) {
      expect(mockGenerate.mock.calls.filter(([id]) => id === sp.id)).toHaveLength(1);
    }
    const sp = CONTENT.species[0]!;
    const before = mockGenerate.mock.calls.length;
    const view = await render(<CreatureSprite species={sp} scale={2} />);
    await view.rerender(<CreatureSprite species={sp} scale={2} />);
    await view.rerender(<CreatureSprite species={sp.id} scale={4} flip />);
    expect(mockGenerate.mock.calls.length).toBe(before);
  });
});

describe('ElementIcon', () => {
  it('renders every element as an 8 * scale decorative canvas', async () => {
    for (const el of ['ember', 'thorn', 'tide', 'gale', 'umbra'] as const) {
      const { unmount } = await render(<ElementIcon element={el} scale={3} />);
      const box = screen.getByTestId(`element-${el}-3`, HID);
      expect(box.props.style).toMatchObject({ width: 24, height: 24 });
      expect(box.props.accessible).toBe(false);
      expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
      await unmount();
    }
  });
});
