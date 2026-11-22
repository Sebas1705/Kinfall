import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setTextSize, startRunWithKeyboard } from './run-helpers';

// The shell never scrolls the page: in the console layout and in the fallback only the primary
// area (`.screens`) scrolls, so the HUD stays in view.
test('fallback: the page does not scroll, only the primary area does', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'sized for the 640x360 project');
  await page.goto('/');
  await startRunWithKeyboard(page, 'e2e-layout');
  await setTextSize(page, 150);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'fallback');

  const m = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const screens = document.getElementById('screens')!;
    const top = document.querySelector('.hud')!.getBoundingClientRect();
    return {
      pageScroll: doc.scrollHeight,
      inner: window.innerHeight,
      screensScroll: screens.scrollHeight,
      screensClient: screens.clientHeight,
      hudTop: top.top,
    };
  });
  expect(m.pageScroll).toBeLessThanOrEqual(m.inner);
  expect(m.screensScroll).toBeGreaterThan(m.screensClient);
  expect(m.hudTop).toBeGreaterThanOrEqual(0);
});

// The battle in the console layout: nothing scrolls, nothing overflows sideways, every button is a
// real touch target, and in landscape the choices stand to the right of the stage.
test('battle: fits the window without scrolling and the rail sits beside the stage', async ({ page }, info) => {
  const landscape = info.project.name === 'phone-landscape' || info.project.name === 'chromium';
  await startRunWithKeyboard(page, 'e2e-layout');
  await page.locator('#screen-map button.map-node:not([disabled])').first().click();
  await expect(page.locator('#screen-battle')).toBeVisible();
  await expect(page.locator('#choices button').first()).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');

  const m = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const small = [...document.querySelectorAll<HTMLElement>('button')]
      .filter((b) => !b.closest('[hidden]') && !b.closest('[inert]') && b.getClientRects().length > 0)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { name: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 30), w: r.width, h: r.height };
      })
      .filter((b) => b.w < 44 || b.h < 44);
    const stage = document.querySelector('#scene')!.getBoundingClientRect();
    const choices = document.querySelector('#choices')!.getBoundingClientRect();
    return {
      scrollHeight: doc.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      small,
      stageRight: stage.right,
      choicesLeft: choices.left,
      choicesBottom: choices.bottom,
      stageBottom: stage.bottom,
    };
  });
  expect(m.scrollHeight).toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
  expect(m.small).toEqual([]);
  if (landscape) expect(m.choicesLeft).toBeGreaterThanOrEqual(m.stageRight - 1);
  else expect(m.choicesBottom).toBeGreaterThan(m.stageBottom);
});

async function enterBattle(page: Page, seed: string): Promise<void> {
  await startRunWithKeyboard(page, seed);
  await page.locator('#screen-map button.map-node:not([disabled])').first().click();
  await expect(page.locator('#screen-battle')).toBeVisible();
  await expect(page.locator('#choices button').first()).toBeVisible();
}

// The Log button lends the one live log to a sheet and gets it back, newest lines still live.
test('battle: the Log button opens the full log in a sheet and returns it', async ({ page }) => {
  await enterBattle(page, 'e2e-layout');
  const log = page.locator('#log');
  await expect(log).toHaveAttribute('role', 'log');
  await expect(log).toHaveAttribute('aria-live', 'polite');

  await page.locator('#choices button:not([disabled])').first().click();
  await expect.poll(() => log.locator('.log-turn').count()).toBeGreaterThan(0);
  await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true');

  const hudLog = page.locator('#hud-log');
  await expect(hudLog).toBeVisible();
  await hudLog.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#log')).toHaveAttribute('role', 'log');
  expect(await dialog.locator('#log .log-turn').count()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.log-panel #log')).toHaveCount(1);
  await expect(hudLog).toBeFocused();
  // One line only over the stage: the log box is a single text line high.
  const h = await page.locator('#log').evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeLessThan(44);
});

// Huge text: the page still does not scroll, only the primary area does, and the log is a plain panel.
test('battle fallback: only the primary area scrolls and the log stays in the flow', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'sized for the 640x360 project');
  await page.goto('/');
  await enterBattle(page, 'e2e-layout');
  await setTextSize(page, 150);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'fallback');
  await expect(page.locator('#hud-log')).toBeHidden();
  const m = await page.evaluate(() => ({
    page: document.scrollingElement!.scrollHeight,
    inner: window.innerHeight,
    wide: document.scrollingElement!.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(m.page).toBeLessThanOrEqual(m.inner);
  expect(m.wide).toBeLessThanOrEqual(m.innerW);
  await expect(page.locator('#choices button').first()).toBeAttached();
});
