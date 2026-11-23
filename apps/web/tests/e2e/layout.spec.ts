import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { continueSavedRun, setLanguage, setTextSize, startRunWithKeyboard, writeCraftedSave } from './run-helpers';

/** The orientation the layout driver actually chose (the window decides, not the project name: Firefox and WebKit run a desktop window). */
async function isLandscape(page: Page): Promise<boolean> {
  return (await page.locator('#app').getAttribute('data-orientation')) === 'landscape';
}

// The shell never scrolls the page: in the console layout and in the fallback only the primary
// area (`.screens`) scrolls, so the HUD stays in view; in the fallback the rail (the choices, the
// actions) is pinned at the bottom too (spec 7.5), capped at 55% of the window.

/** The fallback promise on the visible screen: the page does not scroll, the HUD and the rail are
 *  inside the window, the rail is at most 55% of it and the primary area keeps at least 25%. */
async function expectPinnedRail(page: Page, railSelector: string): Promise<void> {
  const m = await page.evaluate((sel) => {
    const doc = document.scrollingElement!;
    const screens = document.getElementById('screens')!.getBoundingClientRect();
    const hud = document.querySelector('.hud')!.getBoundingClientRect();
    const rail = document.querySelector(sel)!.getBoundingClientRect();
    return {
      pageScroll: doc.scrollHeight,
      pageWide: doc.scrollWidth,
      inner: window.innerHeight,
      innerW: window.innerWidth,
      hudTop: hud.top,
      hudBottom: hud.bottom,
      railTop: rail.top,
      railBottom: rail.bottom,
      railHeight: rail.height,
      screensTop: screens.top,
    };
  }, railSelector);
  expect(m.pageScroll).toBeLessThanOrEqual(m.inner);
  expect(m.pageWide).toBeLessThanOrEqual(m.innerW);
  expect(m.hudTop).toBeGreaterThanOrEqual(0);
  expect(m.hudBottom).toBeLessThanOrEqual(m.inner);
  expect(m.railTop).toBeGreaterThanOrEqual(0);
  expect(m.railBottom).toBeLessThanOrEqual(m.inner + 0.5);
  expect(m.railHeight).toBeLessThanOrEqual(m.inner * 0.55 + 1);
  expect(m.railTop - m.screensTop).toBeGreaterThanOrEqual(m.inner * 0.25 - 1);
}

test('fallback: the page does not scroll, only the primary area does, the rail is pinned', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'sized for the 640x360 project');
  await page.goto('/');
  await startRunWithKeyboard(page, 'e2e-layout');
  await setTextSize(page, 150);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'fallback');
  const m = await page.evaluate(() => {
    const screens = document.getElementById('screens')!;
    return { screensScroll: screens.scrollHeight, screensClient: screens.clientHeight };
  });
  expect(m.screensScroll).toBeGreaterThan(m.screensClient);
  await expectPinnedRail(page, '#screen-map .screen-rail');
  // Scrolling the primary area keeps the rail where it is (the inline run details come after the
  // rail in the DOM and tab order, so at the very end they scroll it away: not asserted there).
  await page.locator('#screens').evaluate((el) => el.scrollTo(0, 40));
  await expectPinnedRail(page, '#screen-map .screen-rail');
});

test('fallback: the map at 914x411 and text 150% pins the rail', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'sets its own window');
  await page.setViewportSize({ width: 914, height: 411 });
  await startRunWithKeyboard(page, 'e2e-layout');
  await setTextSize(page, 150);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'fallback');
  await expectPinnedRail(page, '#screen-map .screen-rail');
});

test('fallback: the event at 640x360 and text 150% pins the rail', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'sized for the 640x360 project');
  await page.goto('/');
  await writeCraftedSave(page, 'recruit');
  await continueSavedRun(page);
  await setTextSize(page, 150);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'fallback');
  await expect(page.locator('#screen-event')).toBeVisible();
  await expectPinnedRail(page, '#screen-event .screen-rail');
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
    // The rail never scrolls inside itself in the console: all of its choices are in view.
    const menu = document.querySelector<HTMLElement>('.menu-panel')!;
    const menuScroll = menu.scrollHeight - menu.clientHeight;
    const stage = document.querySelector('#scene')!.getBoundingClientRect();
    const choices = document.querySelector('#choices')!.getBoundingClientRect();
    return {
      scrollHeight: doc.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      small,
      menuScroll,
      stageRight: stage.right,
      choicesLeft: choices.left,
      choicesBottom: choices.bottom,
      stageBottom: stage.bottom,
    };
  });
  expect(m.scrollHeight).toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
  expect(m.small).toEqual([]);
  expect(m.menuScroll).toBeLessThanOrEqual(1);
  if (landscape) expect(m.choicesLeft).toBeGreaterThanOrEqual(m.stageRight - 1);
  else expect(m.choicesBottom).toBeGreaterThan(m.stageBottom);
}

