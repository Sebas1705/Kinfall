// Drives the console layout on the web: reads the window and the app text scale, asks the shared
// contract (@kinfall/core/layout/spec) which mode and region sizes apply, and publishes the answer
// on the root element as `data-orientation`, `data-mode` and the custom properties `--hud-h`,
// `--rail-w` (width of the action rail, 0 in portrait) and `--stage-h` (height of the primary
// area). The CSS does the actual layout; this module never moves elements.
import { layoutSpec } from '@kinfall/core/layout/spec';
import type { ScreenId } from '@kinfall/core/layout/spec';

export interface LayoutOptions {
  screen: () => ScreenId;
  /** Effective text scale: the app text size divided by 100 (1 = default). */
  textScale: () => number;
}

export interface LayoutHandle {
  refresh(): void;
  stop(): void;
}

export function startLayout(root: HTMLElement, opts: LayoutOptions): LayoutHandle {
  const refresh = (): void => {
    const spec = layoutSpec(
      { width: window.innerWidth, height: window.innerHeight, textScale: opts.textScale() },
      opts.screen(),
    );
    const { hud, primary, actions } = spec.regions;
    root.dataset.orientation = spec.orientation;
    root.dataset.mode = spec.mode;
    root.style.setProperty('--hud-h', `${hud.height}px`);
    root.style.setProperty('--rail-w', `${spec.orientation === 'landscape' ? actions.width : 0}px`);
    root.style.setProperty('--stage-h', `${primary.height}px`);
  };

  const viewport = window.visualViewport ?? null;
  window.addEventListener('resize', refresh);
  viewport?.addEventListener('resize', refresh);
  document.addEventListener('fullscreenchange', refresh);
  refresh();

  return {
    refresh,
    stop() {
      window.removeEventListener('resize', refresh);
      viewport?.removeEventListener('resize', refresh);
      document.removeEventListener('fullscreenchange', refresh);
    },
  };
}
