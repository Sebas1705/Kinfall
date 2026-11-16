// Shared helpers for the run e2e specs. Tests drive the UI like a player (no test hook in the app);
// crafted saves are built inside the page from the real sim modules served by the dev server.
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export const SAVE_KEY = 'webgames.run.v1';
/** Upper bound on player actions in one run played by the test policy. */
export const MAX_ACTIONS = 400;

export type Screen = 'title' | 'map' | 'battle' | 'event' | 'end';
export type CraftKind = 'recruit' | 'shrine' | 'cache' | 'mystery' | 'won';

export const visibleScreen = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('[data-screen]:not([hidden])')?.getAttribute('data-screen') ?? '');

/** The control the test policy takes on each screen: always the first enabled choice. */
export function policyTarget(page: Page, screen: string): Locator | null {
  if (screen === 'map') return page.locator('#screen-map button.map-node:not([disabled])').first();
  if (screen === 'battle') return page.locator('#choices button:not([disabled])').first();
  if (screen === 'event') return page.locator('#screen-event button[data-choice]:not([disabled])').first();
  return null;
}

/**
 * Moves focus to `target` with Tab (or Shift+Tab when the target comes before the focused control)
 * only, bounded, as a keyboard player would.
 */
export async function tabTo(page: Page, target: Locator, maxTabs = 60): Promise<void> {
  const handle = await target.elementHandle();
  if (!handle) throw new Error('tab target is missing');
  for (let i = 0; i <= maxTabs; i++) {
    const where = await handle.evaluate((el) => {
      const active = document.activeElement;
      if (el === active) return 'here';
      if (!active || active === document.body) return 'after';
      return active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING ? 'before' : 'after';
    });
    if (where === 'here') return;
    await page.keyboard.press(where === 'before' ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`could not reach the target with ${maxTabs} Tab presses`);
}

interface Snapshot {
  screen: string;
  turns: number;
  busy: boolean;
}

const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => ({
    screen: document.querySelector('[data-screen]:not([hidden])')?.getAttribute('data-screen') ?? '',
    turns: document.querySelectorAll('#log .log-turn').length,
    busy: document.querySelector('#choices')?.getAttribute('aria-busy') === 'true',
  }));

