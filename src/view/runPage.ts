// Default page: the run flow (title, map, and in Task 13 battle, events and the end screen).
import { CONTENT } from '../content';
import { getLang, setLang } from '../platform/i18n';
import { createRunStorage, defaultStorage } from '../platform/runStorage';
import { createRouter } from './router';
import { createRunController } from './runController';
import { createRunUi } from './runUi';
import { initialSeed } from './screens/title';
import { applyI18nAttributes, byId, wireTextSize } from './settings';

export function startRunPage(): void {
  const root = byId<HTMLElement>('screens');
  const router = createRouter(root);
  const ui = createRunUi({
    title: byId('screen-title'),
    map: byId('screen-map'),
    event: byId('screen-event'),
    warning: byId('save-warning'),
  });
  const controller = createRunController({
    content: CONTENT,
    storage: createRunStorage(defaultStorage(), CONTENT),
    router,
    ui,
    newSeed: () => initialSeed(location.search),
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

  wireTextSize(() => {});

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
