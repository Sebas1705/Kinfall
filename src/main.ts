// Page wiring: settings, the DOM facade and the PixiJS scene around the turn controller
// (src/view/controller.ts), which owns the pick -> applyAction -> play -> rebuild cycle.
import './styles.css';
import { CONTENT } from './content';
import { lookup } from './content/lookup';
import { detectLang, getLang, setLang, speciesName, t } from './platform/i18n';
import type { StringKey } from './platform/i18n';
import { createInput } from './platform/input';
import type { GameAction } from './platform/input';
import { createBattle } from './sim/battle';
import type { BattleState, Side } from './sim/state';
import { createBattleView } from './view/battleView';
import type { BattleView } from './view/battleView';
import { createBattleController } from './view/controller';
import type { BattleUi } from './view/controller';
import { demoTeams } from './view/demo';
import { renderMenu } from './view/menu';

const TEXT_SIZE_KEY = 'webgames.textSize';
const TEXT_SIZES = { min: 80, max: 150, step: 10 };

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function readTextSize(): number {
  try {
    const v = Number(localStorage.getItem(TEXT_SIZE_KEY));
    if (Number.isInteger(v) && v >= TEXT_SIZES.min && v <= TEXT_SIZES.max && v % TEXT_SIZES.step === 0) return v;
  } catch {
    // storage unavailable: use the default
  }
  return 100;
}

function storeTextSize(v: number): void {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, String(v));
  } catch {
    // storage unavailable or full: the setting just won't persist
  }
}

