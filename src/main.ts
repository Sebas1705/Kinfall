// Page wiring: input -> applyAction -> view.play -> re-render. The sim result is computed and stored
// before any animation starts, so animation state can never change it.
import './styles.css';
import { CONTENT } from './content';
import { detectLang, getLang, setLang, speciesName, t } from './platform/i18n';
import type { StringKey } from './platform/i18n';
import { createInput } from './platform/input';
import type { GameAction } from './platform/input';
import { applyAction, createBattle } from './sim/battle';
import type { Action, BattleEvent, BattleState, Side } from './sim/state';
import { createBattleView } from './view/battleView';
import type { BattleView } from './view/battleView';
import { demoTeams } from './view/demo';
import { buildMenu, logLines, renderMenu } from './view/menu';

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
  let battleNo = 1;
  const currentSeed = () => (battleNo === 1 ? baseSeed : `${baseSeed}#${battleNo}`);

  let state!: BattleState;
  let history: Array<{ prev: BattleState; events: BattleEvent[] }> = [];
  let pending = false;
  let buttons: HTMLButtonElement[] = [];
  let selected = 0;

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
    if (!pending) view?.render(state);
  });

  langSelect.value = getLang();
  langSelect.addEventListener('change', () => {
    setLang(langSelect.value === 'es' ? 'es' : 'en');
    applyStaticText();
    renderLog();
    if (!pending) view?.render(state);
    refreshDom(false);
  });

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

  // ---- text ----
  function applyStaticText(): void {
    document.title = t('app.title');
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n as StringKey);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
      el.setAttribute('aria-label', t(el.dataset.i18nLabel as StringKey));
    }
    seedLine.textContent = t('battle.seed', { seed: currentSeed() });
  }

  function sideSummary(side: Side): string {
    const c = state.teams[side][state.active[side]];
    if (!c) return '';
    const sp = CONTENT.species.find((s) => s.id === c.speciesId);
    if (!sp) return '';
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
  }

  function logEntry(prev: BattleState, events: BattleEvent[]): HTMLElement | null {
    const lines = logLines(prev, events, CONTENT);
    if (lines.length === 0) return null;
    const turn = document.createElement('div');
    turn.className = 'log-turn';
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      turn.append(p);
    }
    return turn;
  }

  function renderLog(): void {
    // Rebuilding (new battle or language change) must not make screen readers reread everything.
    log.setAttribute('aria-live', 'off');
    log.replaceChildren(...history.map((h) => logEntry(h.prev, h.events)).filter((n): n is HTMLElement => n !== null));
    log.scrollTop = log.scrollHeight;
    requestAnimationFrame(() => log.setAttribute('aria-live', 'polite'));
  }

  // ---- menu ----
  const enabledButtons = () => buttons.filter((b) => !b.disabled && b.isConnected);

  function select(index: number, focus: boolean): void {
    const enabled = enabledButtons();
    if (enabled.length === 0) return;
    selected = ((index % enabled.length) + enabled.length) % enabled.length;
    for (const b of buttons) b.classList.toggle('selected', b === enabled[selected]);
    if (focus) enabled[selected]!.focus({ preventScroll: false });
  }

  function refreshDom(moveFocus: boolean): void {
    const hadFocusInMenu = choices.contains(document.activeElement);
    summary.textContent = [sideSummary('player'), sideSummary('enemy')].filter(Boolean).join('\n');
    const model = buildMenu(state, CONTENT);
    prompt.textContent = model.prompt;
    intent.textContent = model.intent ?? '';
    if (model.intent !== null) summary.textContent += `\n${model.intent}`;
    buttons = renderMenu(choices, model, onPick);
    choices.classList.remove('busy');
    choices.removeAttribute('aria-busy');

    const over = state.winner !== null;
    result.hidden = !over;
    if (over) {
      const win = state.winner === 'player';
      resultTitle.textContent = t(win ? 'result.victory' : 'result.defeat');
      resultTitle.className = `result-title ${win ? 'win' : 'lose'}`;
      resultNote.textContent = state.teams.player.some((c) => c.fainted) ? t('battle.lossReminder') : '';
      if (moveFocus) newBattle.focus();
      return;
    }
    select(moveFocus ? 0 : selected, moveFocus || hadFocusInMenu);
  }

  function onPick(action: Action): void {
    if (pending || state.winner !== null) return;
    const prev = state;
    const { state: next, events } = applyAction(prev, action, CONTENT);
    // The new state is final here; the animation below only shows it.
    state = next;
    history.push({ prev, events });
    pending = true;
    choices.classList.add('busy');
    choices.setAttribute('aria-busy', 'true');
    const playing = view ? view.play(events, { reducedMotion }) : Promise.resolve();
    void playing
      .catch((err: unknown) => console.error('animation failed', err))
      .finally(() => {
        pending = false;
        // The log is written when the scene has caught up, so text and picture tell the same story.
        const entry = logEntry(prev, events);
        if (entry) {
          log.append(entry);
          log.scrollTop = log.scrollHeight;
        }
        view?.render(state);
        refreshDom(true);
      });
  }

  function start(): void {
    const { player, enemy } = demoTeams(currentSeed(), CONTENT);
    state = createBattle(currentSeed(), player, enemy, CONTENT, { telegraph: true });
    history = [];
    pending = false;
    applyStaticText();
    renderLog();
    view?.render(state);
    refreshDom(true);
  }

  newBattle.addEventListener('click', () => {
    battleNo += 1;
    start();
  });

  // Track the selection when focus moves by Tab or pointer.
  choices.addEventListener('focusin', (e) => {
    const i = enabledButtons().indexOf(e.target as HTMLButtonElement);
    if (i >= 0) select(i, false);
  });
  // On-screen pad buttons must not steal focus from the selected choice.
  dpad.addEventListener('pointerdown', (e) => e.preventDefault());
  dpad.addEventListener('mousedown', (e) => e.preventDefault());

  const onAction = (a: GameAction) => {
    if (state.winner !== null) {
      if (a === 'confirm' && !result.hidden) newBattle.click();
      return;
    }
    if (pending) return;
    const enabled = enabledButtons();
    if (enabled.length === 0) return;
    const focused = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const current = focused >= 0 ? focused : selected;
    switch (a) {
      case 'up':
      case 'left':
        select(current - 1, true);
        break;
      case 'down':
      case 'right':
        select(current + 1, true);
        break;
      case 'confirm':
        select(current, true);
        enabled[selected]?.click();
        break;
      case 'back': {
        select(0, true);
        break;
      }
      case 'swap': {
        const firstSwap = enabled.findIndex((b) => b.closest('.choice-group--swap') !== null);
        if (firstSwap >= 0) select(firstSwap, true);
        break;
      }
    }
  };
  createInput(document.body, onAction);

  start();
}

void main();

