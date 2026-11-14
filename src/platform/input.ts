// Input layer (presentation side): keyboard, gamepad and on-screen touch buttons
// all funnel into one GameAction stream. Not part of the simulation.

export type GameAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'swap';

export interface KeyLike {
  code: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

const KEY_MAP: Readonly<Record<string, GameAction>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  KeyZ: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyX: 'back',
  KeyQ: 'swap',
};

const ACTIONS: ReadonlySet<string> = new Set<GameAction>([
  'up', 'down', 'left', 'right', 'confirm', 'back', 'swap',
]);

/** Standard-layout gamepad button index -> action. */
const PAD_MAP: Readonly<Record<number, GameAction>> = {
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
  0: 'confirm',
  1: 'back',
  3: 'swap',
};

/** Tab is never mapped; repeats and modifier combos are ignored. */
export function mapKey(e: KeyLike): GameAction | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  return KEY_MAP[e.code] ?? null;
}

/** Edge-triggered: returns an action only for a button that went up -> down. */
export function mapGamepad(prev: boolean[], next: boolean[]): GameAction | null {
  for (let i = 0; i < next.length; i++) {
    if (next[i] && !prev[i]) {
      const action = PAD_MAP[i];
      if (action) return action;
    }
  }
  return null;
}

export interface PadLike {
  buttons: ReadonlyArray<{ pressed: boolean }>;
}

export interface InputOptions {
  now?: () => number;
  /** Calls `cb` every frame; returns a function that stops the loop. */
  poll?: (cb: () => void) => () => void;
  getGamepads?: () => ReadonlyArray<PadLike | null>;
}

/** The same action arriving from two sources inside this window counts once. */
const DEDUPE_MS = 50;

function defaultPoll(cb: () => void): () => void {
  let id = 0;
  const loop = () => {
    cb();
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(id);
}

export function createInput(
  target: HTMLElement,
  onAction: (a: GameAction) => void,
  options: InputOptions = {},
): { dispose(): void } {
  const now = options.now ?? (() => performance.now());
  const poll = options.poll ?? defaultPoll;
  const getGamepads =
    options.getGamepads ??
    (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));
  const win = target.ownerDocument.defaultView ?? window;

  const lastEmit = new Map<GameAction, number>();
  const held = new Set<string>();
  let prevPad: boolean[] = [];

  const emit = (action: GameAction) => {
    const t = now();
    const last = lastEmit.get(action);
    if (last !== undefined && t - last < DEDUPE_MS) return;
    lastEmit.set(action, t);
    onAction(action);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as Element | null;
    if (el && typeof el.closest === 'function') {
      // Form controls and links own every key.
      if (el.closest('input, textarea, select, a[href], [contenteditable]:not([contenteditable="false"])')) return;
      // Buttons keep native Enter/Space activation (their click is handled by delegation).
      if ((e.code === 'Enter' || e.code === 'Space') && el.closest('button, [role="button"]')) return;
    }
    const action = mapKey(e);
    if (!action) return;
    e.preventDefault();
    // Some browsers omit `repeat`; a key we already track as held is not a new press.
    if (held.has(e.code)) return;
    held.add(e.code);
    emit(action);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
  const onBlur = () => {
    held.clear();
    prevPad = [];
  };
  const onClick = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.('button[data-action]');
    if (!el || !target.contains(el)) return;
    const action = el.getAttribute('data-action');
    if (action && ACTIONS.has(action)) emit(action as GameAction);
  };

  const onFrame = () => {
    const pad = getGamepads().find((p): p is PadLike => p != null);
    const next = pad ? pad.buttons.map((b) => b.pressed) : [];
    for (let i = 0; i < next.length; i++) {
      if (next[i] && !prevPad[i]) {
        const only: boolean[] = [];
        only[i] = true;
        const action = mapGamepad([], only);
        if (action) emit(action);
      }
    }
    prevPad = next;
  };

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', onBlur);
  target.addEventListener('click', onClick);
  const stopPoll = poll(onFrame);

  return {
    dispose() {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
      target.removeEventListener('click', onClick);
      stopPoll();
    },
  };
}