async function main(): Promise<void> {
  setLang(detectLang());

  const scene = byId<HTMLDivElement>('scene');
  const summary = byId<HTMLParagraphElement>('summary');
  const log = byId<HTMLDivElement>('log');
  const prompt = byId<HTMLHeadingElement>('prompt');
  const intent = byId<HTMLParagraphElement>('intent');
  const choices = byId<HTMLDivElement>('choices');
  const result = byId<HTMLDivElement>('result');
  const resultTitle = byId<HTMLHeadingElement>('result-title');
  const resultNote = byId<HTMLParagraphElement>('result-note');
  const newBattle = byId<HTMLButtonElement>('new-battle');
  const langSelect = byId<HTMLSelectElement>('lang');
  const motionToggle = byId<HTMLInputElement>('reduce-motion');
  const textSize = byId<HTMLInputElement>('text-size');
  const textSizeValue = byId<HTMLOutputElement>('text-size-value');
  const dpad = byId<HTMLElement>('dpad');
  const seedLine = byId<HTMLParagraphElement>('seed');

  const baseSeed = new URLSearchParams(location.search).get('seed') ?? 'demo';
  // Battle n uses the base seed for n = 1 and `${seed}#n` after that, so every battle is reproducible.
  const seedFor = (n: number) => (n <= 1 ? baseSeed : `${baseSeed}#${n}`);

  // ---- scene ----
  let view: BattleView | null = null;
  try {
    view = await createBattleView(scene);
  } catch (err) {
    // No WebGL or canvas: the battle stays playable from the text summary, log and menu.
    console.warn('battle scene unavailable', err);
    scene.hidden = true;
    summary.classList.remove('sr-only');
  }

  // ---- DOM facade ----
  let buttons: HTMLButtonElement[] = [];
  let selected = 0;
  const enabledButtons = () => buttons.filter((b) => !b.disabled && b.isConnected);

  const select = (index: number, focus: boolean) => {
    const enabled = enabledButtons();
    if (enabled.length === 0) return;
    selected = ((index % enabled.length) + enabled.length) % enabled.length;
    for (const b of buttons) b.classList.toggle('selected', b === enabled[selected]);
    if (focus) enabled[selected]!.focus();
  };

  const turnNode = (lines: string[]): HTMLElement => {
    const turn = document.createElement('div');
    turn.className = 'log-turn';
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      turn.append(p);
    }
    return turn;
  };

  const sideSummary = (state: BattleState, side: Side): string => {
    const c = state.teams[side][state.active[side]];
    const sp = c && lookup(CONTENT).species(c.speciesId);
    if (!c || !sp) return '';
    const line = t('hud.summary', {
      side: t(side === 'player' ? 'hud.player' : 'hud.enemy'),
      species: speciesName(sp),
      elements: sp.elements.map((el) => t(`element.${el}`)).join(' / '),
      hp: c.hp,
      maxHp: c.maxHp,
      focus: c.focus,
      maxFocus: c.maxFocus,
    });
    return c.status ? `${line} ${t(`status.${c.status.id}`)}.` : line;
  };

  const ui: BattleUi = {
    bindInput(onAction) {
      createInput(document.body, onAction);
    },
    setBusy(busy) {
      choices.classList.toggle('busy', busy);
      if (busy) choices.setAttribute('aria-busy', 'true');
      else choices.removeAttribute('aria-busy');
    },
    appendLog(lines) {
      log.append(turnNode(lines));
      log.scrollTop = log.scrollHeight;
    },
    replaceLog(turns) {
      // A rebuild (new battle or language change) must not make screen readers reread everything.
      log.setAttribute('aria-live', 'off');
      log.replaceChildren(...turns.filter((l) => l.length > 0).map(turnNode));
      log.scrollTop = log.scrollHeight;
      requestAnimationFrame(() => log.setAttribute('aria-live', 'polite'));
    },
    showChoices(state, model, onPick, focusFirst) {
      const hadFocus = choices.contains(document.activeElement);
      const lines = [sideSummary(state, 'player'), sideSummary(state, 'enemy'), model.intent ?? ''];
      summary.textContent = lines.filter(Boolean).join('\n');
      prompt.textContent = model.prompt;
      intent.textContent = model.intent ?? '';
      buttons = renderMenu(choices, model, onPick);
      select(focusFirst ? 0 : selected, focusFirst || hadFocus);
    },
    showResult(res, focus) {
      result.hidden = res === null;
      if (!res) return;
      const win = res.winner === 'player';
      resultTitle.textContent = t(win ? 'result.victory' : 'result.defeat');
      resultTitle.className = `result-title ${win ? 'win' : 'lose'}`;
      resultNote.textContent = res.lossNote ? t('battle.lossReminder') : '';
      if (focus) newBattle.focus();
    },
    navigate(a: GameAction) {
      const enabled = enabledButtons();
      if (enabled.length === 0) return;
      const focused = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const current = focused >= 0 ? focused : selected;
      if (a === 'up' || a === 'left') select(current - 1, true);
      else if (a === 'down' || a === 'right') select(current + 1, true);
      else if (a === 'confirm') {
        select(current, true);
        enabled[selected]?.click();
      } else if (a === 'back') select(0, true);
      else if (a === 'swap') {
        const firstSwap = enabled.findIndex((b) => b.closest('.choice-group--swap') !== null);
        if (firstSwap >= 0) select(firstSwap, true);
      }
    },
  };

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
    ui,
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
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n as StringKey);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
      el.setAttribute('aria-label', t(el.dataset.i18nLabel as StringKey));
    }
    seedLine.textContent = t('battle.seed', { seed: seedFor(controller.getBattleNo()) });
  };

  const applyTextSize = (v: number) => {
    document.documentElement.style.fontSize = `${v}%`;
    textSize.value = String(v);
    textSizeValue.value = `${v}%`;
    textSizeValue.textContent = `${v}%`;
  };
  applyTextSize(readTextSize());
  textSize.addEventListener('input', () => {
    const v = Number(textSize.value);
    applyTextSize(v);
    storeTextSize(v);
    controller.refreshText();
  });

  langSelect.value = getLang();
  langSelect.addEventListener('change', () => {
    setLang(langSelect.value === 'es' ? 'es' : 'en');
    applyStaticText();
    controller.refreshText();
  });

  newBattle.addEventListener('click', () => controller.start());
  // Track the selection when focus moves by Tab or pointer.
  choices.addEventListener('focusin', (e) => {
    const i = enabledButtons().indexOf(e.target as HTMLButtonElement);
    if (i >= 0) select(i, false);
  });
  // On-screen pad buttons must not steal focus from the selected choice.
  dpad.addEventListener('pointerdown', (e) => e.preventDefault());
  dpad.addEventListener('mousedown', (e) => e.preventDefault());

  controller.start();
  applyStaticText();
}

void main();
