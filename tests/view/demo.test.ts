import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import { demoTeams } from '../../src/view/demo';

describe('demoTeams', () => {
  it('is deterministic for a seed', () => {
    expect(demoTeams('demo', CONTENT)).toEqual(demoTeams('demo', CONTENT));
  });

  it('builds two teams of three distinct known species', () => {
    for (const seed of ['demo', '', 'x'.repeat(500), '🦊 ñandú']) {
      const { player, enemy } = demoTeams(seed, CONTENT);
      expect(player.speciesIds.length).toBe(3);
      expect(enemy.speciesIds.length).toBe(3);
      const all = [...player.speciesIds, ...enemy.speciesIds];
      expect(new Set(all).size).toBe(6);
      for (const id of all) expect(CONTENT.species.some((s) => s.id === id)).toBe(true);
    }
  });

  it('varies with the seed', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(JSON.stringify(demoTeams(`seed-${i}`, CONTENT)));
    expect(seen.size).toBeGreaterThan(5);
  });
});
