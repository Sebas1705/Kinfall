import type { Content } from '../../content';
import { lookup } from '../../content/lookup';

/** A party member's max HP: the player side never scales (hpPercent 100). */
export function maxHpOf(speciesId: string, content: Content): number {
  return lookup(content).species(speciesId).base.health * 4;
}
