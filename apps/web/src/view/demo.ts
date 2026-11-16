import type { Content } from '@webgames/core/content';
import { createRng } from '@webgames/core/sim/rng';
import type { TeamSpec } from '@webgames/core/sim/state';

/**
 * Teams for the demo battle page, picked from the seed with the sim's PRNG (never Math.random):
 * a Fisher-Yates shuffle of the species list on the seed's `demo:teams` fork; the player gets the
 * first three, the enemy the next three. Same seed, same teams, on any engine.
 */
export function demoTeams(seed: string, content: Content): { player: TeamSpec; enemy: TeamSpec } {
  const ids = content.species.map((s) => s.id);
  if (ids.length < 6) throw new Error('demo battle needs at least 6 species');
  const rng = createRng(seed).fork('demo:teams');
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return { player: { speciesIds: ids.slice(0, 3) }, enemy: { speciesIds: ids.slice(3, 6) } };
}
