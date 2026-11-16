import AxeBuilder from '@axe-core/playwright';
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { continueSavedRun, expect, setLanguage, setTextSize, startRunWithKeyboard, writeCraftedSave } from './run-helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'];

const NODE_LABELS = {
  en: { wild: 'Wild creature', elite: 'Elite foe', shrine: 'Shrine', cache: 'Cache', mystery: 'Mystery', boss: 'Boss' },
  es: { wild: 'Criatura salvaje', elite: 'Rival de élite', shrine: 'Santuario', cache: 'Alijo', mystery: 'Misterio', boss: 'Jefe' },
} as const;

const sizes = [
  { name: '320px', width: 320, height: 640 },
  { name: '1000px', width: 1000, height: 800 },
];

async function expectNoAxeViolations(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    where,
  ).toEqual([]);
}

async function expectNoOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.doc, where).toBeLessThanOrEqual(0);
  expect(overflow.body, where).toBeLessThanOrEqual(0);
}

/** Every visible interactive element is at least 44x44 CSS px (measured as in the phase-1 spec). */
async function expectTargets(page: Page, where: string): Promise<void> {
  const small = await page.evaluate(() => {
    const sel = 'button, select, input, a[href], [role="button"], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.closest('[hidden]')) continue;
      // The logs are scroll regions that are focusable for keyboard scrolling, not controls.
      if (el.getAttribute('role') === 'log') continue;
      // A checkbox or radio shares its hit area with its label; measure the larger box.
      let r = el.getBoundingClientRect();
      const label =
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? el.closest('label') : null;
      if (label) {
        const lr = label.getBoundingClientRect();
        if (lr.width * lr.height > r.width * r.height) r = lr;
      }
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 43.5 || r.height < 43.5) {
        out.push(`${el.tagName.toLowerCase()}#${el.id || el.className} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
      }
    }
    return out;
  });
  expect(small, where).toEqual([]);
}

async function checkScreen(page: Page, where: string, width: number): Promise<void> {
  await expectNoAxeViolations(page, where);
  await expectNoOverflow(page, where);
  if (width === 320) await expectTargets(page, where);
}

for (const scheme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'es'] as const) {
    for (const size of sizes) {
      test(`run screens: ${scheme}, ${lang}, ${size.name}, text 150%`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/?seed=a11y-run');
        await expect(page.locator('#screen-title [data-action="new-run"]')).toBeVisible();
        // Language and text size persist in this browser, so they survive the reloads below.
        await setLanguage(page, lang);
        await setTextSize(page, 150);

        await checkScreen(page, `title (${lang})`, size.width);

        // Title -> map: focus on the map heading; every node names its type in text.
        await startRunWithKeyboard(page, 'a11y-run');
        await expect(page.locator('#screen-map [data-screen-heading]')).toBeFocused();
        const nodes = page.locator('#screen-map button.map-node');
        expect(await nodes.count()).toBeGreaterThan(6);
        for (const node of await nodes.all()) {
          const type = (await node.getAttribute('data-type')) as keyof (typeof NODE_LABELS)['en'];
          expect(Object.keys(NODE_LABELS[lang])).toContain(type);
          await expect(node).toHaveAccessibleName(new RegExp(`^${NODE_LABELS[lang][type]}: `));
        }
        await checkScreen(page, `map (${lang})`, size.width);
        // The abandon confirmation is part of the map too.
        await page.locator('#screen-map [data-action="abandon"]').click();
        await checkScreen(page, `map with abandon confirm (${lang})`, size.width);

        // Event screens (crafted saves): focus on the initial choice of the new screen.
        for (const kind of ['recruit', 'shrine'] as const) {
          await writeCraftedSave(page, kind);
          await continueSavedRun(page);
          await expect(page.locator('#screen-event')).toBeVisible();
          await expect(page.locator('#screen-event button[data-initial]')).toBeFocused();
          await checkScreen(page, `${kind} (${lang})`, size.width);
        }

        // Won end screen: focus on the result heading.
        await writeCraftedSave(page, 'won');
        await continueSavedRun(page);
        await expect(page.locator('#screen-end [data-screen-heading]')).toBeFocused();
        await checkScreen(page, `end (${lang})`, size.width);

        // End -> New run -> title: focus on the title heading.
        await page.locator('#screen-end [data-choice="new-run"]').click();
        await expect(page.locator('#screen-title [data-screen-heading]')).toBeFocused();
      });
    }
  }
}

test('the screen announcement and document title follow every route change', async ({ page }) => {
  await page.goto('/?seed=a11y-route');
  await expect(page.locator('#screen-title [data-action="new-run"]')).toBeVisible();
  await expect(page).toHaveTitle('Start · Echo battle');
  await startRunWithKeyboard(page, 'a11y-route');
  await expect(page).toHaveTitle('Map · Echo battle');
  await expect(page.locator('[data-announcer]')).toHaveText('Map');
  await page.locator('#screen-map button.map-node:not([disabled])').first().click();
  await expect(page).toHaveTitle(/^(Battle|Event) · Echo battle$/);
});
