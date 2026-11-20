// Node-map icons (16x16): one distinct silhouette per node kind, so colour is never the only cue.
// The map always names the node in text too; the icons are decorative.
import type { NodeType } from '../../sim/run/types';
import type { PixelGrid } from '../palette';
import type { Hex } from './color';
import { cos, PI, round, sin } from './fixedMath';
import { Grid } from './grid';

export type NodeIconKind = 'battle' | 'elite' | 'boss' | 'recruit' | 'shrine' | 'cache' | 'mystery';
export const NODE_ICON_KINDS: readonly NodeIconKind[] = ['battle', 'elite', 'boss', 'recruit', 'shrine', 'cache', 'mystery'];

/** Palette slots of every icon. */
const A = 1; // main
const B = 2; // highlight
const C = 3; // shade
const G = 4; // glow accent
const O = 5; // outline

export const ICON_OUTLINE = '#140e1c';

const PALETTES: Record<NodeIconKind, [Hex, Hex, Hex, Hex]> = {
  battle: ['#f4e4cc', '#fff8ec', '#e0583e', '#ff9d4a'],
  elite: ['#e8743c', '#ffb878', '#8a3020', '#ffe27a'],
  boss: ['#b04a74', '#e080a8', '#5a1a3a', '#ffd36b'],
  recruit: ['#f0a070', '#ffd2b0', '#a8583a', '#ffd36b'],
  shrine: ['#9a9ab8', '#d6d6ec', '#56567a', '#8ff0ff'],
  cache: ['#b06a30', '#e09a50', '#5a3218', '#ffd36b'],
  mystery: ['#a07ae0', '#dcd0ff', '#5a3a9a', '#fff2f6'],
};

const SIZE = 16;

function draw(kind: NodeIconKind, g: Grid): void {
  switch (kind) {
    case 'battle':
      // Three curved claw slashes, the middle one longest; two cells wide in the middle,
      // tapering to one cell at both ends, with a lit leading edge.
      for (let k = 0; k < 3; k++) {
        const top = k === 1 ? 1 : 3;
        const bottom = k === 1 ? 14 : 12;
        for (let y = top; y <= bottom; y++) {
          const u = (y - top) / (bottom - top);
          const x = round(2 + k * 4 + (1 - u) * 5 - sin(u * PI) * 1.5);
          const wide = u > 0.2 && u < 0.8;
          g.set(x, y, wide ? C : A);
          if (wide) g.set(x + 1, y, B);
        }
      }
      break;
    case 'elite':
      // A spiked crest with a glowing eye.
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (Math.abs(x - 7.5) + Math.abs(y - 9.5) <= 5.5) g.set(x, y, A);
      }
      g.line(4, 6, 3, 2, A);
      g.line(7, 5, 7, 1, A);
      g.line(8, 5, 8, 1, A);
      g.line(11, 6, 12, 2, A);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (g.get(x, y) === A && Math.abs(x - 7.5) + Math.abs(y - 9.5) > 4 && y > 9) g.set(x, y, C);
      }
      g.rect(6, 9, 4, 2, G);
      g.set(7, 8, B);
      break;
    case 'boss':
      // A horned mask with two burning eyes.
      g.ellipse(7.5, 9.5, 5, 5, A);
      g.line(3, 7, 1, 2, A);
      g.line(4, 6, 2, 2, A);
      g.line(12, 7, 14, 2, A);
      g.line(11, 6, 13, 2, A);
      g.rect(4, 12, 8, 2, C);
      g.set(5, 13, A);
      g.set(7, 13, A);
      g.set(9, 13, A);
      g.rect(4, 8, 3, 2, G);
      g.rect(9, 8, 3, 2, G);
      g.set(7, 6, B);
      g.set(8, 6, B);
      break;
    case 'recruit':
      // A paw print with a little sparkle: a creature joining the party.
      g.ellipse(7, 10.5, 4, 3, A);
      g.disc(2.8, 6.8, 1.6, A);
      g.disc(5.5, 4, 1.6, A);
      g.disc(9, 4, 1.6, A);
      g.disc(11.6, 6.8, 1.6, A);
      g.set(6, 9, B);
      g.set(7, 9, B);
      g.set(13, 1, G);
      g.set(12, 2, G);
      g.set(13, 2, B);
      g.set(14, 2, G);
      g.set(13, 3, G);
      break;
    case 'shrine':
      // A rounded standing stone with a glowing rune on a slab.
      g.rect(5, 5, 6, 8, A);
      g.ellipse(8, 5, 3, 3, A);
      g.rect(3, 12, 10, 2, C);
      g.vline(5, 3, 11, B);
      g.vline(8, 5, 10, G);
      g.set(7, 6, G);
      g.set(9, 6, G);
      g.set(7, 9, G);
      g.set(9, 8, G);
      break;
    case 'cache':
      // A banded chest with a gold lock.
      g.rect(2, 7, 12, 7, A);
      g.rect(2, 4, 12, 3, B);
      g.hline(3, 12, 3, B);
      g.rect(2, 7, 12, 1, C);
      g.rect(4, 4, 1, 10, C);
      g.rect(11, 4, 1, 10, C);
      g.rect(7, 7, 2, 3, G);
      break;
    case 'mystery':
      // A spiral of mist with a bright centre.
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const a = t * PI * 3.6;
        const r = 1.2 + t * 5;
        g.set(round(7.5 + cos(a) * r), round(7.5 + sin(a) * r), t > 0.5 ? A : B);
      }
      g.rect(7, 7, 2, 2, G);
      break;
  }
}

/** 16x16 icon of a node kind, outlined, with its own 6-colour palette. */
export function nodeIcon(kind: NodeIconKind): PixelGrid {
  const [a, b, c, glow] = PALETTES[kind];
  const g = new Grid(SIZE, SIZE, ['#00000000', a, b, c, glow, ICON_OUTLINE]);
  draw(kind, g);
  g.outline(O);
  return g.toPixelGrid();
}

/** Icon kind of a map node type (`wild` battles use the battle icon). */
export function iconForNodeType(type: NodeType): NodeIconKind {
  return type === 'wild' ? 'battle' : type;
}

/** Main fill colour of an icon (for contrast checks against page backgrounds). */
export function nodeIconMain(kind: NodeIconKind): Hex {
  return PALETTES[kind][0];
}
