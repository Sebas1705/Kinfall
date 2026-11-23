import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setLanguage, setTextSize, tabTo } from './run-helpers';

const hub = (page: Page) => page.locator('#screen-hub');
const titleHeading = (page: Page) => page.locator('#screen-title [data-screen-heading]');

/** Waits for the hub to be rendered (the route shows it a tick after the script runs). */
async function openHub(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await expect(hub(page)).toBeVisible();
  await expect(page.locator('.hub-card[data-game="kinfall"]')).toBeVisible();
}

/** The hub fits its window: the page does not scroll and no card or Play button is clipped. */
async function expectHubFits(page: Page, where: string): Promise<void> {
  const m = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const outside = [...document.querySelectorAll<HTMLElement>('.hub-card, #hub-play')]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5;
      })
      .map((el) => `${el.id || el.getAttribute('data-game')}`);
    // A box that clips its content (overflow hidden) hides text that did not fit.
    const clipped = [...document.querySelectorAll<HTMLElement>('#screen-hub, #screen-hub *')]
      .filter((el) => el.getClientRects().length > 0 && el.clientWidth > 2 && el.clientHeight > 2)
      .filter((el) => getComputedStyle(el).overflow !== 'visible')
      .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.id || el.className}: ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`);
    return { scrollHeight: doc.scrollHeight, scrollWidth: doc.scrollWidth, innerHeight, innerWidth, outside, clipped };
  });
  expect(m.scrollHeight, where).toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollWidth, where).toBeLessThanOrEqual(m.innerWidth);
  expect(m.outside, where).toEqual([]);
  expect(m.clipped, where).toEqual([]);
}

// The windows the console is designed for, in both languages and at 100% and 130% text.
const windows = [
  { name: '640x360', width: 640, height: 360, landscape: true },
  { name: '360x640', width: 360, height: 640, landscape: false },
] as const;

for (const win of windows) {
  for (const lang of ['en', 'es'] as const) {
    for (const size of [100, 130]) {
      test(`hub ${win.name} ${lang} text ${size}%: fits the console without scrolling or clipping`, async ({ page }, info) => {
        test.skip(info.project.name !== 'chromium', 'sets its own window');
        await page.setViewportSize({ width: win.width, height: win.height });
        await openHub(page);
        if (lang === 'es') await setLanguage(page, 'es');
        if (size !== 100) await setTextSize(page, size);
        await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
        await expect(page.locator('#app')).toHaveAttribute('data-orientation', win.landscape ? 'landscape' : 'portrait');
        await expectHubFits(page, `${win.name} ${lang} ${size}%`);
        // Landscape: cards side by side with the rail (Play) to their right. Portrait: cards
        // stacked, Play in the actions band under them.
        const g = await page.evaluate(() => {
          const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const cards = [...document.querySelectorAll('.hub-card')].map((c) => c.getBoundingClientRect());
          return { cards: cards.map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })), play: rect('#hub-play') };
        });
        const [a, b] = g.cards;
        if (win.landscape) {
          expect(b!.l).toBeGreaterThanOrEqual(a!.r - 1);
          expect(g.play.left).toBeGreaterThanOrEqual(Math.max(...g.cards.map((c) => c.r)) - 1);
        } else {
          expect(b!.t).toBeGreaterThanOrEqual(a!.b - 1);
          expect(g.play.top).toBeGreaterThanOrEqual(Math.max(...g.cards.map((c) => c.b)) - 1);
        }
      });
    }
  }
}

// Every local project at its own window: the hub fits there too.
test('hub fits the project window without scrolling or clipping', async ({ page }) => {
  await openHub(page);
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'console');
  await expectHubFits(page, 'project window');
});

test('hub: targets are at least 44 px', async ({ page }) => {
  await openHub(page);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hub-card, #hub-play')]
      .map((el) => ({ id: el.id || el.getAttribute('data-game'), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
      .map(({ id, r }) => `${id} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`),
  );
  expect(small).toEqual([]);
});

test('hub: keyboard reaches the cards then Play, Enter starts Kinfall and Games brings the hub back', async ({ page }) => {
  await openHub(page);
  const card = page.locator('.hub-card[data-game="kinfall"]');
  await tabTo(page, card);
  await expect(card).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  await expect(page.locator('#hub-play')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(titleHeading(page)).toBeVisible();
  await expect(hub(page)).toBeHidden();

  const games = page.locator('#hud-games');
  await expect(games).toBeVisible();
  await games.click();
  await expect(hub(page)).toBeVisible();
  await expect(page.locator('.hub-card[data-game="kinfall"]')).toHaveAttribute('aria-checked', 'true');
});

test('hub: Enter on the focused Kinfall card starts it', async ({ page }) => {
  await openHub(page);
  await tabTo(page, page.locator('.hub-card[data-game="kinfall"]'));
  await page.keyboard.press('Enter');
  await expect(titleHeading(page)).toBeVisible();
});

test('hub: a soon card with Enter keeps the hub and announces in the live region', async ({ page }) => {
  await openHub(page);
  const kinfall = page.locator('.hub-card[data-game="kinfall"]');
  await tabTo(page, kinfall);
  await page.keyboard.press('ArrowRight');
  const simulator = page.locator('.hub-card[data-game="simulator"]');
  await expect(simulator).toBeFocused();
  await expect(simulator).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(hub(page)).toBeVisible();
  await expect(titleHeading(page)).toBeHidden();
  await expect(page.locator('[data-announcer]')).toHaveText('Simulator is coming soon.');
});

test('hub: ?game=kinfall and ?seed=ABC start at Kinfall\'s title, ?game=nope shows the hub', async ({ page }) => {
  await page.goto('/?game=kinfall');
  await expect(titleHeading(page)).toBeVisible();
  await expect(hub(page)).toBeHidden();
  await page.goto('/?seed=ABC');
  await expect(titleHeading(page)).toBeVisible();
  await expect(page.locator('#title-seed')).toHaveValue('ABC');
  await page.goto('/?game=nope');
  await expect(hub(page)).toBeVisible();
  await expect(titleHeading(page)).toBeHidden();
});

test('hub: a stored soon game focuses Kinfall', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kinfall.lastGame', 'simulator'));
  await openHub(page);
  await expect(page.locator('.hub-card[data-game="kinfall"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.hub-card[data-game="simulator"]')).toHaveAttribute('aria-checked', 'false');
});

test('hub: Play remembers the game and the hub focuses it next time', async ({ page }) => {
  await openHub(page);
  await page.locator('#hub-play').click();
  await expect(titleHeading(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kinfall.lastGame'))).toBe('kinfall');
});

test('hub: still works when storage access throws', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('storage blocked');
    };
  });
  await openHub(page);
  await expect(page.locator('.hub-card[data-game="kinfall"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#hub-play').click();
  await expect(titleHeading(page)).toBeVisible();
});

// The web slider tops out at 150%, so the fallback is reached with a window under the hub budget at that
// scale: 640x320 is 213 text-sized px (budget 235) and 360x480 is 320 (budget 365). The 200% row is
// covered by the core layout matrix.
const fallbackWindows = [
  { name: '640x320', width: 640, height: 320 },
  { name: '360x480', width: 360, height: 480 },
] as const;
for (const win of fallbackWindows) {
  test(`hub ${win.name} at text 150% (fallback): Play is reachable by scrolling and the page does not scroll`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'sets its own window');
    await page.setViewportSize({ width: win.width, height: win.height });
    await openHub(page);
    await setTextSize(page, 150);
    await expectFallbackPlay(page);
  });
}

async function expectFallbackPlay(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'fallback');
  const play = page.locator('#hub-play');
  await play.scrollIntoViewIfNeeded();
  const m = await page.evaluate(() => {
    const r = document.querySelector('#hub-play')!.getBoundingClientRect();
    const doc = document.scrollingElement!;
    return { top: r.top, bottom: r.bottom, innerHeight, docScroll: doc.scrollHeight };
  });
  expect(m.top).toBeGreaterThanOrEqual(-0.5);
  expect(m.bottom).toBeLessThanOrEqual(m.innerHeight + 0.5);
  expect(m.docScroll).toBeLessThanOrEqual(m.innerHeight);
  await play.click();
  await expect(titleHeading(page)).toBeVisible();
}
