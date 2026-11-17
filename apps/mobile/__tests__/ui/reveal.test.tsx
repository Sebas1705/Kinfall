import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConfirmPanel } from '../../src/ui/ConfirmPanel';
import { revealScrollY, RevealContext } from '../../src/ui/Screen';

describe('revealScrollY', () => {
  // A 600dp viewport scrolled to 1000; margin 16.
  it('leaves a fully visible element alone', () => {
    expect(revealScrollY(1100, 200, 1000, 600)).toBeNull();
  });

  it('scrolls down just enough for an element below the viewport', () => {
    expect(revealScrollY(1500, 200, 1000, 600)).toBe(1500 + 200 + 16 - 600);
  });

  it('scrolls up to an element above the viewport', () => {
    expect(revealScrollY(400, 200, 1000, 600)).toBe(384);
  });

  it('aligns an element taller than the viewport by its top', () => {
    expect(revealScrollY(1200, 900, 1000, 600)).toBe(1184);
  });

  it('never scrolls above the start, and does nothing before the viewport is measured', () => {
    expect(revealScrollY(4, 100, 500, 600)).toBe(0);
    expect(revealScrollY(1500, 200, 0, 0)).toBeNull();
  });
});

describe('ConfirmPanel', () => {
  it('asks its scroll area to reveal it whenever it is laid out (appearing, or wrapping at large text)', async () => {
    const reveal = jest.fn();
    await render(
      <RevealContext.Provider value={reveal}>
        <ConfirmPanel question="Abandon?" yes="Yes" no="No" onYes={() => {}} onNo={() => {}} testID="confirm" />
      </RevealContext.Provider>,
    );
    await fireEvent(screen.getByTestId('confirm'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal.mock.calls[0]![0]).toBeTruthy();
    await fireEvent(screen.getByTestId('confirm'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 240 } } });
    expect(reveal).toHaveBeenCalledTimes(2);
  });
});
