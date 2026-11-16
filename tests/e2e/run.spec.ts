import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MAX_ACTIONS,
  SAVE_KEY,
  continueSavedRun,
  expect,
  playWithKeyboard,
  readSave,
  setLanguage,
  startRunWithKeyboard,
  tabTo,
  visibleScreen,
  writeCraftedSave,
} from './run-helpers';
import type { CraftKind } from './run-helpers';

// The policy (first enabled choice everywhere) usually loses in zone 1 with the current balance
// (phase 3 work), so the full-run tests accept either result; the won end screen is covered by a
// crafted save below. This seed's run has recruits, swaps and a battle of several turns.
const SEED = 'e2e-run';

/** Result, score and stats as the end screen shows them. */
async function endScreen(page: Page): Promise<{ title: string; score: number; text: string }> {
  const section = page.locator('#screen-end');
  await expect(section).toBeVisible();
  const title = (await section.locator('[data-screen-heading]').innerText()).trim();
  const score = Number(await section.locator('.end-score strong').innerText());
  return { title, score, text: await section.innerText() };
}

/** Battle state as the player sees it: the HP/status summary and the enabled choices. */
async function battleView(page: Page): Promise<{ summary: string; choices: string[] }> {
  await expect(page.locator('#choices button:not([disabled])').first()).toBeVisible();
  const summary = (await page.locator('#summary').textContent()) ?? '';
  const choices = await page.locator('#choices button:not([disabled])').allInnerTexts();
  return { summary, choices };
}

