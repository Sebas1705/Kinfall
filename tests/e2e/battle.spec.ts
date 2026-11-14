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
    await page.goto(`/?seed=${SEED}`);
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
    await page.goto(`/?seed=${SEED}`);
    await playToResult(page, 'keyboard');
    const viaKeyboard = await logText(page);

    await page.goto(`/?seed=${SEED}`);
    await playToResult(page, 'click');
    const viaClicks = await logText(page);

    expect(viaKeyboard.length).toBeGreaterThan(0);
    expect(viaClicks).toBe(viaKeyboard);
  });

  test('reduced motion: no animation stays pending after each turn', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?seed=${SEED}`);
    await expect(page.locator('#reduce-motion')).toBeChecked();
    await expect(firstEnabled(page)).toBeVisible();
    await firstEnabled(page).focus();
    for (let turn = 0; turn < 3; turn++) {
      if (await page.locator('#result').isVisible()) break;
      await page.keyboard.press('Enter');
      // Reduced motion settles quickly, far below the watchdog.
      await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true', { timeout: 1_500 });
      await expect(page.locator('#log .log-turn')).toHaveCount(turn + 1);
    }
    // The whole battle still reaches the same result as a normal-motion run.
    const turns = await playToResult(page, 'keyboard');
    expect(turns).toBeLessThan(MAX_TURNS);
    const reduced = await logText(page);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`/?seed=${SEED}`);
    await playToResult(page, 'keyboard');
    expect(await logText(page)).toBe(reduced);
  });

  test('a hidden tab mid-battle gives the same result as the foreground run', async ({ page }) => {
    await page.goto(`/?seed=${SEED}`);
    await playToResult(page, 'keyboard');
    const foreground = await logText(page);
    const word = await page.locator('#result-title').innerText();

    await page.goto(`/?seed=${SEED}`);
    await expect(firstEnabled(page)).toBeVisible();
    await firstEnabled(page).focus();
    // One turn in the foreground, then the tab goes to the background for the rest.
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
});
