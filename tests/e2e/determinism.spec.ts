import { expect, test } from '@playwright/test';
import golden from '../golden/battle.golden.json' with { type: 'json' };

// Spec section 11.2: the same golden replays must produce the stored hashes in every engine.
test.describe('cross-engine determinism', () => {
  // Vacuity guard: an empty or malformed golden file would otherwise generate no replay tests and pass.
  test('golden file is non-empty', () => {
    expect(golden.length).toBeGreaterThanOrEqual(3);
    for (const entry of golden) {
      expect(entry.finalHash.length, entry.name).toBeGreaterThan(0);
      expect(entry.seed.length, entry.name).toBeGreaterThan(0);
      expect(Array.isArray(entry.actions) && entry.actions.length > 0, entry.name).toBe(true);
    }
  });

  for (const entry of golden) {
    test(`golden replay ${entry.name}`, async ({ page }) => {
      await page.goto('/');
      const result = await page.evaluate(async (e) => {
        // Variable specifiers keep TypeScript from resolving these browser-side dev-server paths.
        const goldenPath = '/src/sim/golden.ts';
        const contentPath = '/src/content/index.ts';
        const [{ replayBattle }, { CONTENT }] = await Promise.all([import(goldenPath), import(contentPath)]);
        return replayBattle(e.seed, e.player, e.enemy, e.actions, CONTENT, { telegraph: e.telegraph }) as {
          finalHash: string;
          winner: string | null;
        };
      }, entry);
      expect(typeof result.finalHash === 'string' && result.finalHash.length === 16).toBe(true);
      expect(result.finalHash).toBe(entry.finalHash);
      expect(result.winner).toBe(entry.winner);
    });
  }
});
