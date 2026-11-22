import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { continueSavedRun, setTextSize, startRunWithKeyboard, writeCraftedSave } from './run-helpers';

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

/** Page never scrolls or overflows, every visible button is a real target; returns the layout rects. */
async function expectBattleFits(page: Page, landscape: boolean): Promise<void> {
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
}

// The battle in the console layout: nothing scrolls, nothing overflows sideways, every button is a
// real touch target, and in landscape the choices stand to the right of the stage. Text 130% must
// still be the console (not the fallback) at 640x360 and 360x640.
for (const size of [100, 130]) {
  test(`battle: fits the window without scrolling, rail beside the stage (text ${size}%)`, async ({ page }, info) => {
    const landscape = info.project.name === 'phone-landscape' || info.project.name === 'chromium';
    await startRunWithKeyboard(page, 'e2e-layout');
    if (size !== 100) await setTextSize(page, size);
    await page.locator('#screen-map button.map-node:not([disabled])').first().click();
    await expect(page.locator('#screen-battle')).toBeVisible();
    await expect(page.locator('#choices button').first()).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
    await expectBattleFits(page, landscape);
  });
}

// Large text on a tall window is still the console: 800 / 2 is above the battle budget.
test('battle: text 200% on a tall window stays a console without scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'desktop window only');
  await page.setViewportSize({ width: 1280, height: 800 });
  await startRunWithKeyboard(page, 'e2e-layout');
  await setTextSize(page, 150);
  await page.locator('#screen-map button.map-node:not([disabled])').first().click();
  await expect(page.locator('#choices button').first()).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
  await expectBattleFits(page, true);
});

// The stage track is sized from the layout contract, so it follows the window both ways.
test('battle: the scene follows a window that shrinks and grows back', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'resizes the window itself');
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterBattle(page, 'e2e-layout');
  await expect(page.locator('#scene canvas.scene-canvas')).toBeVisible();
  for (const [w, h, landscape] of [
    [1280, 800, true],
    [360, 640, false],
    [1280, 800, true],
    [360, 640, false],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect(page.locator('#app')).toHaveAttribute('data-orientation', landscape ? 'landscape' : 'portrait');
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const stage = document.querySelector('.stage')!.getBoundingClientRect();
          const canvas = document.querySelector('#scene canvas.scene-canvas')!.getBoundingClientRect();
          const doc = document.scrollingElement!;
          return canvas.bottom <= stage.bottom + 0.5 && doc.scrollHeight <= window.innerHeight;
        }),
      )
      .toBe(true);
    await expectBattleFits(page, landscape);
  }
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
  // The rail is reachable by scrolling the primary area, and its buttons are real targets.
  const first = page.locator('#choices button:not([disabled])').first();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toBeInViewport();
  const box = await first.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

