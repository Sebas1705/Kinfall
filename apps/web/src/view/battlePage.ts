// Phase-1 demo battle page (`?mode=battle`): settings, the DOM facade and the PixiJS scene around
// the turn controller (src/view/controller.ts), which owns the pick -> applyAction -> play -> rebuild cycle.
import { CONTENT } from '@webgames/core/content';
import { getLang, setLang, t } from '@webgames/core/platform/i18n';
import { createInput } from '../platform/input';
import { createBattle } from '@webgames/core/sim/battle';
import { createBattleDom } from './battleDom';
import { createBattleView } from './battleView';
import type { BattleView } from './battleView';
import { createBattleController } from './controller';
import { demoTeams } from './demo';
import { isolateScreen } from './router';
import { applyI18nAttributes, byId, wireTextSize } from './settings';

export async function startBattlePage(): Promise<void> {
  isolateScreen(byId<HTMLElement>('screens'), 'battle');

  const scene = byId<HTMLDivElement>('scene');
  const newBattle = byId<HTMLButtonElement>('new-battle');
  const langSelect = byId<HTMLSelectElement>('lang');
  const motionToggle = byId<HTMLInputElement>('reduce-motion');
  const seedLine = byId<HTMLParagraphElement>('seed');

  const baseSeed = new URLSearchParams(location.search).get('seed') ?? 'demo';
  // Battle n uses the base seed for n = 1 and `${seed}#n` after that, so every battle is reproducible.
  const seedFor = (n: number) => (n <= 1 ? baseSeed : `${baseSeed}#${n}`);

  const dom = createBattleDom(CONTENT, (onAction) => {
    createInput(document.body, onAction);
  });

  // ---- scene ----
  let view: BattleView | null = null;
  try {
    view = await createBattleView(scene);
  } catch (err) {
    // No WebGL or canvas: the battle stays playable from the text summary, log and menu.
    console.warn('battle scene unavailable', err);
    dom.sceneUnavailable();
  }

  // ---- settings ----
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery?.matches ?? false;
  motionToggle.checked = reducedMotion;
  motionToggle.addEventListener('change', () => {
    reducedMotion = motionToggle.checked;
  });
  motionQuery?.addEventListener?.('change', (e) => {
    reducedMotion = e.matches;
    motionToggle.checked = e.matches;
  });

  const controller = createBattleController({
    content: CONTENT,
    view,
    ui: dom.ui,
    timers: {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (h) => window.clearTimeout(h as number),
    },
    reducedMotion: () => reducedMotion,
    newBattle(n) {
      const seed = seedFor(n);
      const { player, enemy } = demoTeams(seed, CONTENT);
      seedLine.textContent = t('battle.seed', { seed });
      return createBattle(seed, player, enemy, CONTENT, { telegraph: true });
    },
  });

  // Static labels and <html lang> only; the controller decides when the log, menu and scene rebuild.
  const applyStaticText = () => {
    document.title = t('app.title');
    applyI18nAttributes();
    seedLine.textContent = t('battle.seed', { seed: seedFor(controller.getBattleNo()) });
  };

  wireTextSize(() => controller.refreshText());

  langSelect.value = getLang();
  langSelect.addEventListener('change', () => {
    setLang(langSelect.value === 'es' ? 'es' : 'en');
    applyStaticText();
    controller.refreshText();
  });

  newBattle.addEventListener('click', () => controller.start());

  controller.start();
  applyStaticText();
}
