// PixiJS battle scene (presentation side). It draws what the sim's state and events say and never
// writes anything back: animation timing only changes visuals. Every animation also has a timeout
// fallback, and a hidden tab finishes them at once, so `play` always resolves.
import { Application, CanvasSource, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { generateCreature } from '../art/creatureGen';
import { elementIcon } from '../art/elementIcon';
import type { PixelGrid } from '../art/palette';
import { CONTENT } from '../content';
import { lookup } from '../content/lookup';
import type { ElementId, SpeciesDef, StatusId } from '../content';
import { speciesName, t } from '../platform/i18n';
import type { BattleEvent, BattleState, Combatant, Side } from '../sim/state';
import { createAnimator } from './animator';
import type { PlayContext } from './animator';
import { intentText } from './menu';

export interface BattleView {
  render(state: BattleState): void;
  play(events: BattleEvent[], opts: { reducedMotion: boolean }): Promise<void>;
  destroy(): void;
}

/** The scene keeps its own palette; it does not follow the light/dark UI theme. */
const COLORS = {
  sky: 0x1b1d2a,
  ground: 0x2a2e44,
  groundEdge: 0x3a4060,
  panel: 0x0e0f17,
  text: 0xf4f4f8,
  muted: 0xc2c6d6,
  track: 0x3c4058,
  hpHigh: 0x4cb050,
  hpMid: 0xe2b33a,
  hpLow: 0xe5573d,
  focus: 0x6a9cf2,
};

/** Hit flashes are at most 2 per second. */
const FLASH_GAP_MS = 500;

/** Tiny status icons (shape and colour differ; the status name is always shown next to them). */
const STATUS_SHAPES: Record<StatusId, { color: string; rows: string[] }> = {
  scorch: { color: '#f08a3c', rows: ['..#..', '.##..', '.###.', '#####', '.###.'] },
  stun: { color: '#f2d14b', rows: ['...##', '..##.', '.####', '.##..', '##...'] },
};

function statusGrid(id: StatusId): PixelGrid {
  const { color, rows } = STATUS_SHAPES[id];
  const pixels = new Uint8Array(25);
  rows.forEach((row, y) => {
    for (let x = 0; x < 5; x++) if (row[x] === '#') pixels[y * 5 + x] = 1;
  });
  return { width: 5, height: 5, pixels, palette: ['#00000000', color] };
}

function parseColor(hex: string): [number, number, number, number] {
  const n = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return [n(0), n(1), n(2), hex.length >= 9 ? n(3) : 255];
}

/** Canvas texture of a pixel grid with nearest-neighbour sampling; `silhouette` paints every pixel white. */
function gridTexture(grid: PixelGrid, silhouette = false): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(grid.width, grid.height);
    const colors = grid.palette.map(parseColor);
    for (let i = 0; i < grid.pixels.length; i++) {
      const idx = grid.pixels[i] ?? 0;
      if (idx === 0) continue;
      const c = silhouette ? ([255, 255, 255, 255] as const) : (colors[idx] ?? [0, 0, 0, 0]);
      img.data.set(c, i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) });
}

interface Shown {
  speciesId: string;
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  status: StatusId | null;
  fainted: boolean;
}

function shownOf(c: Combatant): Shown {
  return {
    speciesId: c.speciesId,
    hp: c.hp,
    maxHp: c.maxHp,
    focus: c.focus,
    maxFocus: c.maxFocus,
    status: c.status?.id ?? null,
    fainted: c.fainted,
  };
}

interface SideView {
  shown: Shown | null;
  /** Holds the creature; moved for lunges, faded for swaps and faints. */
  body: Container;
  sprite: Sprite;
  flash: Sprite;
  hud: Container;
  panel: Graphics;
  name: Text;
  tag: Text;
  elements: Container;
  hpLabel: Text;
  hpBar: Graphics;
  hpText: Text;
  focusLabel: Text;
  focusBar: Graphics;
  focusText: Text;
  statusIcon: Sprite;
  statusText: Text;
  /** Resting position of `body`. */
  baseX: number;
  baseY: number;
}