// The on-screen d-pad (touch only) steps aside on windows too short for it (see styles.css).
test.describe('d-pad on touch screens', () => {
  test.use({ hasTouch: true, isMobile: true });
  const cases = [
    [411, 914, true],
    [1280, 800, true],
    [914, 411, false],
    [360, 640, false],
  ] as const;
  for (const [w, h, shown] of cases) {
    test(`${w}x${h}: ${shown ? 'shown' : 'hidden'}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', 'sizes set here');
      await page.setViewportSize({ width: w, height: h });
      await enterBattle(page, 'e2e-layout');
      await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
      const dpad = page.locator('#dpad');
      if (!shown) {
        await expect(dpad).toBeHidden();
        return;
      }
      await expect(dpad).toBeVisible();
      const m = await page.evaluate(() => {
        const bar = document.querySelector('#dpad')!.getBoundingClientRect();
        const small = [...document.querySelectorAll<HTMLElement>('#dpad button')]
          .map((b) => b.getBoundingClientRect())
          .filter((r) => r.width < 44 || r.height < 44).length;
        return { right: bar.right, bottom: bar.bottom, small, iw: innerWidth, ih: innerHeight,
          scrollW: document.scrollingElement!.scrollWidth, scrollH: document.scrollingElement!.scrollHeight };
      });
      expect(m.small).toBe(0);
      expect(m.right).toBeLessThanOrEqual(m.iw);
      expect(m.bottom).toBeLessThanOrEqual(m.ih);
      expect(m.scrollW).toBeLessThanOrEqual(m.iw);
      expect(m.scrollH).toBeLessThanOrEqual(m.ih);
    });
  }
});

// ---- title, map, event and end in the console layout ----

type RunScreen = 'title' | 'map' | 'event' | 'end';

/** Everything the console promises on a run screen: nothing scrolls (page, primary or rail), nothing
 *  overflows sideways, every button is a real target, and the rail is beside / under the primary area. */
async function expectScreenFits(page: Page, screen: RunScreen, landscape: boolean): Promise<void> {
  const m = await page.evaluate((id) => {
    const doc = document.scrollingElement!;
    const section = document.querySelector<HTMLElement>(`#screen-${id}`)!;
    const visible = (el: Element) => !el.closest('[hidden]') && !el.closest('[inert]') && el.getClientRects().length > 0;
    const small = [...document.querySelectorAll<HTMLElement>('button, .starter-card')]
      .filter(visible)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { name: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 30), w: r.width, h: r.height };
      })
      .filter((b) => b.w < 43.5 || b.h < 43.5);
    const primary = section.querySelector('.screen-primary')!.getBoundingClientRect();
    const rail = section.querySelector('.screen-rail')!.getBoundingClientRect();
    // No box scrolls, and none clips its content (overflow hidden hides what does not fit): the
    // visually hidden 1 px texts are the only boxes allowed to.
    const scrolls = [...document.querySelectorAll<HTMLElement>('#screens, #screens *')]
      .filter(visible)
      .filter((el) => el.clientWidth > 2 && el.clientHeight > 2 && getComputedStyle(el).overflow !== 'visible')
      .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
      .filter((el) => !el.matches('.title-hero, .end-scene, .event-vignette'))
      .map((el) => `${el.id || el.className}: ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`);
    // Everything visible stays inside the window.
    const outside = [...section.querySelectorAll<HTMLElement>('.screen-primary *, .screen-rail *')]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5 || r.left < -0.5);
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`);
    return {
      scrollHeight: doc.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      small,
      scrolls,
      outside,
      primaryRight: primary.right,
      primaryBottom: primary.bottom,
      railLeft: rail.left,
      railTop: rail.top,
    };
  }, screen);
  expect(m.scrollHeight).toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
  expect(m.small).toEqual([]);
  expect(m.scrolls).toEqual([]);
  expect(m.outside).toEqual([]);
  if (landscape) expect(m.railLeft).toBeGreaterThanOrEqual(m.primaryRight - 1);
  else expect(m.railTop).toBeGreaterThanOrEqual(m.primaryBottom - 1);
}

async function showRunScreen(page: Page, screen: RunScreen): Promise<void> {
  if (screen === 'title') {
    await page.goto('/?seed=e2e-layout');
    await expect(page.locator('#screen-title [data-action="new-run"]')).toBeVisible();
  } else if (screen === 'map') {
    await startRunWithKeyboard(page, 'e2e-layout');
  } else {
    await page.goto('/');
    await writeCraftedSave(page, screen === 'end' ? 'won' : 'recruit');
    await continueSavedRun(page);
  }
  await expect(page.locator(`#screen-${screen}`)).toBeVisible();
}

for (const screen of ['title', 'map', 'event', 'end'] as const) {
  for (const size of [100, 130]) {
    test(`${screen}: fits the window without scrolling in the console (text ${size}%)`, async ({ page }, info) => {
      const landscape = info.project.name === 'phone-landscape' || info.project.name === 'chromium';
      await showRunScreen(page, screen);
      if (size !== 100) await setTextSize(page, size);
      await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
      await expect(page.locator(`#screen-${screen}`)).toBeVisible();
      await expectScreenFits(page, screen, landscape);
    });
  }
}

// The other events: a shrine (rest, evolutions, leave), a cache and a mystery.
for (const kind of ['shrine', 'cache', 'mystery'] as const) {
  test(`event ${kind}: fits the window without scrolling in the console (text 130%)`, async ({ page }, info) => {
    const landscape = info.project.name === 'phone-landscape' || info.project.name === 'chromium';
    await page.goto('/');
    await writeCraftedSave(page, kind);
    await continueSavedRun(page);
    await setTextSize(page, 130);
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
    await expectScreenFits(page, 'event', landscape);
  });
}

// Large text on a tall window is still the console for every run screen.
for (const screen of ['title', 'map', 'event', 'end'] as const) {
  test(`${screen}: text 150% on a 1280x800 window stays a console without scrolling`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop window only');
    await page.setViewportSize({ width: 1280, height: 800 });
    await showRunScreen(page, screen);
    await setTextSize(page, 150);
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
    await expectScreenFits(page, screen, true);
  });
}

