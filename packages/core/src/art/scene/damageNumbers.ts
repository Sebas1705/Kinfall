// Floating numbers (damage, heals, souls): a style and a motion track. The number itself is real
// text drawn by the platform with a bold pixel-like face, hidden from screen readers: the battle
// log already says the same thing in words.
import type { Hex } from './color';
import type { Keyframe } from './effects';
import { NEUTRAL_FX } from './palettes';

export type FloatingNumberKind = 'damage' | 'superEffective' | 'resisted' | 'heal' | 'soul';

export interface FloatingNumberStyle {
  kind: FloatingNumberKind;
  /** Text fill, its 1-art-pixel outline (draw it on all 8 sides) and a 1-pixel drop shadow. */
  fill: Hex;
  outline: Hex;
  shadow: Hex;
  /** Prefix shown before the number ("+" for heals). */
  prefix: '' | '+';
  /** Text height in scene px (multiply by the renderer scale); 8 = normal, 10 = emphasised. */
  sizePx: 8 | 10;
  durationMs: number;
  /** Motion relative to the spawn point above the target's head (scene px). */
  offsetY: Keyframe[];
  alpha: Keyframe[];
  /** Pop scale, 1 = normal (round the drawn size to whole pixels). */
  scale: Keyframe[];
  /** Reduced motion: shown still for `holdMs`, then removed. */
  reducedHoldMs: number;
}

const OUTLINE = '#120a14';

const RISE: Keyframe[] = [{ t: 0, v: 0 }, { t: 120, v: -8 }, { t: 700, v: -14 }];
const FADE: Keyframe[] = [{ t: 0, v: 1 }, { t: 520, v: 1 }, { t: 760, v: 0 }];

export function floatingNumberStyle(kind: FloatingNumberKind): FloatingNumberStyle {
  const common = { kind, outline: OUTLINE, shadow: '#000000', prefix: '' as const, sizePx: 8 as const, durationMs: 760, offsetY: RISE, alpha: FADE, scale: [{ t: 0, v: 1 }], reducedHoldMs: 700 };
  switch (kind) {
    case 'damage':
      return { ...common, fill: '#fff6dc' };
    case 'superEffective':
      return { ...common, fill: NEUTRAL_FX.gold, sizePx: 10, scale: [{ t: 0, v: 1.6 }, { t: 90, v: 1 }], offsetY: [{ t: 0, v: 0 }, { t: 90, v: -10 }, { t: 700, v: -16 }] };
    case 'resisted':
      return { ...common, fill: '#c9c3d6', offsetY: [{ t: 0, v: 0 }, { t: 700, v: -8 }] };
    case 'heal':
      return { ...common, fill: NEUTRAL_FX.heal, prefix: '+' };
    case 'soul':
      return { ...common, fill: NEUTRAL_FX.soul, prefix: '+', durationMs: 900, alpha: [{ t: 0, v: 1 }, { t: 640, v: 1 }, { t: 900, v: 0 }] };
  }
}

export const FLOATING_NUMBER_KINDS: readonly FloatingNumberKind[] = ['damage', 'superEffective', 'resisted', 'heal', 'soul'];