/** Waits until the action taken from `before` has been applied and the UI is idle again. */
async function waitApplied(page: Page, before: Snapshot): Promise<void> {
  await expect
    .poll(
      async () => {
        const now = await snapshot(page);
        if (now.busy) return false;
        return now.screen !== before.screen || now.turns > before.turns;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** A finished battle stays on screen (no enabled choice) until its play settles; wait for the next screen. */
async function waitBattleLeft(page: Page): Promise<void> {
  await expect.poll(() => visibleScreen(page), { timeout: 15_000 }).not.toBe('battle');
}

export interface PlayOptions {
  /** Called after every applied action; return true to stop playing there. */
  after?: (info: { screen: string; actions: number }) => Promise<boolean>;
}

/**
 * Plays from the current screen with the keyboard only (Tab to the policy's choice, Enter) until the
 * end screen, or until `after` asks to stop. Returns the number of actions taken by this call.
 */
export async function playWithKeyboard(page: Page, options: PlayOptions = {}): Promise<number> {
  let actions = 0;
  while (actions <= MAX_ACTIONS) {
    const screen = await visibleScreen(page);
    if (screen === 'end') return actions;
    const target = policyTarget(page, screen);
    if (!target) throw new Error(`unexpected screen while playing: "${screen}"`);
    if (screen === 'battle' && (await target.count()) === 0) {
      await waitBattleLeft(page);
      continue;
    }
    await expect(target).toBeVisible();
    await expect(target).toBeEnabled();
    const before = await snapshot(page);
    await tabTo(page, target);
    await page.keyboard.press('Enter');
    actions++;
    await waitApplied(page, before);
    if (options.after && (await options.after({ screen: await visibleScreen(page), actions }))) return actions;
  }
  throw new Error(`the run took more than ${MAX_ACTIONS} actions`);
}

/** Opens the title screen with a fixed seed and starts a run with the first starter, by keyboard. */
export async function startRunWithKeyboard(page: Page, seed: string): Promise<void> {
  await page.goto(`/?seed=${encodeURIComponent(seed)}`);
  const newRun = page.locator('#screen-title [data-action="new-run"]');
  await expect(newRun).toBeVisible();
  await expect(page.locator('#title-seed')).toHaveValue(seed);
  await expect(page.locator('#screen-title input[name="starter"]').first()).toBeChecked();
  await tabTo(page, newRun);
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-map')).toBeVisible();
}

export async function setLanguage(page: Page, lang: 'en' | 'es'): Promise<void> {
  await page.selectOption('#lang', lang);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

export async function setTextSize(page: Page, size: number): Promise<void> {
  await page.locator('#text-size').evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, size);
  await expect(page.locator('#text-size-value')).toHaveText(`${size}%`);
}

/**
 * Builds a valid saved run of the given kind inside the page with the real sim modules, checks
 * that the codec accepts it and writes it to the save slot. The party is the three starters (full)
 * at half HP, with 9 souls, so recruit offers Replace entries and the shrine can heal and evolve.
 * `souls` overrides the souls; `evolvedFirst` replaces the first member by its evolved form (which
 * cannot evolve again).
 */
export interface CraftOptions {
  seed?: string;
  souls?: number;
  evolvedFirst?: boolean;
}

export async function writeCraftedSave(page: Page, kind: CraftKind, options: CraftOptions = {}): Promise<void> {
  const { seed = 'crafted-1', souls = 9, evolvedFirst = false } = options;
  const error = await page.evaluate(
    async ({ kind, seed, key, souls, evolvedFirst }) => {
      // Variable specifiers keep TypeScript from resolving these browser-side dev-server paths.
      const paths = ['/src/content/index.ts', '/src/sim/run/run.ts', '/src/sim/run/encounters.ts', '/src/sim/run/codec.ts'];
      const [{ CONTENT }, runMod, { buildEncounter }, codec] = await Promise.all(paths.map((p) => import(p)));
      const { startRun, applyRunAction, maxHpOf } = runMod;
      const run = startRun(seed, CONTENT.starters[0], CONTENT);
      run.souls = souls;
      // Hurt members, so resting and the cache heal (and log) something.
      run.party = CONTENT.starters.map((id: string) => ({ speciesId: id, hp: Math.max(1, Math.floor(maxHpOf(id, CONTENT) / 2)) }));
      if (evolvedFirst) {
        const first = CONTENT.species.find((s: { id: string }) => s.id === CONTENT.starters[0]);
        run.party[0] = { speciesId: first.evolvesTo, hp: Math.max(1, Math.floor(maxHpOf(first.evolvesTo, CONTENT) / 2)) };
      }
      let out = null;
      if (kind === 'won') {
        const last = run.maps[2];
        run.zone = 2;
        run.at = last.layers[last.layers.length - 1][0].id;
        run.stats = { nodesCleared: 21, elitesBeaten: 2, bossesBeaten: 3, creaturesLost: 1 };
        run.phase = { kind: 'ended', result: 'won' };
        out = run;
      } else {
        const layers = run.maps[0].layers;
        search: for (let l = 1; l < layers.length; l++) {
          for (const node of layers[l]) {
            if (node.type !== (kind === 'recruit' ? 'wild' : kind)) continue;
            if (kind === 'recruit') {
              // Just after winning this wild node: its creature is offered at half its max hp.
              run.at = node.id;
              run.stats.nodesCleared = l + 1;
              const speciesId = buildEncounter(run, node, CONTENT).enemy.speciesIds[0];
              run.phase = { kind: 'recruit', speciesId, hp: Math.max(1, Math.floor(maxHpOf(speciesId, CONTENT) / 2)) };
              out = run;
            } else {
              // Stand on a predecessor and enter the node through the real state machine.
              const pred = layers[l - 1].find((p: { next: string[] }) => p.next.includes(node.id));
              run.at = pred.id;
              run.stats.nodesCleared = l;
              out = applyRunAction(run, { type: 'node', nodeId: node.id }, CONTENT).run;
            }
            break search;
          }
        }
      }
      if (!out) return `no ${kind} node in zone 1 of seed ${seed}`;
      if (out.phase.kind !== (kind === 'won' ? 'ended' : kind)) return `crafted phase is ${out.phase.kind}`;
      const text = codec.serializeRun(out);
      const check = codec.deserializeRun(text, CONTENT);
      if (!check.ok) return `validator rejected the crafted ${kind} save: ${check.error}`;
      localStorage.setItem(key, text);
      return null;
    },
    { kind, seed, key: SAVE_KEY, souls, evolvedFirst },
  );
  expect(error).toBeNull();
}

/** Reloads the title and continues the saved run (by keyboard). */
export async function continueSavedRun(page: Page): Promise<void> {
  await page.reload();
  const cont = page.locator('#screen-title [data-action="continue"]');
  await expect(cont).toBeEnabled();
  await tabTo(page, cont);
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-title')).toBeHidden();
}

export const readSave = (page: Page): Promise<string | null> => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
