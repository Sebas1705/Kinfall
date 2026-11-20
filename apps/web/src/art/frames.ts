// Pixel frames for the DOM: the core's nine-slice plates, buttons and bar tracks become CSS
// `border-image` values in custom properties on <html> (see art.css). They follow the light/dark
// scheme (parchment / dusk) and the current zone's gem colour, and are rebuilt when either changes.
// The page stays fully usable without them: they only load with the art chunk.
import { barStyle, buttonFrame, plateFrame, UI_PALETTES, zoneIdOf, type NineSlice, type UiTheme } from '@kinfall/core/art/scene';
import { gridBitmap } from './canvas2d';
// Inlined and injected by installFrames: the main bundle never lists the art's stylesheet.
import artCss from './art.css?inline';

/** Frames are drawn at 2 CSS px per art pixel. */
export const FRAME_SCALE = 2;

/** `url(...) <slice> fill / <width>px [/ <outset>px]` for a nine-slice at FRAME_SCALE. */
export function borderImage(url: string, ns: NineSlice, outsetCells = 0): string {
  const s = ns.slice;
  const w = (n: number) => `${n * FRAME_SCALE}px`;
  const out = outsetCells > 0 ? ` / ${w(outsetCells)}` : '';
  return `url("${url}") ${s.top} ${s.right} ${s.bottom} ${s.left} fill / ${w(s.top)} ${w(s.right)} ${w(s.bottom)} ${w(s.left)}${out}`;
}

/** Every custom property the frames need, for one theme and zone. `toUrl` turns a grid into an image URL. */
export function frameVars(theme: UiTheme, zone: number, toUrl: (ns: NineSlice) => string): Record<string, string> {
  const opts = { theme, zone: zoneIdOf(zone) };
  const ui = UI_PALETTES[theme];
  const plate = plateFrame(opts);
  const focus = buttonFrame('focused', opts);
  const bar = barStyle('hp', opts).frame;
  const vars: Record<string, string> = {
    '--k-plate': borderImage(toUrl(plate), plate),
    // The focus ring sits outside the button (outset = ring + gap), so focusing never moves the layout.
    '--k-btn-focus': borderImage(toUrl(focus), focus, 3),
    '--k-bar': borderImage(toUrl(bar), bar),
    '--k-plate-bg': ui.plate,
    '--k-plate-text': plate.textColor,
    '--k-plate-muted': ui.textMuted,
    '--k-btn-bg': ui.button,
    '--k-btn-pressed-bg': ui.pressed,
    '--k-btn-disabled-bg': ui.disabled,
    '--k-btn-text': ui.buttonText,
    '--k-btn-disabled-text': ui.disabledText,
    '--k-track': ui.track,
    '--k-hp-high': ui.hpHigh,
    '--k-hp-mid': ui.hpMid,
    '--k-hp-low': ui.hpLow,
    '--k-focus-fill': ui.focusFill,
    '--k-shine': ui.fillShine,
    '--k-ring': ui.focus,
  };
  for (const state of ['normal', 'pressed', 'disabled'] as const) {
    const ns = buttonFrame(state, opts);
    vars[state === 'normal' ? '--k-btn' : `--k-btn-${state}`] = borderImage(toUrl(ns), ns);
  }
  return vars;
}

const urlCache = new WeakMap<NineSlice['grid'], string>();
const dataUrl = (ns: NineSlice): string => {
  let url = urlCache.get(ns.grid);
  if (!url) {
    url = gridBitmap(ns.grid).toDataURL();
    urlCache.set(ns.grid, url);
  }
  return url;
};

/** The zone the screens are showing (set by the run page on <body>); 0 outside a run. */
export function currentZone(doc: Document = document): number {
  const z = Number(doc.body?.dataset.zone);
  return Number.isFinite(z) ? z : 0;
}

let installed = false;

/** Applies the frames to the page once and keeps them in sync with the colour scheme and zone. */
export function installFrames(doc: Document = document): void {
  if (installed) return;
  installed = true;
  const style = doc.createElement('style');
  style.id = 'kinfall-art';
  style.textContent = artCss;
  doc.head.append(style);
  const root = doc.documentElement;
  const dark = doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  let key = '';
  const apply = () => {
    const theme: UiTheme = dark?.matches ? 'dusk' : 'parchment';
    const zone = currentZone(doc);
    const next = `${theme}|${zone}`;
    if (next === key) return;
    key = next;
    try {
      for (const [name, value] of Object.entries(frameVars(theme, zone, dataUrl))) root.style.setProperty(name, value);
      root.classList.add('art-frames');
    } catch (err) {
      // No 2D canvas (or no toDataURL): keep the plain styles.
      console.warn('pixel frames unavailable', err);
    }
  };
  apply();
  dark?.addEventListener?.('change', apply);
  if (doc.body && typeof MutationObserver !== 'undefined') {
    new MutationObserver(apply).observe(doc.body, { attributes: true, attributeFilter: ['data-zone'] });
  }
}