// The board: every available node can be reached by Tab, in layer order, and the board has at most 19 nodes.
test('map: the nodes are reachable by Tab in layer order and the board is bounded', async ({ page }) => {
  await startRunWithKeyboard(page, 'e2e-layout');
  const info = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLButtonElement>('#screen-map .map-layers button[data-node]')];
    return {
      all: nodes.length,
      layers: document.querySelectorAll('#screen-map .map-layers > li').length,
      enabled: nodes.filter((b) => !b.disabled).map((b) => b.dataset.node!),
      order: nodes.map((b) => b.dataset.node!),
    };
  });
  expect(info.layers).toBe(7);
  expect(info.all).toBeLessThanOrEqual(19);
  expect(info.enabled.length).toBeGreaterThanOrEqual(2);
  await page.locator('#screen-map [data-screen-heading]').focus();
  const visited: string[] = [];
  for (let i = 0; i < info.enabled.length; i++) {
    await page.keyboard.press('Tab');
    visited.push(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.node ?? ''));
  }
  expect(visited).toEqual(info.enabled);
  // The enabled nodes appear in the document in board order.
  expect(info.enabled).toEqual(info.order.filter((id) => info.enabled.includes(id)));
});

// The HUD button of each screen opens its sheet: map and event the run details (party, log, Abandon).
test('map: the HUD Run button opens party details, the log and Abandon; the confirmation stays in the sheet', async ({ page }) => {
  await startRunWithKeyboard(page, 'e2e-layout');
  const open = page.locator('#hud-run');
  await expect(open).toBeVisible();
  await expect(open).toHaveText('Run');
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Run details' })).toBeVisible();
  await expect(dialog.locator('.run-status')).toContainText('Souls');
  await dialog.locator('[data-action="abandon"]').click();
  await expect(dialog.locator('[data-action="abandon-no"]')).toBeFocused();
  await expect(dialog).toContainText('Abandon this run?');
  await dialog.locator('[data-action="abandon-no"]').click();
  await expect(dialog.locator('[data-action="abandon"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(open).toBeFocused();
  // The log and the party details went home.
  await expect(page.locator('#screens > #run-log-panel')).toHaveCount(1);
  await expect(page.locator('#screen-map .sheet-store .run-status')).toHaveCount(1);
});

test('title: the Options button opens the seed field; a typed seed starts that run', async ({ page }) => {
  await page.goto('/?seed=e2e-layout');
  const open = page.locator('#hud-run');
  await expect(open).toHaveText('Options');
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'New run options' })).toBeVisible();
  const seed = dialog.locator('#title-seed');
  await expect(seed).toBeVisible();
  await expect(dialog).toContainText('Saves live in this browser');
  await seed.fill('typed-seed');
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-title #title-seed')).toHaveValue('typed-seed');
  await page.locator('#screen-title [data-action="new-run"]').click();
  await expect(page.locator('#screen-map')).toBeVisible();
  await expect(page.locator('#seed')).toContainText('typed-seed');
});

test('end: the Run sheet shows the detailed stats', async ({ page }) => {
  await page.goto('/');
  await writeCraftedSave(page, 'won');
  await continueSavedRun(page);
  await page.locator('#hud-run').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.end-stats dt')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud-run')).toBeFocused();
});

// The HUD carries the party chips on the map and on events.
test('map: the party chips are in the HUD', async ({ page }) => {
  await startRunWithKeyboard(page, 'e2e-layout');
  await expect(page.locator('#hud-party li').first()).toContainText(/\d+\/\d+/);
  await expect(page.locator('#hud-party')).toContainText('Souls');
});

// Fallback keeps everything reachable: the sheet content is inline and the HUD button steps aside.
test('fallback: the run details are inline and the HUD button is hidden', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'sized for the 640x360 project');
  await startRunWithKeyboard(page, 'e2e-layout');
  await setTextSize(page, 150);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'fallback');
  await expect(page.locator('#hud-run')).toBeHidden();
  await expect(page.locator('#screen-map .run-status')).toBeVisible();
  await expect(page.locator('#screen-map [data-action="abandon"]')).toBeVisible();
  const m = await page.evaluate(() => ({ page: document.scrollingElement!.scrollHeight, inner: innerHeight, w: document.scrollingElement!.scrollWidth, iw: innerWidth }));
  expect(m.page).toBeLessThanOrEqual(m.inner);
  expect(m.w).toBeLessThanOrEqual(m.iw);
});
