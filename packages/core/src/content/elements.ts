import type { ElementId } from './schema';

/** Cycle order: each element beats the next one and the one after next (indices mod 5). */
export const ELEMENTS: readonly ElementId[] = ['ember', 'thorn', 'tide', 'gale', 'umbra'];

/** Damage multiplier in percent of `attacker` against a (possibly dual) defender. */
export function effectiveness(attacker: ElementId, defender: readonly ElementId[]): number {
  const a = ELEMENTS.indexOf(attacker);
  let pct = 100;
  for (const el of defender) {
    const d = ELEMENTS.indexOf(el);
    const diff = (d - a + 5) % 5;
    const per = diff === 1 || diff === 3 ? 200 : diff === 0 ? 100 : 50;
    pct = Math.floor((pct * per) / 100);
  }
  return pct;
}