test.describe('run flow', () => {
  test('keyboard only: a whole run reaches the end screen with a result and a score', async ({ page }) => {
    await startRunWithKeyboard(page, SEED);
    // A route change moves focus to the new screen's heading.
    await expect(page.locator('#screen-map [data-screen-heading]')).toBeFocused();
    const actions = await playWithKeyboard(page);
    expect(actions).toBeGreaterThan(0);
    expect(actions).toBeLessThanOrEqual(MAX_ACTIONS);

    const end = await endScreen(page);
    expect(end.title).toMatch(/^[★✕]?\s*Run (won|lost)$/);
    expect(Number.isInteger(end.score) && end.score >= 0).toBe(true);
    await expect(page.locator('#screen-end [data-screen-heading]')).toBeFocused();
    // The run log on the end screen recorded the run.
    expect(await page.locator('#run-log p').count()).toBeGreaterThan(0);
  });

  test('reload mid-battle: Continue resumes the same battle and the run ends exactly as without the reload', async ({ page }) => {
    test.setTimeout(120_000);
    await startRunWithKeyboard(page, SEED);
    await playWithKeyboard(page);
    const uninterrupted = await endScreen(page);
    const uninterruptedSave = await readSave(page);
    expect(uninterruptedSave).not.toBeNull();

    await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    await startRunWithKeyboard(page, SEED);
    let before: { summary: string; choices: string[] } | null = null;
    // Stop right after the first battle turn that leaves the battle running.
    await playWithKeyboard(page, {
      after: async ({ screen }) => {
        if (screen !== 'battle') return false;
        if ((await page.locator('#choices button:not([disabled])').count()) === 0) return false;
        before = await battleView(page);
        return true;
      },
    });
    expect(before, 'the run never had a battle turn that left the battle running').not.toBeNull();

    await continueSavedRun(page);
    await expect(page.locator('#screen-battle')).toBeVisible();
    const after = await battleView(page);
    expect(after.summary.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
    // The battle log starts empty after a resume (ruling), but focus is on the first choice.
    await expect(page.locator('#choices button:not([disabled])').first()).toBeFocused();

    await playWithKeyboard(page);
    const resumed = await endScreen(page);
    expect(resumed.title).toBe(uninterrupted.title);
    expect(resumed.score).toBe(uninterrupted.score);
    expect(resumed.text).toBe(uninterrupted.text);
    // The saved final state (hash-checked by the codec) is byte-identical.
    expect(await readSave(page)).toBe(uninterruptedSave);
  });

  test('a corrupted save shows the notice, disables Continue, and Discard restores a clean title', async ({ page }) => {
    await page.goto('/?seed=e2e-corrupt');
    await expect(page.locator('#screen-title')).toBeVisible();
    await page.evaluate((key) => localStorage.setItem(key, '{"not":"a run'), SAVE_KEY);
    await page.reload();

    const notice = page.locator('#screen-title .notice--warn');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your saved run is damaged and cannot be loaded');
    await expect(page.locator('#screen-title [data-action="continue"]')).toBeDisabled();

    await page.locator('#screen-title [data-action="discard"]').click();
    await expect(page.locator('#screen-title [data-action="discard-cancel"]')).toBeFocused();
    await page.locator('#screen-title [data-action="discard-yes"]').click();

    await expect(page.locator('#screen-title .notice')).toHaveCount(0);
    await expect(page.locator('#screen-title [data-action="continue"]')).toBeDisabled();
    await expect(page.locator('#screen-title [data-action="new-run"]')).toBeEnabled();
    expect(await readSave(page)).toBeNull();
    // A reload confirms the slot is really empty: no notice comes back.
    await page.reload();
    await expect(page.locator('#screen-title [data-action="new-run"]')).toBeVisible();
    await expect(page.locator('#screen-title .notice')).toHaveCount(0);
  });

  test('blocked storage: the run stays playable and the save warning is visible, non-blocking and dismissible', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = function setItem() {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    });
    await startRunWithKeyboard(page, SEED);
    const warning = page.locator('#save-warning .save-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Could not save your run');
    await expect(warning).toContainText('You can keep playing');

    // Play on with the warning showing: up to the first recruit screen or the end.
    await playWithKeyboard(page, { after: async ({ screen }) => screen === 'event' });
    const screen = await visibleScreen(page);
    expect(['event', 'end']).toContain(screen);
    if (screen === 'event') await expect(page.locator('#screen-event [data-screen-heading]')).toHaveText('A creature wants to join');
    await expect(warning).toBeVisible();

    await warning.getByRole('button', { name: 'Dismiss' }).click();
    await expect(warning).toBeHidden();
    expect(await readSave(page)).toBeNull();
  });

  test('abandon clears the save and the title offers a fresh seed', async ({ page }) => {
    await startRunWithKeyboard(page, SEED);
    expect(await readSave(page)).not.toBeNull();

    await page.locator('#screen-map [data-action="abandon"]').click();
    await expect(page.locator('#screen-map [data-action="abandon-no"]')).toBeFocused();
    await page.locator('#screen-map [data-action="abandon-yes"]').click();

    await expect(page.locator('#screen-title')).toBeVisible();
    await expect(page.locator('#screen-title [data-screen-heading]')).toBeFocused();
    expect(await readSave(page)).toBeNull();
    await expect(page.locator('#screen-title [data-action="continue"]')).toBeDisabled();
    const seed = await page.locator('#title-seed').inputValue();
    expect(seed).not.toBe(SEED);
    expect(seed).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
  });

  const EXPECT = {
    en: {
      recruit: 'A creature wants to join',
      shrine: 'A quiet shrine',
      cache: 'A hidden cache',
      mystery: 'A strange glow',
      won: 'Run won',
      zone: /^Zone 1: /,
    },
    es: {
      recruit: 'Una criatura quiere unirse',
      shrine: 'Un santuario tranquilo',
      cache: 'Un alijo escondido',
      mystery: 'Un brillo extraño',
      won: 'Partida ganada',
      zone: /^Zona 1: /,
    },
  } as const;

  for (const lang of ['en', 'es'] as const) {
    test(`crafted saves (${lang}): recruit, shrine, cache and mystery screens play on, and a won run shows its score`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto('/?seed=e2e-crafted');
      await expect(page.locator('#screen-title')).toBeVisible();
      await setLanguage(page, lang);

      for (const kind of ['recruit', 'shrine', 'cache', 'mystery'] as const satisfies readonly CraftKind[]) {
        await writeCraftedSave(page, kind);
        await continueSavedRun(page);
        const section = page.locator('#screen-event');
        await expect(section).toBeVisible();
        await expect(section.locator('[data-screen-heading]')).toHaveText(EXPECT[lang][kind]);
        // Focus lands on the initial choice, never a destructive one.
        const initial = section.locator('button[data-initial]');
        await expect(initial).toBeFocused();
        if (kind === 'recruit') {
          // Full party: a Replace entry per member, and focus on "let it go".
          await expect(section.locator('button[data-choice]')).toHaveCount(4);
          await expect(initial).toHaveText(lang === 'en' ? 'Let it go' : 'Dejarla marchar');
        }
        if (kind === 'shrine') await expect(section.locator('button[data-choice]').first()).toHaveText(/Rest|Descansar/);

        // Take the first enabled choice by keyboard: the run goes back to the map.
        const first = section.locator('button[data-choice]:not([disabled])').first();
        await tabTo(page, first);
        await page.keyboard.press('Enter');
        await expect(page.locator('#screen-map')).toBeVisible();
        await expect(page.locator('#screen-map [data-screen-heading]')).toHaveText(EXPECT[lang].zone);
        expect(await page.locator('#run-log p').count()).toBeGreaterThan(0);
      }

      await writeCraftedSave(page, 'won');
      await continueSavedRun(page);
      const end = await endScreen(page);
      expect(end.title).toContain(EXPECT[lang].won);
      expect(end.score).toBeGreaterThan(0);
      await expect(page.locator('#screen-end [data-screen-heading]')).toBeFocused();
    });
  }
});
