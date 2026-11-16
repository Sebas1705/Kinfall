import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function openBattle(page: Page, lang: 'en' | 'es', textSize: number): Promise<void> {
  await page.goto('/?mode=battle&seed=a11y');
  // Wait for the page script to wire the settings before using them.
  await expect(page.locator('#choices button').first()).toBeVisible();
  await page.selectOption('#lang', lang);
  await page.locator('#text-size').evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, textSize);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

const sizes = [
  { name: '320px', width: 320, height: 640 },
  { name: '1000px', width: 1000, height: 800 },
];

for (const scheme of ['light', 'dark'] as const) {
  for (const lang of ['en', 'es'] as const) {
    for (const size of sizes) {
      test(`axe: ${scheme}, ${lang}, ${size.name}, text 150%`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.emulateMedia({ colorScheme: scheme });
        await openBattle(page, lang, 150);
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        ).toEqual([]);
      });
    }
  }
}

for (const textSize of [80, 100, 150]) {
  for (const lang of ['en', 'es'] as const) {
    test(`320px: no horizontal overflow and 44px targets (${lang}, text ${textSize}%)`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openBattle(page, lang, textSize);

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.doc).toBeLessThanOrEqual(0);
      expect(overflow.body).toBeLessThanOrEqual(0);

      const small = await page.evaluate(() => {
        const sel = 'button, select, input, a[href], [role="button"], [tabindex]:not([tabindex="-1"])';
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (el.closest('[hidden]')) continue;
          // The log is a scroll region that is focusable for keyboard scrolling, not a control.
          if (el.id === 'log') continue;
          // A checkbox shares its hit area with its label; measure the larger box.
          let r = el.getBoundingClientRect();
          const label = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.closest('label') : null;
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
      expect(small).toEqual([]);
    });
  }
}