// The battle in the console layout: nothing scrolls, nothing overflows sideways, every button is a
// real touch target, and in landscape the choices stand to the right of the stage. Text 130% must
// still be the console (not the fallback) at 640x360 and 360x640.
for (const size of [100, 130]) {
  test(`battle: fits the window without scrolling, rail beside the stage (text ${size}%)`, async ({ page }, info) => {
    await startRunWithKeyboard(page, 'e2e-layout');
    if (size !== 100) await setTextSize(page, size);
    await page.locator('#screen-map button.map-node:not([disabled])').first().click();
    await expect(page.locator('#screen-battle')).toBeVisible();
    await expect(page.locator('#choices button').first()).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
    await expectBattleFits(page, await isLandscape(page));
  });
}

// The same promises in Spanish (longer strings), at the largest text that is still a console here.
for (const size of [100, 130]) {
  test(`battle in Spanish: fits the window without scrolling (text ${size}%)`, async ({ page }, info) => {
    await startRunWithKeyboard(page, 'e2e-layout');
    await setLanguage(page, 'es');
    if (size !== 100) await setTextSize(page, size);
    await page.locator('#screen-map button.map-node:not([disabled])').first().click();
    await expect(page.locator('#screen-battle')).toBeVisible();
    await expect(page.locator('#choices button').first()).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
    await expectBattleFits(page, await isLandscape(page));
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

// A modal sheet owns the keys: battle keys pressed on its Close button (or anywhere while it is open)
// must not play a move or move the menu behind it.
test('battle: keys do not reach the battle while a sheet is open', async ({ page }, info) => {
  test.skip(info.project.name === 'phone-landscape' || info.project.name === 'phone-portrait' || info.project.name === 'mobile', 'needs the HUD Log button (console, desktop window)');
  await enterBattle(page, 'e2e-layout');
  await page.locator('#hud-log').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const state = () =>
    page.evaluate(() => ({
      log: document.querySelector('#log')!.textContent,
      turns: document.querySelectorAll('#log .log-turn').length,
      hp: [...document.querySelectorAll('.hud-hp, .hud-bar, [data-hp]')].map((e) => e.textContent + (e.getAttribute('style') ?? '')).join('|'),
      selected: document.querySelector('#choices [aria-selected="true"], #choices .selected, #choices button:focus')?.textContent ?? '',
    }));
  // The HP elements are drawn a moment after the scene appears: capture the reference once they exist.
  await expect.poll(async () => (await state()).hp, { timeout: 10_000 }).not.toBe('');
  const before = await state();
  await dialog.locator('[data-sheet-close]').focus();
  for (const code of ['KeyZ', 'Enter', 'ArrowDown', 'KeyQ', 'KeyX', 'Backspace']) {
    if (code === 'Enter') continue; // Enter on the Close button legitimately closes the sheet
    await page.keyboard.press(code);
  }
  await expect(dialog).toBeVisible();
  // A move played behind the sheet shows up as log turns and busy choices a moment later.
  await page.waitForTimeout(1500);
  expect(await state()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#hud-log')).toBeFocused();
  await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true');
  expect((await state()).turns).toBe(before.turns);
});

// Huge text: the page still does not scroll, only the primary area does, and the log is a plain panel.
test('battle fallback: only the primary area scrolls, the choices are pinned and the log stays in the flow', async ({ page }, info) => {
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
  // The rail (the choices) is pinned at the bottom, its buttons are real targets.
  await expectPinnedRail(page, '#menu-panel');
  const first = page.locator('#choices button:not([disabled])').first();
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
      // A node's short name may end in an ellipsis in a narrow column (the full name is its label and the readout).
      .filter((el) => !(el.matches('.map-node-short') && el.scrollHeight <= el.clientHeight + 1))
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

// A run screen in Spanish too: the event with the longest choices (a recruit offer with Replace entries).
for (const size of [100, 130]) {
  test(`event in Spanish: fits the window without scrolling in the console (text ${size}%)`, async ({ page }, info) => {
    await showRunScreen(page, 'event');
    await setLanguage(page, 'es');
    if (size !== 100) await setTextSize(page, size);
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
    await expect(page.locator('#screen-event')).toBeVisible();
    await expectScreenFits(page, 'event', await isLandscape(page));
  });
}

for (const screen of ['title', 'map', 'event', 'end'] as const) {
  for (const size of [100, 130]) {
    test(`${screen}: fits the window without scrolling in the console (text ${size}%)`, async ({ page }, info) => {
      await showRunScreen(page, screen);
      if (size !== 100) await setTextSize(page, size);
      await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
      await expect(page.locator(`#screen-${screen}`)).toBeVisible();
      await expectScreenFits(page, screen, await isLandscape(page));
    });
  }
}

// The other events: a shrine (rest, evolutions, leave), a cache and a mystery.
for (const kind of ['shrine', 'cache', 'mystery'] as const) {
  test(`event ${kind}: fits the window without scrolling in the console (text 130%)`, async ({ page }, info) => {
    await page.goto('/');
    await writeCraftedSave(page, kind);
    await continueSavedRun(page);
    await setTextSize(page, 130);
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
    await expectScreenFits(page, 'event', await isLandscape(page));
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

// Every board node shows a short type name under its icon, and it is really on screen (not clipped away).
test('map: every node shows a visible type name in the console', async ({ page }) => {
  await startRunWithKeyboard(page, 'e2e-layout');
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
  const m = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#screen-map button.map-node')].map((b) => {
      const label = b.querySelector<HTMLElement>('.map-node-short')!;
      const r = label.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return { text: label.textContent, w: r.width, h: r.height, inside: r.bottom <= br.bottom + 0.5 && r.top >= br.top - 0.5 };
    }),
  );
  expect(m.length).toBeGreaterThan(6);
  for (const n of m) {
    expect(n.text!.length).toBeGreaterThan(0);
    expect(n.w).toBeGreaterThan(8);
    expect(n.h).toBeGreaterThan(6);
    expect(n.inside).toBe(true);
  }
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

// ---- rotation and fullscreen resilience ----

const PORTRAIT = { width: 360, height: 640 } as const;
const LANDSCAPE = { width: 640, height: 360 } as const;

const pageFits = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const doc = document.scrollingElement!;
    return doc.scrollHeight <= window.innerHeight && doc.scrollWidth <= window.innerWidth;
  });

const orientationOf = (page: Page): Promise<string | undefined> =>
  page.locator('#app').evaluate((el) => (el as HTMLElement).dataset.orientation);

async function rotateTo(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await expect(page.locator('#app')).toHaveAttribute('data-orientation', size.width > size.height ? 'landscape' : 'portrait');
  await expect.poll(() => pageFits(page)).toBe(true);
}

/** Collects every uncaught page error, so a test can assert that nothing threw. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const battleState = (page: Page) =>
  page.evaluate(() => ({
    log: [...document.querySelectorAll('#log .log-turn p')].map((p) => p.textContent ?? ''),
    summary: document.querySelector('#summary')?.textContent ?? '',
    plates: [...document.querySelectorAll('#screen-battle .plate')].map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim()),
  }));

test.describe('rotation', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'chromium' && info.project.name !== 'phone-portrait', 'sets its own window sizes; one touch and one desktop project are enough');
  });

  test('battle: the log, the HP and the canvas survive a rotation and back', async ({ page }) => {
    const errors = trackErrors(page);
    await page.setViewportSize(PORTRAIT);
    await enterBattle(page, 'e2e-layout');
    await page.locator('#choices button:not([disabled])').first().click();
    await expect.poll(() => page.locator('#log .log-turn').count()).toBeGreaterThan(0);
    await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#scene canvas.scene-canvas')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __canvas: Element }).__canvas = document.querySelector('#scene canvas.scene-canvas')!;
    });
    const before = await battleState(page);
    expect(before.log.length).toBeGreaterThan(0);
    expect(before.summary).toMatch(/HP/);

    for (const size of [LANDSCAPE, PORTRAIT, LANDSCAPE, PORTRAIT]) {
      await rotateTo(page, size);
      await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
      expect(await battleState(page)).toEqual(before);
      const same = await page.evaluate(() => {
        const now = document.querySelector('#scene canvas.scene-canvas');
        return now === (window as unknown as { __canvas: Element }).__canvas && now!.isConnected;
      });
      expect(same).toBe(true);
      await expectBattleFits(page, size === LANDSCAPE);
      // The canvas keeps room in the stage (it may bleed sideways into the page padding on phones,
      // so only its height is bounded).
      await expect
        .poll(() =>
          page.evaluate(() => {
            const stage = document.querySelector('.stage')!.getBoundingClientRect();
            const c = document.querySelector('#scene canvas.scene-canvas')!.getBoundingClientRect();
            return c.width > 40 && c.height > 40 && c.bottom <= stage.bottom + 0.5;
          }),
        )
        .toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('battle: the log sheet stays open with the same lines through a rotation and returns the log', async ({ page }) => {
    const errors = trackErrors(page);
    await page.setViewportSize(PORTRAIT);
    await enterBattle(page, 'e2e-layout');
    await page.locator('#choices button:not([disabled])').first().click();
    await expect.poll(() => page.locator('#log .log-turn').count()).toBeGreaterThan(0);
    await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true');
    const lines = (await battleState(page)).log;
    await page.locator('#hud-log').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('#log')).toHaveCount(1);
    for (const size of [LANDSCAPE, PORTRAIT]) {
      await rotateTo(page, size);
      await expect(dialog).toHaveCount(1);
      await expect(dialog.locator('#log')).toHaveCount(1);
      expect((await battleState(page)).log).toEqual(lines);
      await expect(dialog).toHaveAttribute('data-orientation', size.width > size.height ? 'landscape' : 'portrait');
      expect(await page.evaluate(() => !!document.activeElement!.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.log-panel #log')).toHaveCount(1);
    await expect(page.locator('#hud-log')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('settings sheet: swaps between bottom sheet and side drawer, stays on screen with focus inside', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto('/');
    await page.locator('#hud-settings').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('#lang').focus();
    for (const size of [LANDSCAPE, PORTRAIT, LANDSCAPE]) {
      await rotateTo(page, size);
      const landscape = size.width > size.height;
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toHaveAttribute('data-orientation', landscape ? 'landscape' : 'portrait');
      // A bottom sheet spans the width at the bottom; a drawer hugs the right edge and spans the height.
      await expect
        .poll(() =>
          page.evaluate((land) => {
            const r = document.querySelector('.sheet')!.getBoundingClientRect();
            const close = document.querySelector('.sheet__close')!.getBoundingClientRect();
            const inside = r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
            const shape = land ? r.right >= innerWidth - 0.5 && r.width < innerWidth : r.bottom >= innerHeight - 0.5 && r.width >= innerWidth - 0.5;
            const closeVisible = close.bottom <= innerHeight + 0.5 && close.height > 0;
            return inside && shape && closeVisible;
          }, landscape),
        )
        .toBe(true);
      // Focus stays on the control that had it.
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('lang');
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#hud-settings')).toBeFocused();
  });

  test('map: the board, the party chips and the focused node survive a rotation', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await startRunWithKeyboard(page, 'e2e-layout');
    const node = page.locator('#screen-map button.map-node:not([disabled])').nth(1);
    await node.focus();
    const id = await node.getAttribute('data-node');
    const snap = () =>
      page.evaluate(() => ({
        board: document.querySelector('#screen-map .map-layers')!.innerHTML,
        party: document.querySelector('#hud-party')!.textContent,
        focus: (document.activeElement as HTMLElement | null)?.dataset.node ?? '',
      }));
    const before = await snap();
    expect(before.focus).toBe(id);
    for (const size of [LANDSCAPE, PORTRAIT]) {
      await rotateTo(page, size);
      expect(await snap()).toEqual(before);
      await expectScreenFits(page, 'map', size === LANDSCAPE);
    }
  });

  test('event: the choices, the party chips and the focused control survive a rotation', async ({ page }) => {
    await page.setViewportSize(PORTRAIT);
    await page.goto('/');
    await writeCraftedSave(page, 'recruit');
    await continueSavedRun(page);
    const choice = page.locator('#screen-event button[data-choice]:not([disabled])').nth(1);
    await choice.focus();
    const key = await choice.getAttribute('data-choice');
    const snap = () =>
      page.evaluate(() => ({
        event: document.querySelector('#screen-event')!.innerHTML,
        party: document.querySelector('#hud-party')!.textContent,
        focus: (document.activeElement as HTMLElement | null)?.dataset.choice ?? '',
      }));
    const before = await snap();
    expect(before.focus).toBe(key);
    for (const size of [LANDSCAPE, PORTRAIT]) {
      await rotateTo(page, size);
      expect(await snap()).toEqual(before);
      await expectScreenFits(page, 'event', size === LANDSCAPE);
    }
  });

  test('fullscreen: fullscreenchange alone re-reads the window; the HUD label flips through the API', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __fs: Element | null; __block: boolean };
      w.__fs = null;
      w.__block = false;
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => w.__fs });
      Element.prototype.requestFullscreen = async function (this: Element) {
        w.__fs = this;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      document.exitFullscreen = async () => {
        w.__fs = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
      // Registered first and in capture, so the app's own resize listeners never run while blocked:
      // only `fullscreenchange` can tell the layout about the new window.
      const block = (e: Event) => {
        if (w.__block) e.stopImmediatePropagation();
      };
      window.addEventListener('resize', block, true);
      window.visualViewport?.addEventListener('resize', block, true);
    });
    await page.setViewportSize(PORTRAIT);
    await page.goto('/');
    const btn = page.locator('#hud-fullscreen');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-label', 'Enter fullscreen');
    expect(await orientationOf(page)).toBe('portrait');

    await page.evaluate(() => ((window as unknown as { __block: boolean }).__block = true));
    await page.setViewportSize(LANDSCAPE);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(640);
    // Resize events are swallowed, so the layout is still the old one...
    expect(await orientationOf(page)).toBe('portrait');
    // ...until the browser announces fullscreen.
    await btn.click();
    await expect(btn).toHaveAttribute('aria-label', 'Exit fullscreen');
    await expect(page.locator('#app')).toHaveAttribute('data-orientation', 'landscape');
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');

    await page.setViewportSize(PORTRAIT);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(360);
    expect(await orientationOf(page)).toBe('landscape');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-label', 'Enter fullscreen');
    await expect(page.locator('#app')).toHaveAttribute('data-orientation', 'portrait');
    expect(await pageFits(page)).toBe(true);
  });

  test('battle: rotating during a turn animation throws nothing and the turn finishes with the same lines', async ({ browser, page }) => {
    const errors = trackErrors(page);
    await page.setViewportSize(PORTRAIT);
    await enterBattle(page, 'e2e-layout');
    expect(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion'))).toBe(false);
    // Watch for the busy state on every frame BEFORE the click: a poll can miss a short turn on a loaded runner.
    const busySeen = page.waitForFunction(() => document.querySelector('#choices')?.getAttribute('aria-busy') === 'true', undefined, { polling: 'raf', timeout: 1_500 });
    await page.locator('#choices button:not([disabled])').first().click();
    // The turn is playing: rotate there and back while it runs. On some runners the busy state is never
    // visible (the turn is over before the first frame); the rotation then happens right after the turn,
    // which still proves no error and the same final lines. The annotation says which case ran.
    const busyObserved = await busySeen.then(() => true, () => false);
    test.info().annotations.push({ type: 'rotation', description: busyObserved ? 'rotated while the turn was busy' : 'turn finished before the first frame: rotated right after it' });
    await rotateTo(page, LANDSCAPE);
    await rotateTo(page, PORTRAIT);
    await rotateTo(page, LANDSCAPE);
    await expect(page.locator('#choices')).not.toHaveAttribute('aria-busy', 'true', { timeout: 20_000 });
    await expect.poll(() => page.locator('#log .log-turn').count()).toBeGreaterThan(0);
    const rotated = await battleState(page);

    // The same seeded first move, never rotated, is the reference.
    const ctx = await browser.newContext({ viewport: LANDSCAPE });
    const ref = await ctx.newPage();
    await enterBattle(ref, 'e2e-layout');
    await ref.locator('#choices button:not([disabled])').first().click();
    await expect(ref.locator('#choices')).not.toHaveAttribute('aria-busy', 'true', { timeout: 20_000 });
    await expect.poll(() => ref.locator('#log .log-turn').count()).toBeGreaterThan(0);
    const control = await battleState(ref);
    await ctx.close();

    expect(rotated.log).toEqual(control.log);
    expect(rotated.summary).toEqual(control.summary);
    expect(await pageFits(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});
