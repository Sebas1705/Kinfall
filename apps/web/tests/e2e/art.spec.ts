// The scene art layer: decorative, out of the accessibility tree, still under reduced motion, and
// never in the way of playing.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const firstEnabled = (page: Page) => page.locator('#choices button:not([disabled])').first();

async function waitIdle(page: Page): Promise<void> {
  await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
}

/** A data URL of a 2D canvas (the DOM screens' scenes are Canvas 2D). */
const snapshot = (page: Page, selector: string) =>
  page.evaluate((sel) => document.querySelector<HTMLCanvasElement>(sel)!.toDataURL(), selector);

test.describe('scene art', () => {
  test('the battle stage renders and is hidden from assistive technology', async ({ page }) => {
    await page.goto('/?mode=battle&seed=art-stage');
    await expect(firstEnabled(page)).toBeVisible();
    const scene = page.locator('#scene');
    const canvas = scene.locator('canvas.scene-canvas');
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
    const box = (await canvas.boundingBox())!;
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(100);
    await expect(scene).toHaveAttribute('data-zone', /^[012]$/);
    // Both HUD plates are visible text for sighted players and hidden from screen readers; the
    // summary (sr-only), the log and the menu carry the same facts.
    const plates = scene.locator('.hud-plate');
    await expect(plates).toHaveCount(2);
    for (const plate of await plates.all()) {
      await expect(plate).toBeVisible();
      await expect(plate).toHaveAttribute('aria-hidden', 'true');
    }
    await expect(scene.locator('.hud-plate--player .hud-num').first()).toHaveText(/^\d+\/\d+$/);
    expect((await scene.ariaSnapshot()).trim()).toBe('');
    await expect(page.locator('#summary')).not.toBeEmpty();
    // Nothing in the stage takes focus.
    expect(await scene.locator('button, a, input, select, [tabindex]').count()).toBe(0);
  });

  test('the title logo is an image with the game name', async ({ page }) => {
    await page.goto('/?seed=art-title');
    const logo = page.getByRole('img', { name: 'Kinfall' });
    await expect(logo).toBeVisible();
    await page.selectOption('#lang', 'es');
    await expect(page.getByRole('img', { name: 'Kinfall' })).toBeVisible();
    // The animated hero behind it is decorative.
    await expect(page.locator('#screen-title .title-scene')).toHaveAttribute('aria-hidden', 'true');
  });

  test('reduced motion stills the art: no sway, drift or particles moving, and no battle ticker', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?seed=art-still');
    await expect(page.locator('#screen-title .title-scene')).toBeVisible();
    await page.waitForTimeout(300);
    const a = await snapshot(page, '#screen-title .title-scene');
    await page.waitForTimeout(800);
    expect(await snapshot(page, '#screen-title .title-scene')).toBe(a);

    await page.goto('/?mode=battle&seed=art-still');
    await expect(firstEnabled(page)).toBeVisible();
    const scene = page.locator('#scene');
    await expect(scene).toHaveAttribute('data-motion', 'reduced');
    await firstEnabled(page).click();
    await expect(page.locator('#log .log-turn')).toHaveCount(1);
    await waitIdle(page);
    // The static effect frames are held briefly, then the scene stops drawing altogether.
    await expect(scene).toHaveAttribute('data-ticker', 'stopped', { timeout: 5_000 });
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("the app's own reduce-motion toggle stills the art too", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/?seed=art-toggle');
    await expect(page.locator('#screen-title .title-scene')).toBeVisible();
    // Moving: the hero changes over time.
    await page.waitForTimeout(300);
    const before = await snapshot(page, '#screen-title .title-scene');
    await expect.poll(() => snapshot(page, '#screen-title .title-scene'), { timeout: 5_000 }).not.toBe(before);
    // Turned off with the page's own setting: still.
    await page.locator('#reduce-motion').check();
    await page.waitForTimeout(200);
    const still = await snapshot(page, '#screen-title .title-scene');
    await page.waitForTimeout(800);
    expect(await snapshot(page, '#screen-title .title-scene')).toBe(still);
  });

  test('with motion on, a full battle plays to its result over the live stage', async ({ page }) => {
    // A full animated battle: slower on a CI runner with software rendering, so the 60 s default is tripled.
    test.slow();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/?mode=battle&seed=e2e');
    await expect(firstEnabled(page)).toBeVisible();
    const scene = page.locator('#scene');
    await expect(scene).toHaveAttribute('data-motion', 'full');
    // The ticker only runs while the stage is on screen; on a 320 px viewport with a CI font the stage can
    // start below the fold, so bring it into view first.
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute('data-ticker', 'running');
    // Pixel frames are on the buttons, and the focused choice wears the focus ring frame.
    await expect(page.locator('html')).toHaveClass(/art-frames/);
    await firstEnabled(page).focus();
    const frames = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement;
      const other = document.querySelectorAll<HTMLElement>('#choices button:not([disabled])')[1]!;
      return { focused: getComputedStyle(focused).borderImageSource, other: getComputedStyle(other).borderImageSource };
    });
    expect(frames.other).toMatch(/^url\(/);
    expect(frames.focused).toMatch(/^url\(/);
    expect(frames.focused).not.toBe(frames.other);

    const result = page.locator('#result');
    for (let turn = 0; turn < 60 && !(await result.isVisible()); turn++) {
      const before = await page.locator('#log .log-turn').count();
      await page.keyboard.press('Enter');
      await expect(page.locator('#log .log-turn')).toHaveCount(before + 1, { timeout: 15_000 });
      await waitIdle(page);
    }
    await expect(page.locator('#result-title')).toHaveText(/^(Victory|Defeat)$/);
    await expect(page.locator('#new-battle')).toBeFocused();
  });
});
