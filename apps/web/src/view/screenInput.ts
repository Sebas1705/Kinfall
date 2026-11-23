// Input layer bound to one screen: keys, pad buttons and gamepad act only while that screen is the
// visible one. On every other screen the keys keep their browser default (arrows and Space scroll).
import { createInput } from '../platform/input';
import type { GameAction, InputOptions } from '../platform/input';
import type { Router, ScreenId } from './router';
import { isSheetOpen } from './sheet';

export function bindScreenInput(
  target: HTMLElement,
  router: Pick<Router, 'current'>,
  screen: ScreenId,
  onAction: (a: GameAction) => void,
  options: Omit<InputOptions, 'active'> = {},
): { dispose(): void } {
  return createInput(target, onAction, { ...options, active: () => router.current() === screen && !isSheetOpen() });
}
