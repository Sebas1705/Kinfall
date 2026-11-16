import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import golden from '../../../../packages/core/tests/golden/battle.golden.json' with { type: 'json' };
import runGolden from '../../../../packages/core/tests/golden/run.golden.json' with { type: 'json' };

/**
 * Dev-server URL of packages/core/src. The core package lives outside the web app's Vite root, so
 * the dev server serves its files under /@fs/<absolute path> (the same URLs the app itself loads).
 */
const CORE_SRC = `/@fs/${resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'packages', 'core', 'src')
  .split('\\')
  .join('/')
  .replace(/^\//, '')}`;

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
      const result = await page.evaluate(async ({ e, core }) => {
        // Variable specifiers keep TypeScript from resolving these browser-side dev-server paths.
        const goldenPath = `${core}/sim/golden.ts`;
        const contentPath = `${core}/content/index.ts`;
        const [{ replayBattle }, { CONTENT }] = await Promise.all([import(goldenPath), import(contentPath)]);
        return replayBattle(e.seed, e.player, e.enemy, e.actions, CONTENT, { telegraph: e.telegraph }) as {
          finalHash: string;
          winner: string | null;
        };
      }, { e: entry, core: CORE_SRC });
      expect(typeof result.finalHash === 'string' && result.finalHash.length === 16).toBe(true);
      expect(result.finalHash).toBe(entry.finalHash);
      expect(result.winner).toBe(entry.winner);
    });
  }

  test('run golden file is non-empty', () => {
    expect(runGolden.length).toBeGreaterThanOrEqual(4);
    for (const entry of runGolden) {
      const name = `${entry.seed}/${entry.starterId}`;
      expect(entry.finalHash.length, name).toBe(16);
      expect(entry.seed.length, name).toBeGreaterThan(0);
      expect(['won', 'lost'], name).toContain(entry.result);
      expect(Number.isInteger(entry.score), name).toBe(true);
      expect(Array.isArray(entry.actions) && entry.actions.length > 0, name).toBe(true);
    }
  });

  for (const entry of runGolden) {
    test(`run golden replay ${entry.seed}/${entry.starterId}`, async ({ page }) => {
      await page.goto('/');
      const result = await page.evaluate(async ({ e, core }) => {
        // Variable specifiers keep TypeScript from resolving these browser-side dev-server paths.
        const paths = ['sim/run/bot.ts', 'sim/run/codec.ts', 'sim/run/score.ts', 'content/index.ts'].map((p) => `${core}/${p}`);
        const [{ replayRun }, { hashRun }, { runScore }, { CONTENT }] = await Promise.all(paths.map((p) => import(p)));
        const { run, rejected } = replayRun(e.seed, e.starterId, e.actions, CONTENT);
        return {
          finalHash: hashRun(run) as string,
          result: run.phase.kind === 'ended' ? (run.phase.result as string) : null,
          score: runScore(run, CONTENT) as number,
          rejected: rejected as number,
        };
      }, { e: entry, core: CORE_SRC });
      expect(result.rejected).toBe(0);
      expect(result.finalHash).toBe(entry.finalHash);
      expect(result.result).toBe(entry.result);
      expect(result.score).toBe(entry.score);
    });
  }
});