/** 0 -> 1 -> 0 over p in [0, 1]. */
const there = (p: number) => (p < 0.5 ? p * 2 : (1 - p) * 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export async function createBattleView(host: HTMLElement): Promise<BattleView> {
  const doc = host.ownerDocument;
  const app = new Application();
  await app.init({
    width: Math.max(1, host.clientWidth),
    height: 240,
    background: COLORS.sky,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1))),
    roundPixels: true,
    preference: ['webgl', 'canvas'],
    autoStart: false,
  });
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.classList.add('scene-canvas');
  host.append(canvas);

  const textures = new Map<string, Texture>();
  const texture = (key: string, make: () => PixelGrid, silhouette = false): Texture => {
    const k = `${key}${silhouette ? ':white' : ''}`;
    let tex = textures.get(k);
    if (!tex) {
      tex = gridTexture(make(), silhouette);
      textures.set(k, tex);
    }
    return tex;
  };
  const creatureTex = (id: string, white = false) =>
    texture(`creature:${id}`, () => generateCreature(lookup(CONTENT).species(id)), white);
  const elementTex = (el: ElementId) => texture(`element:${el}`, () => elementIcon(el));
  const statusTex = (id: StatusId) => texture(`status:${id}`, () => statusGrid(id));

  const ground = new Graphics();
  app.stage.addChild(ground);

  const makeText = (bold = false, color = COLORS.text) =>
    new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill: color, fontWeight: bold ? '700' : '400' } });

  const makeSide = (): SideView => {
    const body = new Container();
    const sprite = new Sprite(Texture.EMPTY);
    const flash = new Sprite(Texture.EMPTY);
    flash.alpha = 0;
    body.addChild(sprite, flash);
    const hud = new Container();
    const panel = new Graphics();
    const name = makeText(true);
    const tag = makeText(false, COLORS.muted);
    const elements = new Container();
    const hpLabel = makeText(false, COLORS.muted);
    const hpBar = new Graphics();
    const hpText = makeText();
    const focusLabel = makeText(false, COLORS.muted);
    const focusBar = new Graphics();
    const focusText = makeText();
    const statusIcon = new Sprite(Texture.EMPTY);
    const statusText = makeText();
    hud.addChild(panel, name, tag, elements, hpLabel, hpBar, hpText, focusLabel, focusBar, focusText, statusIcon, statusText);
    app.stage.addChild(body, hud);
    return {
      shown: null, body, sprite, flash, hud, panel, name, tag, elements, hpLabel, hpBar, hpText,
      focusLabel, focusBar, focusText, statusIcon, statusText, baseX: 0, baseY: 0,
    };
  };
  const sides: Record<Side, SideView> = { enemy: makeSide(), player: makeSide() };
  const intentPanel = new Graphics();
  const intent = makeText(true);
  app.stage.addChild(intentPanel, intent);

  let lastState: BattleState | null = null;
  let width = 0;
  let destroyed = false;
  let lastFlash = -Infinity;
  // Frames drive the animator only while something animates; idle scenes are drawn on demand.
  const animator = createAnimator({
    fallbackMs: 150,
    onStart: () => {
      if (!app.ticker.started) app.ticker.start();
    },
    onIdle: () => {
      app.ticker.stop();
      app.render();
    },
  });

  // Metrics recomputed by layout().
  let fontSize = 12;
  let lineH = 18;
  let pad = 6;
  let panelW = 150;
  let spriteScale = 3;
  let iconScale = 2;

  const redraw = () => {
    if (!destroyed && !app.ticker.started) app.render();
  };

  const fit = (text: Text, maxWidth: number) => {
    text.scale.set(1);
    if (text.width > maxWidth && maxWidth > 0) text.scale.set(maxWidth / text.width);
  };

  const drawBar = (g: Graphics, x: number, y: number, w: number, h: number, value: number, max: number, color: number) => {
    g.clear();
    g.roundRect(x, y, w, h, h / 2).fill(COLORS.track);
    const fw = max > 0 ? Math.round((w * Math.max(0, Math.min(value, max))) / max) : 0;
    if (fw > 0) g.roundRect(x, y, Math.max(fw, h), h, h / 2).fill(color);
  };

  /**
   * Redraws a side's HUD from its shown values. `barsOnly` (used every frame of a bar tween) skips
   * the name, element and status rows, which do not change while hp moves.
   */
  const drawHud = (side: Side, barsOnly = false) => {
    const v = sides[side];
    const s = v.shown;
    v.hud.visible = s !== null;
    v.body.visible = s !== null;
    if (!s) return;
    const sp = lookup(CONTENT).species(s.speciesId);
    const inner = panelW - pad * 2;
    if (!barsOnly) drawHeader(v, side, sp, inner);
    drawBars(v, s, inner);
    if (!barsOnly) drawStatus(v, s, inner);
  };

  const drawHeader = (v: SideView, side: Side, sp: SpeciesDef, inner: number) => {
    for (const txt of [v.name, v.tag, v.hpLabel, v.hpText, v.focusLabel, v.focusText, v.statusText]) {
      txt.style.fontSize = fontSize;
    }
    v.panel.clear();
    v.panel.roundRect(0, 0, panelW, pad * 2 + lineH * 5, 6).fill({ color: COLORS.panel, alpha: 0.9 });

    v.tag.text = t(side === 'player' ? 'hud.player' : 'hud.enemy');
    fit(v.tag, inner * 0.4);
    v.tag.position.set(panelW - pad - v.tag.width, pad + (lineH - v.tag.height) / 2);
    v.name.text = speciesName(sp);
    fit(v.name, inner - v.tag.width - 6);
    v.name.position.set(pad, pad + (lineH - v.name.height) / 2);

    // Element row: icon + name for each element.
    v.elements.removeChildren().forEach((c) => c.destroy());
    let x = 0;
    const iconSize = 8 * iconScale;
    for (const el of sp.elements) {
      const icon = new Sprite(elementTex(el));
      icon.scale.set(iconScale);
      icon.position.set(x, Math.round((lineH - iconSize) / 2));
      const label = makeText(false, COLORS.text);
      label.style.fontSize = fontSize;
      label.text = t(`element.${el}`);
      label.position.set(x + iconSize + 3, (lineH - label.height) / 2);
      v.elements.addChild(icon, label);
      x += iconSize + 3 + label.width + 8;
    }
    v.elements.scale.set(1);
    if (v.elements.width > inner) v.elements.scale.set(inner / v.elements.width);
    v.elements.position.set(pad, pad + lineH);
  };

  const drawBars = (v: SideView, s: Shown, inner: number) => {
    // Column widths come from the real text so short labels ("HP", "PS") leave more room for bars.
    v.hpLabel.text = t('hud.hp');
    v.focusLabel.text = t('hud.focus');
    v.hpLabel.scale.set(1);
    v.focusLabel.scale.set(1);
    const labelW = Math.min(Math.ceil(inner * 0.35), Math.ceil(Math.max(v.hpLabel.width, v.focusLabel.width)) + 6);
    v.hpText.scale.set(1);
    v.hpText.text = `${s.maxHp}/${s.maxHp}`;
    const numW = Math.min(Math.ceil(inner * 0.4), Math.ceil(v.hpText.width) + 4);
    const barX = pad + labelW;
    const barW = Math.max(16, inner - labelW - numW - 4);
    const barH = Math.max(6, Math.round(fontSize * 0.55));
    const rowY = (row: number) => pad + lineH * row;

    fit(v.hpLabel, labelW - 3);
    v.hpLabel.position.set(pad, rowY(2) + (lineH - v.hpLabel.height) / 2);
    const hp = Math.round(s.hp);
    const ratio = s.maxHp > 0 ? hp / s.maxHp : 0;
    const hpColor = ratio > 0.5 ? COLORS.hpHigh : ratio > 0.25 ? COLORS.hpMid : COLORS.hpLow;
    drawBar(v.hpBar, barX, rowY(2) + (lineH - barH) / 2, barW, barH, hp, s.maxHp, hpColor);
    v.hpText.text = `${hp}/${s.maxHp}`;
    fit(v.hpText, numW);
    v.hpText.position.set(panelW - pad - v.hpText.width, rowY(2) + (lineH - v.hpText.height) / 2);

    fit(v.focusLabel, labelW - 3);
    v.focusLabel.position.set(pad, rowY(3) + (lineH - v.focusLabel.height) / 2);
    const focus = Math.round(s.focus);
    drawBar(v.focusBar, barX, rowY(3) + (lineH - barH) / 2, barW, barH, focus, s.maxFocus, COLORS.focus);
    v.focusText.text = `${focus}/${s.maxFocus}`;
    fit(v.focusText, numW);
    v.focusText.position.set(panelW - pad - v.focusText.width, rowY(3) + (lineH - v.focusText.height) / 2);
  };

  const drawStatus = (v: SideView, s: Shown, inner: number) => {
    const rowY = (row: number) => pad + lineH * row;
    if (s.status) {
      v.statusIcon.texture = statusTex(s.status);
      v.statusIcon.scale.set(iconScale + 1);
      v.statusIcon.visible = true;
      const size = 5 * (iconScale + 1);
      v.statusIcon.position.set(pad, rowY(4) + Math.round((lineH - size) / 2));
      v.statusText.text = t(`status.${s.status}`);
      fit(v.statusText, inner - size - 4);
      v.statusText.position.set(pad + size + 4, rowY(4) + (lineH - v.statusText.height) / 2);
      v.statusText.visible = true;
    } else {
      v.statusIcon.visible = false;
      v.statusText.visible = false;
    }
  };

  /** Sets the intent text (wrapped to the panel width) and returns the height its pill needs. */
  const prepareIntent = (): number => {
    const text = lastState ? intentText(lastState, CONTENT) : null;
    intent.visible = text !== null;
    intentPanel.visible = text !== null;
    if (text === null) return 0;
    intent.style.fontSize = fontSize;
    intent.style.wordWrap = true;
    intent.style.wordWrapWidth = panelW - pad * 2;
    intent.style.lineHeight = lineH;
    intent.text = `» ${text}`;
    return Math.ceil(intent.height) + 6;
  };

  const placeIntent = (x: number, y: number, h: number) => {
    if (!intent.visible) return;
    intentPanel.clear();
    intentPanel.roundRect(0, 0, Math.ceil(intent.width) + pad * 2, h, 6).fill({ color: COLORS.panel, alpha: 0.9 });
    intentPanel.position.set(x, y);
    intent.position.set(x + pad, y + 3);
  };

  const setCreature = (side: Side) => {
    const v = sides[side];
    if (!v.shown) return;
    v.sprite.texture = creatureTex(v.shown.speciesId);
    v.flash.texture = creatureTex(v.shown.speciesId, true);
    v.sprite.scale.set(spriteScale);
    v.flash.scale.set(spriteScale);
  };

  const resetBody = (side: Side) => {
    const v = sides[side];
    v.body.position.set(v.baseX, v.baseY);
    v.body.alpha = v.shown?.fainted ? 0.3 : 1;
    v.flash.alpha = 0;
  };

  /**
   * Recomputes sizes and positions from the host width and the page's text scale. Two rows: enemy
   * HUD (left) beside the enemy creature (right), the intent under the enemy HUD, then the player
   * creature (left) beside the player HUD (right). Rows grow with the text so nothing overlaps.
   */
  const layout = () => {
    const W = Math.max(280, Math.round(host.clientWidth || 320));
    const rootSize = parseFloat(getComputedStyle(host).fontSize) || 16;
    const textScale = Math.min(1.6, Math.max(0.7, rootSize / 16));
    const margin = 8;
    fontSize = Math.round((W < 480 ? 11 : 13) * textScale);
    lineH = Math.round(fontSize * 1.45);
    pad = Math.max(4, Math.round(fontSize * 0.5));
    iconScale = fontSize >= 16 ? 3 : 2;
    const baseH = Math.min(W * 0.56, 340);
    spriteScale = Math.max(2, Math.min(7, Math.floor(Math.min(W * 0.3, 160) / 24)));
    const sprite = 24 * spriteScale;
    const rx = Math.round(sprite * 0.62);
    const ry = Math.max(6, Math.round(sprite * 0.16));
    panelW = Math.round(Math.min(250, W - margin * 3 - rx * 2));
    const hudH = pad * 2 + lineH * 5;
    const intentH = prepareIntent();

    // Row 1: enemy HUD and intent on the left, enemy creature on the right.
    const enemyCx = Math.round(Math.min(W - margin - rx, Math.max(margin * 2 + panelW + rx, W * 0.72)));
    const enemyBottom = margin + 4 + sprite + ry;
    const leftBottom = margin + hudH + (intentH > 0 ? 6 + intentH : 0);
    // Row 2: player creature on the left, player HUD on the right.
    const playerCx = Math.round(Math.max(margin + rx, Math.min(W - margin * 2 - panelW - rx, W * 0.28)));
    const row2 = Math.max(hudH, sprite + ry + 6);
    const H = Math.round(Math.max(baseH, Math.max(leftBottom, enemyBottom) + 10 + row2 + margin));
    width = W;
    app.renderer.resize(W, H);

    sides.enemy.hud.position.set(margin, margin);
    placeIntent(margin, margin + hudH + 6, intentH);
    sides.player.hud.position.set(W - margin - panelW, H - margin - hudH);
    sides.enemy.baseX = enemyCx - sprite / 2;
    sides.enemy.baseY = margin + 4;
    sides.player.baseX = playerCx - sprite / 2;
    sides.player.baseY = H - margin - ry - sprite + spriteScale * 2;
    ground.clear();
    for (const side of ['enemy', 'player'] as const) {
      const v = sides[side];
      const cx = v.baseX + sprite / 2;
      const cy = v.baseY + sprite - spriteScale * 2;
      ground.ellipse(cx, cy, rx, ry).fill(COLORS.ground).stroke({ color: COLORS.groundEdge, width: 2 });
      setCreature(side);
      resetBody(side);
      drawHud(side);
    }
  };

  // ---- animation engine (see animator.ts) ------------------------------------------------------
  const tick = () => animator.tick(app.ticker.deltaMS);
  app.ticker.add(tick);

  const onVisibility = () => {
    // A hidden tab gets no frames: finish now and play the rest of this turn instantly.
    if (doc.hidden) {
      animator.setInstant(true);
      animator.finishAll();
    }
  };
  doc.addEventListener('visibilitychange', onVisibility);

  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (destroyed) return;
          if (Math.round(host.clientWidth) !== width) {
            layout();
            redraw();
          }
        });
  observer?.observe(host);

  // ---- event animations -------------------------------------------------------------------------
  const tweenHp = (ctx: PlayContext, side: Side, to: number) => {
    const s = sides[side].shown;
    if (!s) return Promise.resolve();
    const from = s.hp;
    const target = Math.max(0, Math.min(s.maxHp, to));
    return ctx.animate(380, (p) => {
      s.hp = lerp(from, target, p);
      drawHud(side, true);
    });
  };

  const hitFlash = (ctx: PlayContext, side: Side) => {
    const now = performance.now();
    if (animator.isInstant() || now - lastFlash < FLASH_GAP_MS) return Promise.resolve();
    lastFlash = now;
    const f = sides[side].flash;
    return ctx.animate(180, (p) => {
      f.alpha = p >= 1 ? 0 : there(p) * 0.8;
    });
  };

  /** Animates one event. After every await it checks `ctx.live()` so a cancelled play stops touching the scene. */
  const playEvent = async (e: BattleEvent, ctx: PlayContext) => {
    switch (e.type) {
      case 'move': {
        const v = sides[e.side];
        const reach = spriteScale * 5;
        const dir = e.side === 'player' ? 1 : -1;
        await ctx.animate(260, (p) => {
          const k = p >= 1 ? 0 : there(p);
          v.body.position.set(v.baseX + dir * reach * k, v.baseY - dir * (reach / 2) * k);
        });
        return;
      }
      case 'damage': {
        const s = sides[e.side].shown;
        if (!s) return;
        await Promise.all([hitFlash(ctx, e.side), tweenHp(ctx, e.side, s.hp - e.amount)]);
        return;
      }
      case 'heal': {
        const s = sides[e.side].shown;
        if (!s) return;
        await tweenHp(ctx, e.side, s.hp + e.amount);
        return;
      }
      case 'status': {
        const s = sides[e.side].shown;
        if (s) s.status = e.status;
        drawHud(e.side);
        await ctx.animate(220, () => {});
        return;
      }
      case 'skip': {
        const s = sides[e.side].shown;
        if (s && s.status === 'stun') s.status = null;
        drawHud(e.side);
        await ctx.animate(300, () => {});
        return;
      }
      case 'swap': {
        const v = sides[e.side];
        const next = lastState?.teams[e.side][e.toIndex];
        if (!next) return;
        await ctx.animate(160, (p) => {
          v.body.alpha = (v.shown?.fainted ? 0.3 : 1) * (1 - p);
        });
        if (!ctx.live()) return;
        v.shown = shownOf(next);
        setCreature(e.side);
        drawHud(e.side);
        await ctx.animate(160, (p) => {
          v.body.alpha = p;
        });
        if (!ctx.live()) return;
        resetBody(e.side);
        return;
      }
      case 'fainted': {
        const v = sides[e.side];
        if (v.shown) {
          v.shown.hp = 0;
          v.shown.fainted = true;
          v.shown.status = null;
        }
        drawHud(e.side);
        await ctx.animate(360, (p) => {
          v.body.alpha = lerp(1, 0.3, p);
          v.body.position.set(v.baseX, v.baseY + Math.round(spriteScale * 2 * p));
        });
        return;
      }
      default:
        return;
    }
  };

  const view: BattleView = {
    render(state: BattleState) {
      if (destroyed) return;
      // The real state wins: a play still running is cancelled before the scene is rebuilt.
      animator.cancel();
      lastState = state;
      for (const side of ['player', 'enemy'] as const) {
        const c = state.teams[side][state.active[side]];
        sides[side].shown = c ? shownOf(c) : null;
      }
      layout();
      redraw();
    },
    async play(events: BattleEvent[], opts: { reducedMotion: boolean }) {
      if (destroyed) return;
      try {
        await animator.play(events, playEvent, opts.reducedMotion || doc.hidden);
      } finally {
        redraw();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      animator.dispose();
      doc.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      app.ticker.remove(tick);
      app.destroy({ removeView: true }, { children: true });
      for (const tex of textures.values()) tex.destroy(true);
      textures.clear();
    },
  };
  return view;
}
