import { expect, test } from '@playwright/test';
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
