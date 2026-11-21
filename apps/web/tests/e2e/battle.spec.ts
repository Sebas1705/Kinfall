import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const MAX_TURNS = 60;
const SEED = 'e2e';

type Route = 'keyboard' | 'click';

const firstEnabled = (page: Page) => page.locator('#choices button:not([disabled])').first();

async function waitIdle(page: Page): Promise<void> {
  await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
}

async function logText(page: Page): Promise<string> {
  return page.locator('#log').innerText();
}

/** Plays until the result panel shows; returns the number of turns taken. */
async function playToResult(page: Page, route: Route): Promise<number> {
  const result = page.locator('#result');
  await expect(firstEnabled(page)).toBeVisible();
  if (route === 'keyboard') await firstEnabled(page).focus();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (await result.isVisible()) return turn;
    const before = await page.locator('#log .log-turn').count();
    if (route === 'keyboard') await page.keyboard.press('Enter');
    else await firstEnabled(page).click();
    // The turn is over once its log entry exists and the menu is unlocked again.
    await expect(page.locator('#log .log-turn')).toHaveCount(before + 1, { timeout: 15_000 });
    await waitIdle(page);
  }
  await expect(result).toBeVisible();
  return MAX_TURNS;
}

async function expectResultWord(page: Page): Promise<void> {
  await expect(page.locator('#result-title')).toHaveText(/^(Victory|Defeat)$/);
}

test.describe('battle flow', () => {
  test('keyboard only: reaches a result, then New battle clears the log', async ({ page }) => {
    test.slow(); // full animated battles: slower on a CI runner with software rendering
    await page.goto(`/?mode=battle&seed=${SEED}`);
    const turns = await playToResult(page, 'keyboard');
    expect(turns).toBeLessThan(MAX_TURNS);
    await expectResultWord(page);
    await expect(page.locator('#new-battle')).toBeFocused();
    expect(await page.locator('#log .log-turn').count()).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#log .log-turn')).toHaveCount(0);
    await expect(firstEnabled(page)).toBeVisible();
  });

  test('keyboard and clicking give the same final log for the same seed', async ({ page }) => {
    test.slow(); // full animated battles: slower on a CI runner with software rendering
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await playToResult(page, 'keyboard');
    const viaKeyboard = await logText(page);

    await page.goto(`/?mode=battle&seed=${SEED}`);
    await playToResult(page, 'click');
    const viaClicks = await logText(page);

    expect(viaKeyboard.length).toBeGreaterThan(0);
    expect(viaClicks).toBe(viaKeyboard);
  });

  test('reduced motion: every turn settles with no pending animation, and is not slower', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await expect(page.locator('#reduce-motion')).toBeChecked();
    await expect(firstEnabled(page)).toBeVisible();
    await firstEnabled(page).focus();
    for (let turn = 0; turn < 3; turn++) {
      if (await page.locator('#result').isVisible()) break;
      await page.keyboard.press('Enter');
      // Wait for the turn's log entry first (generous bound), then check the settled state.
      await expect(page.locator('#log .log-turn')).toHaveCount(turn + 1, { timeout: 5_000 });
      await waitIdle(page);
      await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true');
      if (await page.locator('#result').isVisible()) break;
      await expect(firstEnabled(page)).toBeEnabled();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    }
    // The whole battle still reaches the same result as a normal-motion run.
    const turns = await playToResult(page, 'keyboard');
    expect(turns).toBeLessThan(MAX_TURNS);
    const reduced = await logText(page);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await playToResult(page, 'keyboard');
    expect(await logText(page)).toBe(reduced);
  });

  test('reduced motion: the first turn is not slower than with motion on', async ({ page }) => {
    // Time (inside the page) from the click to the moment the turn's log entry exists.
    const firstTurnMs = async (reduce: boolean): Promise<number> => {
      await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
      await page.goto(`/?mode=battle&seed=${SEED}`);
      await expect(firstEnabled(page)).toBeVisible();
      await expect(page.locator('#reduce-motion')).toBeChecked({ checked: reduce });
      return page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const log = document.getElementById('log')!;
            const button = document.querySelector<HTMLButtonElement>('#choices button:not([disabled])')!;
            const t0 = performance.now();
            const timer = setTimeout(() => reject(new Error('turn never logged')), 10_000);
            const done = () => {
              if (log.querySelector('.log-turn')) {
                clearTimeout(timer);
                observer.disconnect();
                resolve(performance.now() - t0);
              }
            };
            const observer = new MutationObserver(done);
            observer.observe(log, { childList: true, subtree: true });
            button.click();
          }),
      );
    };
    const normal = await firstTurnMs(false);
    const reduced = await firstTurnMs(true);
    // No absolute bound: in a fast dev build both can be near-instant.
    expect(reduced).toBeLessThanOrEqual(normal + 50);
  });

  // Hidden-tab tests. What they simulate: a page whose document reports `hidden` / `visibilityState: 'hidden'`
  // from its very first script, and a page whose animation frames never fire (a frozen tab). What they do NOT
  // simulate: real browser throttling or backgrounding; timers still run at full speed.
  test('a tab that is hidden from the start plays the whole battle to the same result', async ({ page }) => {
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await playToResult(page, 'keyboard');
    const foreground = await logText(page);
    const word = await page.locator('#result-title').innerText();

    await page.addInitScript(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    });
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await expect(firstEnabled(page)).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await playToResult(page, 'keyboard');
    expect(await logText(page)).toBe(foreground);
    await expect(page.locator('#result-title')).toHaveText(word);
  });

  test('a tab whose animation frames never fire still plays to the same result', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await playToResult(page, 'keyboard');
    const foreground = await logText(page);
    const word = await page.locator('#result-title').innerText();

    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
    });
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await playToResult(page, 'keyboard');
    expect(await logText(page)).toBe(foreground);
    await expect(page.locator('#result-title')).toHaveText(word);
  });

  test('hiding the tab in the middle of a battle gives the same result as the foreground run', async ({ page }) => {
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await playToResult(page, 'keyboard');
    const foreground = await logText(page);
    const word = await page.locator('#result-title').innerText();

    await page.goto(`/?mode=battle&seed=${SEED}`);
    await expect(firstEnabled(page)).toBeVisible();
    await firstEnabled(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#log .log-turn')).toHaveCount(1);
    await waitIdle(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await playToResult(page, 'keyboard');
    expect(await logText(page)).toBe(foreground);
    await expect(page.locator('#result-title')).toHaveText(word);
  });

  test('holding Enter on a focused choice plays exactly one turn', async ({ page }) => {
    await page.goto(`/?mode=battle&seed=${SEED}`);
    await expect(firstEnabled(page)).toBeVisible();
    await firstEnabled(page).focus();
    for (let n = 0; n < 8; n++) {
      await page.keyboard.down('Enter'); // repeated down without up sends key repeat
      await page.waitForTimeout(200);
    }
    await page.keyboard.up('Enter');
    await waitIdle(page);
    await expect(page.locator('#log .log-turn')).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect(page.locator('#log .log-turn')).toHaveCount(1);
  });
});
