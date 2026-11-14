import { expect, test } from '@playwright/test';
import golden from '../golden/battle.golden.json' with { type: 'json' };

// Spec section 11.2: the same golden replays must produce the stored hashes in every engine.
test.describe('cross-engine determinism', () => {
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
      expect(result.finalHash).toBe(entry.finalHash);
      expect(result.winner).toBe(entry.winner);
    });
  }
});
