// Default page: the run flow (title, map, battle, events and the end screen).
import { CONTENT } from '@webgames/core/content';
import { getLang, setLang } from '@webgames/core/platform/i18n';
import { createRunStorage, defaultStorage } from '@webgames/core/platform/runStorage';
import { createBattleDom } from './battleDom';
import { createBattleController } from './controller';
import { lazyBattleView } from './lazyView';
import { createRouter } from './router';
import { createRunController } from './runController';
import { createRunUi } from './runUi';
import { bindScreenInput } from './screenInput';
import { initialSeed, randomSeed } from './screens/title';
import { applyI18nAttributes, byId, wireTextSize } from './settings';

export function startRunPage(): void {
  const root = byId<HTMLElement>('screens');
  const router = createRouter(root);
  const ui = createRunUi({
    title: byId('screen-title'),
    map: byId('screen-map'),
    event: byId('screen-event'),
    end: byId('screen-end'),
    battleFooter: byId('battle-footer'),
    warning: byId('save-warning'),
    log: byId('run-log-panel'),
    seed: byId('seed'),
  });

  // Reduced motion: follows the system and the toggle; screens read the class on <html>.
  const motionToggle = byId<HTMLInputElement>('reduce-motion');
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const applyMotion = (on: boolean) => {
    motionToggle.checked = on;
    document.documentElement.classList.toggle('reduce-motion', on);
  };
  applyMotion(motionQuery?.matches ?? false);
  motionToggle.addEventListener('change', () => applyMotion(motionToggle.checked));
  motionQuery?.addEventListener?.('change', (e) => applyMotion(e.matches));

  // Battle screen: keys and the on-screen pad act only while it is the visible screen, so Escape or
  // Enter on the map, an event or the title never reaches the battle, and arrows still scroll there.
  const battleSection = byId<HTMLElement>('screen-battle');
  const dom = createBattleDom(CONTENT, (onAction) => {
    bindScreenInput(battleSection, router, 'battle', onAction);
  });
  // The footer's keys belong to the button and its confirmation: the battle input layer (a window
  // listener) must not see them, so Escape or arrows there never move the battle selection.
  byId('battle-footer').addEventListener('keydown', (e) => e.stopPropagation());
  const view = lazyBattleView(
    () => import('./battleView').then((m) => m.createBattleView(byId('scene'))),
    (err) => {
      // No WebGL or canvas: the battle stays playable from the text summary, log and menu.
      console.warn('battle scene unavailable', err);
      dom.sceneUnavailable();
    },
  );

  const controller = createRunController({
    content: CONTENT,
    storage: createRunStorage(defaultStorage(), CONTENT),
    router,
    ui,
    newSeed: () => initialSeed(location.search),
    freshSeed: randomSeed,
    createBattle: (hooks) =>
      createBattleController({
        content: CONTENT,
        view,
        ui: dom.ui,
        timers: {
          setTimeout: (fn, ms) => window.setTimeout(fn, ms),
          clearTimeout: (h) => window.clearTimeout(h as number),
        },
        reducedMotion: () => motionToggle.checked,
        ...hooks,
      }),
  });

  wireTextSize(() => controller.refreshText());

  const langSelect = byId<HTMLSelectElement>('lang');
  langSelect.value = getLang();
  langSelect.addEventListener('change', () => {
    setLang(langSelect.value === 'es' ? 'es' : 'en');
    applyI18nAttributes();
    controller.refreshText();
  });

  applyI18nAttributes();
  controller.showTitle({ focus: false });
}
